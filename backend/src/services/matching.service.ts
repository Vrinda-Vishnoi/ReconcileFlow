import { prisma } from '../lib/prisma';
import { createChildLogger } from '../lib/logger';
import { logAuditEntry } from './audit.service';
import { isWithinTolerance } from '../lib/money';
import { emitMatchCreated } from '../lib/socket';

const log = createChildLogger('matching-service');

interface MatchResult {
  totalProcessed: number;
  totalMatched: number;
  totalUnmatched: number;
  totalPartial: number;
  totalDisputed: number;
}

/**
 * 4-tier matching algorithm as specified in §8.5:
 * 1. Exact match: gateway_ref = utr AND amount = amount → MATCHED
 * 2. Fuzzy time-window: amount matches + settled within ±24h → MATCHED (TIME_WINDOW_MATCH)
 * 3. Fee-adjusted: order_amount - gateway_fee ≈ settlement_amount (within 1%) → PARTIAL (FEE_MISMATCH)
 * 4. No match → UNMATCHED (MISSING_GATEWAY or MISSING_SETTLEMENT)
 */
export async function runReconciliation(runId: string): Promise<MatchResult> {
  const result: MatchResult = {
    totalProcessed: 0,
    totalMatched: 0,
    totalUnmatched: 0,
    totalPartial: 0,
    totalDisputed: 0,
  };

  // Get all unmatched bank settlements
  const settlements = await prisma.bankSettlement.findMany({
    where: {
      id: {
        notIn: (
          await prisma.reconciliationMatch.findMany({
            where: { bankSettlementId: { not: null } },
            select: { bankSettlementId: true },
          })
        )
          .map((m) => m.bankSettlementId)
          .filter((id): id is string => id !== null),
      },
    },
  });

  // Get all unmatched gateway transactions
  const gatewayTxns = await prisma.gatewayTransaction.findMany({
    where: {
      status: 'PROCESSED',
      id: {
        notIn: (
          await prisma.reconciliationMatch.findMany({
            where: { gatewayTxnId: { not: null } },
            select: { gatewayTxnId: true },
          })
        )
          .map((m) => m.gatewayTxnId)
          .filter((id): id is string => id !== null),
      },
    },
    include: { order: true },
  });

  log.info(
    { runId, settlements: settlements.length, gatewayTxns: gatewayTxns.length },
    'Starting reconciliation'
  );

  const matchedGatewayIds = new Set<string>();
  const matchedSettlementIds = new Set<string>();

  // Process each settlement
  for (const settlement of settlements) {
    result.totalProcessed++;

    // ── Tier 1: Exact match ──
    const exactMatch = gatewayTxns.find(
      (txn) =>
        !matchedGatewayIds.has(txn.id) &&
        txn.gatewayRef === settlement.utr &&
        txn.amountMinor === settlement.amountMinor
    );

    if (exactMatch) {
      await createMatch({
        runId,
        orderId: exactMatch.orderId,
        gatewayTxnId: exactMatch.id,
        bankSettlementId: settlement.id,
        status: 'MATCHED',
        discrepancyType: null,
        amountDeltaMinor: 0n,
        confidenceScore: 100,
      });
      matchedGatewayIds.add(exactMatch.id);
      matchedSettlementIds.add(settlement.id);
      result.totalMatched++;
      continue;
    }

    // ── Tier 2: Fuzzy time-window match ──
    const timeWindowMs = 24 * 60 * 60 * 1000; // 24 hours
    const fuzzyMatch = gatewayTxns.find((txn) => {
      if (matchedGatewayIds.has(txn.id)) return false;
      if (txn.amountMinor !== settlement.amountMinor) return false;
      const timeDiff = Math.abs(
        settlement.settledAt.getTime() - txn.receivedAt.getTime()
      );
      return timeDiff <= timeWindowMs;
    });

    if (fuzzyMatch) {
      await createMatch({
        runId,
        orderId: fuzzyMatch.orderId,
        gatewayTxnId: fuzzyMatch.id,
        bankSettlementId: settlement.id,
        status: 'MATCHED',
        discrepancyType: 'TIME_WINDOW_MATCH',
        amountDeltaMinor: 0n,
        confidenceScore: 85,
      });
      matchedGatewayIds.add(fuzzyMatch.id);
      matchedSettlementIds.add(settlement.id);
      result.totalMatched++;
      continue;
    }

    // ── Tier 3: Fee-adjusted match ──
    const feeMatch = gatewayTxns.find((txn) => {
      if (matchedGatewayIds.has(txn.id)) return false;
      if (!txn.order) return false;
      // order_amount - gateway_fee ≈ settlement_amount (within 1%)
      const adjustedAmount = txn.order.amountMinor - txn.feeMinor;
      return isWithinTolerance(adjustedAmount, settlement.amountMinor, 1);
    });

    if (feeMatch) {
      const delta = feeMatch.order!.amountMinor - feeMatch.feeMinor - settlement.amountMinor;
      await createMatch({
        runId,
        orderId: feeMatch.orderId,
        gatewayTxnId: feeMatch.id,
        bankSettlementId: settlement.id,
        status: 'PARTIAL',
        discrepancyType: 'FEE_MISMATCH',
        amountDeltaMinor: delta < 0n ? -delta : delta,
        confidenceScore: 95,
      });
      matchedGatewayIds.add(feeMatch.id);
      matchedSettlementIds.add(settlement.id);
      result.totalPartial++;
      continue;
    }

    // ── Tier 4: No match ──
    await createMatch({
      runId,
      orderId: null,
      gatewayTxnId: null,
      bankSettlementId: settlement.id,
      status: 'UNMATCHED',
      discrepancyType: 'MISSING_GATEWAY',
      amountDeltaMinor: settlement.amountMinor,
      confidenceScore: 0,
    });
    result.totalUnmatched++;
  }

  // Find unmatched gateway transactions (no corresponding settlement)
  for (const txn of gatewayTxns) {
    if (matchedGatewayIds.has(txn.id)) continue;

    result.totalProcessed++;
    await createMatch({
      runId,
      orderId: txn.orderId,
      gatewayTxnId: txn.id,
      bankSettlementId: null,
      status: 'UNMATCHED',
      discrepancyType: 'MISSING_SETTLEMENT',
      amountDeltaMinor: txn.amountMinor,
      confidenceScore: 0,
    });
    result.totalUnmatched++;
  }

  log.info({ runId, ...result }, 'Reconciliation complete');
  return result;
}

// ── Helper to create a match + audit entry ──

interface CreateMatchParams {
  runId: string;
  orderId: string | null;
  gatewayTxnId: string | null;
  bankSettlementId: string | null;
  status: 'MATCHED' | 'UNMATCHED' | 'PARTIAL' | 'DISPUTED';
  discrepancyType: string | null;
  amountDeltaMinor: bigint;
  confidenceScore: number;
}

async function createMatch(params: CreateMatchParams) {
  const match = await prisma.reconciliationMatch.create({
    data: {
      runId: params.runId,
      orderId: params.orderId,
      gatewayTxnId: params.gatewayTxnId,
      bankSettlementId: params.bankSettlementId,
      status: params.status,
      discrepancyType: params.discrepancyType,
      amountDeltaMinor: params.amountDeltaMinor,
      confidenceScore: params.confidenceScore,
    },
  });

  // Write audit log entry for every decision
  await logAuditEntry({
    actor: 'system',
    action: 'MATCH_CREATED',
    entityType: 'ReconciliationMatch',
    entityId: match.id,
    after: {
      status: params.status,
      discrepancyType: params.discrepancyType,
      orderId: params.orderId,
      gatewayTxnId: params.gatewayTxnId,
      bankSettlementId: params.bankSettlementId,
    },
  });

  // Emit real-time event
  emitMatchCreated({
    matchId: match.id,
    status: params.status,
    runId: params.runId,
  });

  return match;
}

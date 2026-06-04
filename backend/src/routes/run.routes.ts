import { Router, Request, Response } from 'express';
import { BankSettlement, GatewayTransaction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { createChildLogger } from '../lib/logger';
import { enqueueJob } from '../queue/queue';
import { createDemoScenario, DemoMode } from '../services/demo-scenario.service';


const log = createChildLogger('run-routes');
const router = Router();

router.use(authenticate);

// ── GET /api/runs/summary ──

router.get('/summary', async (_req: Request, res: Response) => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Overall totals
    const [totalMatched, totalPartial, totalUnmatched, totalDisputed] = await Promise.all([
      prisma.reconciliationMatch.count({ where: { status: 'MATCHED' } }),
      prisma.reconciliationMatch.count({ where: { status: 'PARTIAL' } }),
      prisma.reconciliationMatch.count({ where: { status: 'UNMATCHED' } }),
      prisma.reconciliationMatch.count({ where: { status: 'DISPUTED' } }),
    ]);

    // Last 7 days daily breakdown
    const runs = await prisma.reconciliationRun.findMany({
      where: { startedAt: { gte: sevenDaysAgo } },
      orderBy: { startedAt: 'asc' },
      select: {
        startedAt: true,
        totalMatched: true,
        totalUnmatched: true,
        totalPartial: true,
        totalDisputed: true,
      },
    });

    // Group by day - initialize last 7 days with zeros
    const dailyMap: Record<string, { matched: number; unmatched: number; partial: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dailyMap[d.toISOString().split('T')[0]] = { matched: 0, unmatched: 0, partial: 0 };
    }
    
    for (const run of runs) {
      const day = run.startedAt.toISOString().split('T')[0];
      if (!dailyMap[day]) dailyMap[day] = { matched: 0, unmatched: 0, partial: 0 };
      dailyMap[day].matched += run.totalMatched;
      dailyMap[day].unmatched += run.totalUnmatched;
      dailyMap[day].partial += run.totalPartial;
    }

    const trend = Object.entries(dailyMap).map(([date, counts]) => ({ date, ...counts }));

    res.json({
      totals: {
        matched: totalMatched,
        partial: totalPartial,
        unmatched: totalUnmatched,
        disputed: totalDisputed,
        total: totalMatched + totalPartial + totalUnmatched + totalDisputed,
      },
      trend,
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to get summary');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/runs ──

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const [runs, total] = await Promise.all([
      prisma.reconciliationRun.findMany({
        orderBy: { startedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.reconciliationRun.count(),
    ]);

    res.json({
      runs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to list runs');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/runs/:id ──

router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const run = await prisma.reconciliationRun.findUnique({
      where: { id: req.params.id },
      include: {
        matches: {
          take: 100, // Just return first 100 for overview
          orderBy: { reconciledAt: 'desc' },
          include: {
            order: true,
          }
        },
      },
    });

    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const gatewayTxnIds = run.matches
      .map((match) => match.gatewayTxnId)
      .filter((id): id is string => id !== null);
    const bankSettlementIds = run.matches
      .map((match) => match.bankSettlementId)
      .filter((id): id is string => id !== null);

    const [gatewayTxns, bankSettlements] = await Promise.all([
      prisma.gatewayTransaction.findMany({
        where: { id: { in: gatewayTxnIds } },
      }),
      prisma.bankSettlement.findMany({
        where: { id: { in: bankSettlementIds } },
      }),
    ]);

    const gatewayTxnById = new Map(gatewayTxns.map((txn) => [txn.id, txn]));
    const bankSettlementById = new Map(bankSettlements.map((settlement) => [settlement.id, settlement]));

    // Serialize BigInts
    const serializedRun = {
      ...run,
      matches: run.matches.map((m) => ({
        ...m,
        amountDeltaMinor: m.amountDeltaMinor?.toString(),
        order: m.order ? {
          ...m.order,
          amountMinor: m.order.amountMinor.toString()
        } : null,
        gatewayTxn: m.gatewayTxnId ? serializeGatewayTxn(gatewayTxnById.get(m.gatewayTxnId)) : null,
        bankSettlement: m.bankSettlementId
          ? serializeBankSettlement(bankSettlementById.get(m.bankSettlementId))
          : null,
      })),
    };

    res.json(serializedRun);
  } catch (error) {
    log.error({ err: error }, 'Failed to get run');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/runs/generate-settlement ──
// Utility endpoint to trigger settlement generation and queue a run

router.post('/generate-settlement', async (req: Request, res: Response) => {
  try {
    const csvDir = process.env.SETTLEMENT_CSV_PATH || './data/settlements';
    const requestedMode = req.body?.mode as DemoMode | undefined;
    const mode: DemoMode =
      requestedMode === 'demo' || requestedMode === 'stress' || requestedMode === 'quick'
        ? requestedMode
        : 'quick';
    const scenario = await createDemoScenario(csvDir, mode);

    // Create a run record
    const run = await prisma.reconciliationRun.create({
      data: {
        source: `demo:${mode}`,
        status: 'PENDING',
      },
    });

    // Enqueue the job
    await enqueueJob({
      type: 'settlement',
      payload: { filePath: scenario.filePath },
      runId: run.id,
    });

    res.status(202).json({
      message: 'Settlement generation and reconciliation triggered',
      runId: run.id,
      mode,
      rowCount: scenario.rowCount,
      profile: scenario.profile,
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to trigger settlement run');
    res.status(500).json({ error: 'Internal server error' });
  }
});

function serializeGatewayTxn(txn: GatewayTransaction | undefined) {
  if (!txn) return null;
  return {
    ...txn,
    amountMinor: txn.amountMinor.toString(),
    feeMinor: txn.feeMinor.toString(),
  };
}

function serializeBankSettlement(
  settlement: BankSettlement | undefined
) {
  if (!settlement) return null;
  return {
    ...settlement,
    amountMinor: settlement.amountMinor.toString(),
  };
}

export default router;

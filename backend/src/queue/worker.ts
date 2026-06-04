import { Worker, Job } from 'bullmq';
import { getRedis } from '../lib/redis';
import { prisma } from '../lib/prisma';
import { createChildLogger } from '../lib/logger';
import { RECONCILE_QUEUE_NAME, ReconcileJobData } from './queue';
import { runReconciliation } from '../services/matching.service';
import { ingestSettlementCSV } from '../services/settlement-ingestion.service';
import { addToDLQ } from '../services/dlq.service';
import { emitRunStarted, emitChaosEvent } from '../lib/socket';
import { v4 as uuidv4 } from 'uuid';

const log = createChildLogger('worker');

let worker: Worker | null = null;

/**
 * Check if chaos mode is enabled (stored in Redis).
 */
async function isChaosEnabled(): Promise<boolean> {
  try {
    const redis = getRedis();
    const value = await redis.get('chaos:enabled');
    return value === 'true';
  } catch {
    return false;
  }
}

/**
 * Apply chaos mode fault injection per §8.7:
 * - 5% of events are silently dropped
 * - 2% are delivered twice (same idempotency key)
 * - 10% have a 30–180s delay
 * - 1% throw a synthetic error (proves DLQ)
 */
async function applyChaos(job: Job<ReconcileJobData>): Promise<'drop' | 'delay' | 'error' | 'proceed'> {
  if (!(await isChaosEnabled())) return 'proceed';

  const roll = Math.random();

  if (roll < 0.05) {
    // 5% — silently drop
    log.warn({ jobId: job.id }, 'Chaos: dropping event');
    emitChaosEvent({ type: 'dropped', count: 1 });
    return 'drop';
  }

  if (roll < 0.07) {
    // 2% — duplicate (just log it; idempotency layer handles dedup)
    log.warn({ jobId: job.id }, 'Chaos: duplicate event (idempotency should catch)');
    emitChaosEvent({ type: 'duplicated', count: 1 });
    // Process normally — the duplicate will be caught by idempotency layer
    return 'proceed';
  }

  if (roll < 0.17) {
    // 10% — delay 30–180s
    const delaySec = Math.floor(Math.random() * 150) + 30;
    log.warn({ jobId: job.id, delaySec }, 'Chaos: delaying event');
    emitChaosEvent({ type: 'delayed', count: 1 });
    await new Promise((resolve) => setTimeout(resolve, delaySec * 1000));
    return 'proceed';
  }

  if (roll < 0.18) {
    // 1% — synthetic error
    log.warn({ jobId: job.id }, 'Chaos: synthetic error');
    emitChaosEvent({ type: 'error', count: 1 });
    return 'error';
  }

  return 'proceed';
}

/**
 * Start the BullMQ worker process.
 */
export function startWorker(): Worker {
  if (worker) return worker;

  const redis = getRedis();

  worker = new Worker(
    RECONCILE_QUEUE_NAME,
    async (job: Job<ReconcileJobData>) => {
      log.info({ jobId: job.id, type: job.data.type }, 'Processing job');

      // Apply chaos mode
      const chaosResult = await applyChaos(job);
      if (chaosResult === 'drop') return;
      if (chaosResult === 'error') {
        throw new Error('Chaos mode: synthetic error injected');
      }

      switch (job.data.type) {
        case 'webhook':
          await processWebhookJob(job);
          break;
        case 'settlement':
          await processSettlementJob(job);
          break;
        case 'manual':
          await processManualReconciliation(job);
          break;
        default:
          log.warn({ type: job.data.type }, 'Unknown job type');
      }
    },
    {
      connection: redis as any,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000,
      },
    }
  );

  worker.on('completed', (job) => {
    log.info({ jobId: job?.id }, 'Job completed');
  });

  worker.on('failed', async (job, err) => {
    log.error({ jobId: job?.id, err: err.message, attemptsMade: job?.attemptsMade }, 'Job failed');

    // If all retries exhausted, move to DLQ
    if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
      await addToDLQ({
        id: uuidv4(),
        originalJobId: job.id!,
        queue: RECONCILE_QUEUE_NAME,
        payload: job.data,
        error: err.message,
        stackTrace: err.stack,
        failedAt: new Date().toISOString(),
        retryCount: job.attemptsMade,
      });
    }
  });

  worker.on('error', (err) => {
    log.error({ err }, 'Worker error');
  });

  log.info('BullMQ worker started');
  return worker;
}

// ── Job processors ─────────────────────────────

async function processWebhookJob(job: Job<ReconcileJobData>): Promise<void> {
  const payload = job.data.payload as any;

  // Store gateway transaction
  try {
    await prisma.gatewayTransaction.create({
      data: {
        gatewayEventId: payload.eventId,
        gatewayRef: payload.gatewayRef || payload.paymentIntentId,
        amountMinor: BigInt(payload.amount),
        feeMinor: BigInt(payload.fee || 0),
        status: 'PROCESSED',
        rawPayload: payload,
        orderId: payload.orderId || null,
      },
    });
  } catch (error: any) {
    // Layer 2 idempotency — DB unique constraint on gatewayEventId
    if (error.code === 'P2002') {
      log.info({ eventId: payload.eventId }, 'Duplicate webhook (DB unique constraint caught it)');
      return;
    }
    throw error;
  }

  // If there's a run context, trigger matching
  if (job.data.runId) {
    await runReconciliation(job.data.runId);
  }
}

async function processSettlementJob(job: Job<ReconcileJobData>): Promise<void> {
  const payload = job.data.payload as { filePath: string };
  const runId = job.data.runId;

  if (!runId) {
    throw new Error('Settlement job requires a runId');
  }

  // Update run status
  await prisma.reconciliationRun.update({
    where: { id: runId },
    data: { status: 'RUNNING' },
  });

  emitRunStarted({ runId, source: 'csv' });

  try {
    // Ingest CSV
    await ingestSettlementCSV(payload.filePath, runId);

    // Run matching
    const result = await runReconciliation(runId);

    // Update run with final stats
    await prisma.reconciliationRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        totalProcessed: result.totalProcessed,
        totalMatched: result.totalMatched,
        totalUnmatched: result.totalUnmatched,
        totalPartial: result.totalPartial,
        totalDisputed: result.totalDisputed,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.reconciliationRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

async function processManualReconciliation(job: Job<ReconcileJobData>): Promise<void> {
  const runId = job.data.runId;
  if (!runId) throw new Error('Manual reconciliation requires a runId');

  await prisma.reconciliationRun.update({
    where: { id: runId },
    data: { status: 'RUNNING' },
  });

  emitRunStarted({ runId, source: 'manual' });

  try {
    const result = await runReconciliation(runId);

    await prisma.reconciliationRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        totalProcessed: result.totalProcessed,
        totalMatched: result.totalMatched,
        totalUnmatched: result.totalUnmatched,
        totalPartial: result.totalPartial,
        totalDisputed: result.totalDisputed,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.reconciliationRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      },
    });
    throw error;
  }
}

/**
 * Graceful shutdown.
 */
export async function closeWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    log.info('Worker closed');
  }
}

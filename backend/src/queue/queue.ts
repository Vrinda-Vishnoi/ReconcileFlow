import { Queue, QueueEvents } from 'bullmq';
import { getRedis } from '../lib/redis';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('queue');

let reconcileQueue: Queue | null = null;
let queueEvents: QueueEvents | null = null;

export const RECONCILE_QUEUE_NAME = 'reconcile-jobs';

export interface ReconcileJobData {
  type: 'webhook' | 'settlement' | 'manual';
  payload: unknown;
  runId?: string;
}

/**
 * Get or create the BullMQ queue for reconciliation jobs.
 */
export function getQueue(): Queue {
  if (reconcileQueue) return reconcileQueue;

  const redis = getRedis();

  reconcileQueue = new Queue(RECONCILE_QUEUE_NAME, {
    connection: redis as any,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000, // 1s, 5s, 25s
      },
      removeOnComplete: {
        age: 86400, // keep completed jobs for 24h
        count: 1000,
      },
      removeOnFail: false, // keep failed jobs for DLQ inspection
    },
  });

  reconcileQueue.on('error', (err) => {
    log.error({ err }, 'Queue error');
  });

  log.info('BullMQ reconcile queue initialized');
  return reconcileQueue;
}

/**
 * Get queue events (for monitoring).
 */
export function getQueueEvents(): QueueEvents {
  if (queueEvents) return queueEvents;

  const redis = getRedis();
  queueEvents = new QueueEvents(RECONCILE_QUEUE_NAME, {
    connection: redis as any,
  });

  return queueEvents;
}

/**
 * Add a job to the reconciliation queue.
 */
export async function enqueueJob(data: ReconcileJobData): Promise<string> {
  const queue = getQueue();
  const job = await queue.add(data.type, data, {
    jobId: data.type === 'webhook' ? `webhook-${Date.now()}-${Math.random().toString(36).slice(2)}` : undefined,
  });

  log.debug({ jobId: job.id, type: data.type }, 'Job enqueued');
  return job.id!;
}

/**
 * Get queue stats for health endpoint.
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  try {
    const queue = getQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);
    return { waiting, active, completed, failed, delayed };
  } catch {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }
}

/**
 * Graceful shutdown.
 */
export async function closeQueue(): Promise<void> {
  if (reconcileQueue) {
    await reconcileQueue.close();
    log.info('Queue closed');
  }
  if (queueEvents) {
    await queueEvents.close();
  }
}

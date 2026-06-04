import { getRedis } from '../lib/redis';
import { createChildLogger } from '../lib/logger';
import { logAuditEntry } from './audit.service';
import { emitDLQItemAdded } from '../lib/socket';

const log = createChildLogger('dlq-service');

const DLQ_KEY_PREFIX = 'dlq:item:';
const DLQ_LIST_KEY = 'dlq:items';

export interface DLQItem {
  id: string;
  originalJobId: string;
  queue: string;
  payload: unknown;
  error: string;
  stackTrace?: string;
  failedAt: string;
  retryCount: number;
  status: 'pending' | 'replayed' | 'dismissed';
}

/**
 * Add a failed job to the Dead Letter Queue.
 * Called by BullMQ when a job exhausts all retries.
 */
export async function addToDLQ(item: Omit<DLQItem, 'status'>): Promise<void> {
  const redis = getRedis();
  const dlqItem: DLQItem = { ...item, status: 'pending' };

  await redis.set(
    `${DLQ_KEY_PREFIX}${item.id}`,
    JSON.stringify(dlqItem)
  );
  await redis.lpush(DLQ_LIST_KEY, item.id);

  log.warn({ dlqItemId: item.id, error: item.error }, 'Job added to DLQ');

  emitDLQItemAdded({
    itemId: item.id,
    reason: item.error,
  });
}

/**
 * List DLQ items with pagination.
 */
export async function listDLQItems(page: number = 1, limit: number = 20) {
  const redis = getRedis();
  
  // LRANGE is 0-indexed and inclusive, so start = (page-1)*limit, end = start + limit - 1
  const start = (page - 1) * limit;
  const end = start + limit - 1;
  
  const [ids, total] = await Promise.all([
    redis.lrange(DLQ_LIST_KEY, start, end),
    redis.llen(DLQ_LIST_KEY)
  ]);

  const items: DLQItem[] = [];
  if (ids.length > 0) {
    for (const id of ids) {
      const data = await redis.get(`${DLQ_KEY_PREFIX}${id}`);
      if (data) {
        items.push(JSON.parse(data));
      }
    }
  }

  // They are already in order in the list since we use LPUSH, but let's ensure sorting just in case
  const sorted = items.sort(
    (a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime()
  );

  return {
    data: sorted,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get a single DLQ item by ID.
 */
export async function getDLQItem(id: string): Promise<DLQItem | null> {
  const redis = getRedis();
  const data = await redis.get(`${DLQ_KEY_PREFIX}${id}`);
  return data ? JSON.parse(data) : null;
}

/**
 * Mark a DLQ item as replayed (requeued to primary queue).
 */
export async function markAsReplayed(id: string): Promise<DLQItem | null> {
  const item = await getDLQItem(id);
  if (!item) return null;

  item.status = 'replayed';
  const redis = getRedis();
  await redis.set(`${DLQ_KEY_PREFIX}${id}`, JSON.stringify(item));

  await logAuditEntry({
    actor: 'system',
    action: 'DLQ_REPLAYED',
    entityType: 'DLQItem',
    entityId: id,
    after: { status: 'replayed', originalJobId: item.originalJobId },
  });

  return item;
}

/**
 * Mark a DLQ item as dismissed (won't-fix).
 */
export async function dismissDLQItem(id: string, userId: string): Promise<DLQItem | null> {
  const item = await getDLQItem(id);
  if (!item) return null;

  item.status = 'dismissed';
  const redis = getRedis();
  await redis.set(`${DLQ_KEY_PREFIX}${id}`, JSON.stringify(item));

  await logAuditEntry({
    actor: userId,
    action: 'DLQ_DISMISSED',
    entityType: 'DLQItem',
    entityId: id,
    before: { status: 'pending' },
    after: { status: 'dismissed' },
    reason: 'Marked as won\'t-fix by operator',
  });

  log.info({ dlqItemId: id, userId }, 'DLQ item dismissed');
  return item;
}

import crypto from 'crypto';
import { getRedis } from '../lib/redis';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('idempotency');

const IDEMPOTENCY_TTL = 86400; // 24 hours in seconds

/**
 * Generate an idempotency key from gateway event ID and amount.
 * key = sha256(gateway_event_id + ":" + amount)
 */
export function generateIdempotencyKey(gatewayEventId: string, amount: string | number): string {
  return crypto
    .createHash('sha256')
    .update(`${gatewayEventId}:${amount}`)
    .digest('hex');
}

/**
 * Layer 1 — Redis fast path.
 * Attempt SET key 1 NX EX 86400. If key exists, return true (duplicate).
 * Sub-ms duplicate detection.
 */
export async function checkIdempotency(gatewayEventId: string, amount: string | number): Promise<boolean> {
  const key = `idempotency:${generateIdempotencyKey(gatewayEventId, amount)}`;

  try {
    const redis = getRedis();
    const result = await redis.set(key, '1', 'EX', IDEMPOTENCY_TTL, 'NX');

    if (result === null) {
      // Key already exists — this is a duplicate
      log.info({ gatewayEventId }, 'Duplicate webhook detected (Redis layer)');
      return true;
    }

    // Key was set — this is a new event
    return false;
  } catch (error) {
    // Redis failure — fall through to DB layer (Layer 2)
    log.warn({ err: error, gatewayEventId }, 'Redis idempotency check failed — relying on DB unique constraint');
    return false;
  }
}

/**
 * Remove an idempotency key (used if processing fails and we want to allow retry).
 */
export async function removeIdempotencyKey(gatewayEventId: string, amount: string | number): Promise<void> {
  const key = `idempotency:${generateIdempotencyKey(gatewayEventId, amount)}`;
  try {
    const redis = getRedis();
    await redis.del(key);
  } catch (error) {
    log.warn({ err: error }, 'Failed to remove idempotency key');
  }
}

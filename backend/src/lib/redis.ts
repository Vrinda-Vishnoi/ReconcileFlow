import Redis from 'ioredis';
import { createChildLogger } from './logger';

const log = createChildLogger('redis');

// In-memory fallback when Redis is unavailable (dev mode)
class InMemoryStore {
  private store = new Map<string, { value: string; expiresAt: number | null }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<'OK' | null> {
    if (mode === 'NX' && this.store.has(key)) {
      const existing = this.store.get(key)!;
      if (!existing.expiresAt || Date.now() < existing.expiresAt) {
        return null;
      }
    }
    this.store.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl * 1000 : null,
    });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  async ping(): Promise<string> {
    return 'PONG';
  }
}

let redis: Redis | null = null;
let inMemoryFallback: InMemoryStore | null = null;
let usingFallback = false;

export function getRedis(): Redis {
  if (redis) return redis;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: true,
      retryStrategy(times: number) {
        if (times > 3) {
          log.warn('Redis connection failed after 3 retries, using in-memory fallback');
          return null; // stop retrying
        }
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('connect', () => {
      log.info('Redis connected');
      usingFallback = false;
    });

    redis.on('error', (err) => {
      log.warn({ err: err.message }, 'Redis error — falling back to in-memory store');
      usingFallback = true;
    });

    return redis;
  } catch {
    log.warn('Redis unavailable — using in-memory fallback');
    usingFallback = true;
    // Return a proxy that delegates to in-memory store
    return getInMemoryProxy();
  }
}

function getInMemoryProxy(): Redis {
  if (!inMemoryFallback) {
    inMemoryFallback = new InMemoryStore();
  }
  // Cast InMemoryStore as Redis — it implements the methods we use
  return inMemoryFallback as unknown as Redis;
}

export function isUsingFallback(): boolean {
  return usingFallback;
}

// Health check
export async function checkRedisHealth(): Promise<{
  connected: boolean;
  usingFallback: boolean;
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    const client = getRedis();
    await client.ping();
    return {
      connected: true,
      usingFallback,
      latencyMs: Date.now() - start,
    };
  } catch {
    return {
      connected: false,
      usingFallback: true,
      latencyMs: Date.now() - start,
    };
  }
}

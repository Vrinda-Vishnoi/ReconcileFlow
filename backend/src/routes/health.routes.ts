import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../lib/prisma';
import { checkRedisHealth } from '../lib/redis';
import { getQueueStats } from '../queue/queue';
import { createChildLogger } from '../lib/logger';
import { register as promRegister, collectDefaultMetrics, Counter, Histogram } from 'prom-client';

const log = createChildLogger('health-routes');
const router = Router();

// ── Prometheus metrics ──
collectDefaultMetrics();

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

export const webhooksReceivedTotal = new Counter({
  name: 'webhooks_received_total',
  help: 'Total webhooks received',
  labelNames: ['type', 'status'],
});

export const reconciliationMatchesTotal = new Counter({
  name: 'reconciliation_matches_total',
  help: 'Total reconciliation matches',
  labelNames: ['status', 'discrepancy_type'],
});

export const chaosEventsTotal = new Counter({
  name: 'chaos_events_total',
  help: 'Total chaos events injected',
  labelNames: ['type'],
});

// ── GET /api/health ──

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const [db, redis, queue] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
      getQueueStats(),
    ]);

    const isHealthy = db.connected;

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
      checks: {
        database: {
          status: db.connected ? 'connected' : 'disconnected',
          latencyMs: db.latencyMs,
        },
        redis: {
          status: redis.connected ? 'connected' : 'disconnected',
          usingFallback: redis.usingFallback,
          latencyMs: redis.latencyMs,
        },
        queue: {
          waiting: queue.waiting,
          active: queue.active,
          completed: queue.completed,
          failed: queue.failed,
          delayed: queue.delayed,
        },
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Health check error');
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

// ── GET /metrics ──

router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', promRegister.contentType);
    const metrics = await promRegister.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end();
  }
});

export default router;

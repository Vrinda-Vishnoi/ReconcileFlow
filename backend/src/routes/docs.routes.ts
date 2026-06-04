import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/docs
 * Returns a JSON listing of all API endpoints with methods, descriptions,
 * authentication requirements, and example payloads.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'ReconcileFlow API',
    version: '1.0.0',
    description: 'Payment reconciliation engine API documentation',
    baseUrl: '/api',
    endpoints: [
      // ── Health ──
      {
        method: 'GET',
        path: '/api/health',
        description: 'Health check — database, Redis, and queue status',
        auth: false,
      },
      {
        method: 'GET',
        path: '/metrics',
        description: 'Prometheus-format metrics endpoint',
        auth: false,
      },

      // ── Auth ──
      {
        method: 'POST',
        path: '/api/auth/register',
        description: 'Register a new user account',
        auth: false,
        body: {
          email: 'user@example.com',
          password: 'securePassword123',
          name: 'John Doe',
        },
      },
      {
        method: 'POST',
        path: '/api/auth/login',
        description: 'Log in and receive a JWT token',
        auth: false,
        body: {
          email: 'user@example.com',
          password: 'securePassword123',
        },
      },

      // ── Orders ──
      {
        method: 'GET',
        path: '/api/orders',
        description: 'List all orders with pagination',
        auth: true,
        query: { page: 1, limit: 20, status: 'PAID' },
      },
      {
        method: 'POST',
        path: '/api/orders',
        description: 'Create a new order and trigger Stripe PaymentIntent',
        auth: true,
        body: {
          amountMinor: 50000,
          currency: 'INR',
          customerEmail: 'customer@example.com',
          description: 'Test order',
        },
      },
      {
        method: 'GET',
        path: '/api/orders/:id',
        description: 'Get order details with gateway transactions and matches',
        auth: true,
      },

      // ── Reconciliation Runs ──
      {
        method: 'GET',
        path: '/api/runs',
        description: 'List all reconciliation runs with pagination',
        auth: true,
        query: { page: 1, limit: 20 },
      },
      {
        method: 'GET',
        path: '/api/runs/summary',
        description: 'Get reconciliation summary stats and 7-day trend data',
        auth: true,
      },
      {
        method: 'GET',
        path: '/api/runs/:id',
        description: 'Get run details including matched records',
        auth: true,
      },
      {
        method: 'POST',
        path: '/api/runs/generate-settlement',
        description: 'Generate a settlement CSV and trigger a reconciliation run',
        auth: true,
      },

      // ── Matches ──
      {
        method: 'GET',
        path: '/api/matches',
        description: 'List reconciliation matches with filters',
        auth: true,
        query: { page: 1, limit: 20, status: 'UNMATCHED', runId: '<uuid>' },
      },
      {
        method: 'POST',
        path: '/api/matches/:id/resolve',
        description: 'Manually resolve a mismatched record',
        auth: true,
        body: { reason: 'Manual verification confirmed amount is correct' },
      },

      // ── Dead Letter Queue ──
      {
        method: 'GET',
        path: '/api/dlq',
        description: 'List DLQ items with pagination',
        auth: true,
        query: { page: 1, limit: 20 },
      },
      {
        method: 'GET',
        path: '/api/dlq/:id',
        description: 'Get a single DLQ item by ID',
        auth: true,
      },
      {
        method: 'POST',
        path: '/api/dlq/:id/replay',
        description: 'Replay a failed job from the DLQ',
        auth: true,
      },
      {
        method: 'DELETE',
        path: '/api/dlq/:id',
        description: 'Dismiss a DLQ item (mark as won\'t-fix)',
        auth: true,
      },

      // ── Audit Log ──
      {
        method: 'GET',
        path: '/api/audit',
        description: 'Query the immutable audit log with filters',
        auth: true,
        query: {
          entityType: 'Order',
          action: 'ORDER_CREATED',
          from: '2024-01-01T00:00:00Z',
          page: 1,
          limit: 50,
        },
      },

      // ── Chaos Mode ──
      {
        method: 'GET',
        path: '/api/chaos/status',
        description: 'Get current chaos mode status',
        auth: true,
      },
      {
        method: 'POST',
        path: '/api/chaos/toggle',
        description: 'Toggle chaos mode on/off (simulates failures)',
        auth: true,
      },

      // ── Webhooks ──
      {
        method: 'POST',
        path: '/webhooks/stripe',
        description: 'Stripe webhook endpoint (raw body parsing)',
        auth: false,
        note: 'Verified via Stripe signature',
      },

      // ── Documentation ──
      {
        method: 'GET',
        path: '/api/docs',
        description: 'This endpoint — API documentation listing',
        auth: false,
      },
    ],
  });
});

export default router;

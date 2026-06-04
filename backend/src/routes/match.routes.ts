import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { createChildLogger } from '../lib/logger';
import { logAuditEntry } from '../services/audit.service';

const log = createChildLogger('match-routes');
const router = Router();

router.use(authenticate);

// ── GET /api/matches ──

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const status = req.query.status as string;
    const runId = req.query.runId as string;

    const where: any = {};
    if (status) where.status = status;
    if (runId) where.runId = runId;

    const [matches, total] = await Promise.all([
      prisma.reconciliationMatch.findMany({
        where,
        orderBy: { reconciledAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          order: true,
        },
      }),
      prisma.reconciliationMatch.count({ where }),
    ]);

    // Serialize BigInts
    const serialized = matches.map((m) => ({
      ...m,
      amountDeltaMinor: m.amountDeltaMinor?.toString(),
      order: m.order
        ? { ...m.order, amountMinor: m.order.amountMinor.toString() }
        : null,
    }));

    res.json({
      data: serialized,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to list matches');
    res.status(500).json({ error: 'Internal server error' });
  }
});

const resolveSchema = z.object({
  reason: z.string().min(5, 'A resolution reason must be provided (at least 5 chars)'),
});

// ── POST /api/matches/:id/resolve ──

router.post('/:id/resolve', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const parsed = resolveSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.issues,
      });
      return;
    }

    const matchId = req.params.id;
    const { reason } = parsed.data;

    // Check if match exists and is not already resolved
    const match = await prisma.reconciliationMatch.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    if (match.status === 'RESOLVED' || match.status === 'MATCHED') {
      res.status(400).json({ error: `Cannot resolve a match in ${match.status} state` });
      return;
    }

    // Update match
    const updatedMatch = await prisma.reconciliationMatch.update({
      where: { id: matchId },
      data: {
        status: 'RESOLVED',
        resolvedBy: req.user!.userId,
        resolvedReason: reason,
      },
    });

    // Write audit log
    await logAuditEntry({
      actor: req.user!.userId,
      action: 'MANUAL_RESOLVE',
      entityType: 'ReconciliationMatch',
      entityId: matchId,
      before: { status: match.status },
      after: { status: 'RESOLVED', resolvedReason: reason },
      reason,
    });

    await refreshRunStats(match.runId);

    res.json({
      message: 'Match resolved successfully',
      match: {
        ...updatedMatch,
        amountDeltaMinor: updatedMatch.amountDeltaMinor?.toString(),
      },
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to resolve match');
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function refreshRunStats(runId: string) {
  const counts = await prisma.reconciliationMatch.groupBy({
    by: ['status'],
    where: { runId },
    _count: { _all: true },
  });

  const countByStatus = new Map(counts.map((item) => [item.status, item._count._all]));

  await prisma.reconciliationRun.update({
    where: { id: runId },
    data: {
      totalMatched: countByStatus.get('MATCHED') ?? 0,
      totalPartial: countByStatus.get('PARTIAL') ?? 0,
      totalUnmatched: countByStatus.get('UNMATCHED') ?? 0,
      totalDisputed: countByStatus.get('DISPUTED') ?? 0,
      totalProcessed: counts.reduce((total, item) => total + item._count._all, 0),
    },
  });
}

export default router;

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { createChildLogger } from '../lib/logger';
import { listDLQItems, getDLQItem, markAsReplayed, dismissDLQItem } from '../services/dlq.service';
import { enqueueJob } from '../queue/queue';

const log = createChildLogger('dlq-routes');
const router = Router();

router.use(authenticate);

// ── GET /api/dlq ──

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const items = await listDLQItems(page, limit);
    res.json(items);
  } catch (error) {
    log.error({ err: error }, 'Failed to list DLQ items');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/dlq/:id ──

router.get('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const item = await getDLQItem(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'DLQ item not found' });
      return;
    }
    res.json(item);
  } catch (error) {
    log.error({ err: error }, 'Failed to get DLQ item');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/dlq/:id/replay ──

router.post('/:id/replay', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const item = await getDLQItem(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'DLQ item not found' });
      return;
    }

    if (item.status !== 'pending') {
      res.status(400).json({ error: `Cannot replay item in ${item.status} state` });
      return;
    }

    // Re-enqueue the job
    await enqueueJob(item.payload as any);

    // Mark as replayed
    await markAsReplayed(req.params.id);

    res.json({ message: 'Job successfully requeued' });
  } catch (error) {
    log.error({ err: error }, 'Failed to replay DLQ item');
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/dlq/:id ──

router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
  try {
    const item = await dismissDLQItem(req.params.id, req.user!.userId);
    if (!item) {
      res.status(404).json({ error: 'DLQ item not found' });
      return;
    }

    res.json({ message: 'Item dismissed', item });
  } catch (error) {
    log.error({ err: error }, 'Failed to dismiss DLQ item');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

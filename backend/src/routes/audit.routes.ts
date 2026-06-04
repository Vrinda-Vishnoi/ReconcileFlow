import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { createChildLogger } from '../lib/logger';
import { getAuditEntries } from '../services/audit.service';

const log = createChildLogger('audit-routes');
const router = Router();

router.use(authenticate);

// ── GET /api/audit ──

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    const filters: any = { page, limit };
    
    if (req.query.entityType) filters.entityType = req.query.entityType;
    if (req.query.entityId) filters.entityId = req.query.entityId;
    if (req.query.actor) filters.actor = req.query.actor;
    if (req.query.action) filters.action = req.query.action;
    
    if (req.query.from) filters.from = new Date(req.query.from as string);
    if (req.query.to) filters.to = new Date(req.query.to as string);

    const result = await getAuditEntries(filters);
    res.json(result);
  } catch (error) {
    log.error({ err: error }, 'Failed to get audit entries');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { createChildLogger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import { emitChaosEvent } from '../lib/socket';

const log = createChildLogger('chaos-routes');
const router = Router();

// Allow reading chaos mode state without auth for demo dashboard
router.get('/state', async (_req: Request, res: Response) => {
  try {
    const redis = getRedis();
    const value = await redis.get('chaos:enabled');
    res.json({ enabled: value === 'true' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get chaos state' });
  }
});

// Toggle requires auth
router.post('/toggle', authenticate, async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be a boolean' });
      return;
    }

    const redis = getRedis();
    await redis.set('chaos:enabled', enabled.toString());

    log.warn({ enabled, actor: req.user!.userId }, 'Chaos mode toggled');
    
    // Broadcast to UI
    emitChaosEvent({
      type: enabled ? 'error' : 'dropped', // Using one of the types just to signal state change
      count: 0
    });

    res.json({ enabled, message: `Chaos mode ${enabled ? 'enabled' : 'disabled'}` });
  } catch (error) {
    log.error({ err: error }, 'Failed to toggle chaos mode');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

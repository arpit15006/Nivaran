import { Router } from 'express';
import { prisma } from '../db.js';
import { redisGeneral } from '../redis.js';
import { getEscalationQueue } from '../engines/escalation.js';
import { asyncHandler } from '../http/errors.js';

export const healthRouter = Router();

// Liveness — process is up.
healthRouter.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', service: 'nivaran-backend', ts: new Date().toISOString() });
});

// Readiness — dependencies reachable + queue depth (PRD §15).
healthRouter.get(
  '/readyz',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, string | number> = {};
    let ready = true;

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.postgres = 'ok';
    } catch {
      checks.postgres = 'down';
      ready = false;
    }

    try {
      await redisGeneral.ping();
      checks.redis = 'ok';
    } catch {
      checks.redis = 'down';
      ready = false;
    }

    try {
      const counts = await getEscalationQueue().getJobCounts('waiting', 'delayed', 'active', 'failed');
      checks.queueDelayed = counts.delayed;
      checks.queueWaiting = counts.waiting;
      checks.queueFailed = counts.failed;
    } catch {
      checks.queue = 'down';
    }

    res.status(ready ? 200 : 503).json({ ready, checks });
  }),
);

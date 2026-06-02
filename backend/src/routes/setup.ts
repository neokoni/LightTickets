import { Router, Request, Response } from 'express';
import { z } from 'zod';
import type { Server } from 'http';
import * as setupService from '../services/setup.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';

const setupSchema = z.object({
  db: z.object({
    provider: z.enum(['sqlite', 'mysql']),
    databaseUrl: z.string().min(1),
  }),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    username: z.string().min(2).max(30),
  }),
  site: z.object({
    siteName: z.string().optional(),
    siteUrl: z.string().optional(),
  }).optional(),
  mc: z.object({
    defaultServerName: z.string().optional(),
  }).optional(),
});

export default function createSetupRoutes(server?: Server) {
  const router = Router();

  // GET /api/setup/site-config - public, no auth required
  router.get('/site-config', async (_req: Request, res: Response) => {
    const config = await setupService.getSiteConfig();
    res.json(config);
  });

  // POST /api/setup - perform initial setup
  router.post('/', async (req: Request, res: Response) => {
    const parsed = setupSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

    const result = await setupService.completeSetup(parsed.data);
    res.status(201).json(result);
    if (server) setupService.startFullAppAfterSetup(server);
  });

  // PATCH /api/setup/settings - admin only
  router.patch('/settings', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
    const schema = z.object({
      requireLogin: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

    const result = await setupService.updateSettings(parsed.data);
    res.json(result);
  });

  return router;
}

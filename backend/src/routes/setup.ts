import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as setupService from '../services/setup.service.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

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

// GET /api/setup/status - check if setup is complete
router.get('/status', async (_req: Request, res: Response) => {
  const status = await setupService.getSetupStatus();
  res.json(status);
});

// POST /api/setup - perform initial setup
router.post('/', async (req: Request, res: Response) => {
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const result = await setupService.completeSetup(parsed.data);
  res.status(201).json(result);
});

export default router;

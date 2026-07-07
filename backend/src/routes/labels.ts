import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as labelService from '../services/label.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ROLE } from '../constants/roles.js';
import { validate } from '../utils/validate.js';

const router = Router();

const createSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  description: z.string().optional(),
});

router.get('/', async (_req: Request, res: Response) => {
  const labels = await labelService.list();
  res.json(labels);
});

router.post('/', authMiddleware, requireRole(ROLE.ADMIN), async (req: Request, res: Response) => {
  const data = validate(createSchema, req.body);

  const label = await labelService.create(data.name, data.color, data.description);
  res.status(201).json(label);
});

router.patch(
  '/:id',
  authMiddleware,
  requireRole(ROLE.ADMIN),
  async (req: Request, res: Response) => {
    const label = await labelService.update(String(req.params.id), req.body);
    res.json(label);
  },
);

router.delete(
  '/:id',
  authMiddleware,
  requireRole(ROLE.ADMIN),
  async (req: Request, res: Response) => {
    await labelService.remove(String(req.params.id));
    res.status(204).end();
  },
);

export default router;

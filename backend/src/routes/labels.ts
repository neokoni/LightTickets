import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as labelService from '../services/label.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';

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

router.post('/', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const label = await labelService.create(parsed.data.name, parsed.data.color, parsed.data.description);
  res.status(201).json(label);
});

router.patch('/:id', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const label = await labelService.update(req.params.id, req.body);
  res.json(label);
});

router.delete('/:id', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  await labelService.remove(req.params.id);
  res.status(204).end();
});

export default router;

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as serverService from '../services/server.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

router.use(authMiddleware, requireRole('admin'));

const createSchema = z.object({
  name: z.string().min(1).max(50),
  address: z.string().optional(),
  description: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  address: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
}).refine(
  (data) => data.name !== undefined || data.address !== undefined || data.description !== undefined,
  '至少需要提供一个更新字段',
);

router.get('/', async (_req: Request, res: Response) => {
  const servers = await serverService.list();
  res.json(servers);
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const server = await serverService.create(parsed.data.name, parsed.data.address, parsed.data.description);
  res.status(201).json(server);
});

router.post('/:id/regenerate-key', async (req: Request, res: Response) => {
  const server = await serverService.regenerateKey(req.params.id);
  res.json(server);
});

router.patch('/:id', async (req: Request, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const server = await serverService.update(req.params.id, parsed.data);
  res.json(server);
});

router.delete('/:id', async (req: Request, res: Response) => {
  await serverService.remove(req.params.id);
  res.status(204).end();
});

export default router;

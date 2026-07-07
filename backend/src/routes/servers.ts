import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as serverService from '../services/server.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ROLE } from '../constants/roles.js';
import { validate } from '../utils/validate.js';

const router = Router();

router.use(authMiddleware, requireRole(ROLE.ADMIN));

const createSchema = z.object({
  name: z.string().min(1).max(50),
  address: z.string().optional(),
  description: z.string().optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    address: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined || data.address !== undefined || data.description !== undefined,
    '至少需要提供一个更新字段',
  );

router.get('/', async (_req: Request, res: Response) => {
  const servers = await serverService.list();
  res.json(servers);
});

router.post('/', async (req: Request, res: Response) => {
  const data = validate(createSchema, req.body);

  const server = await serverService.create(data.name, data.address, data.description);
  res.status(201).json(server);
});

router.post('/:id/regenerate-key', async (req: Request, res: Response) => {
  const server = await serverService.regenerateKey(String(req.params.id));
  res.json(server);
});

router.patch('/:id', async (req: Request, res: Response) => {
  const data = validate(updateSchema, req.body);

  const server = await serverService.update(String(req.params.id), data);
  res.json(server);
});

router.delete('/:id', async (req: Request, res: Response) => {
  await serverService.remove(String(req.params.id));
  res.status(204).end();
});

export default router;

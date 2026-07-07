import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as templateService from '../services/template.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../utils/validate.js';
import { ROLE } from '../constants/roles.js';

const router = Router();
router.use(authMiddleware, requireRole(ROLE.ADMIN));

const createSchema = z.object({
  name: z.string().min(1).max(50),
  nameI18n: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  titlePrefix: z.string().max(50).optional(),
  labels: z.string().optional(),
  body: z.string().min(1),
  completionHooks: z.string().optional(),
  enabled: z.boolean().optional(),
});

// GET /api/admin/templates
router.get('/', async (_req: Request, res: Response) => {
  const rows = await templateService.adminList();
  res.json(rows);
});

// GET /api/admin/templates/:name
router.get('/:name', async (req: Request, res: Response) => {
  const row = await templateService.adminGet(String(req.params.name));
  res.json(row);
});

// POST /api/admin/templates
router.post('/', async (req: Request, res: Response) => {
  const data = validate(createSchema, req.body);
  const tmpl = await templateService.adminCreate(data);
  res.status(201).json(tmpl);
});

// PATCH /api/admin/templates/:name
router.patch('/:name', async (req: Request, res: Response) => {
  const tmpl = await templateService.adminUpdate(String(req.params.name), req.body);
  res.json(tmpl);
});

// DELETE /api/admin/templates/:name
router.delete('/:name', async (req: Request, res: Response) => {
  await templateService.adminDelete(String(req.params.name));
  res.status(204).end();
});

export default router;

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as templateService from '../services/template.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();
router.use(authMiddleware, requireRole('admin'));

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

// GET /api/admin/templates/:id
router.get('/:id', async (req: Request, res: Response) => {
  const row = await templateService.adminGet(Number(req.params.id));
  res.json(templateService.toAdminEditorResponse(row));
});

// POST /api/admin/templates
router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const tmpl = await templateService.adminCreate(parsed.data);
  res.status(201).json(tmpl);
});

// PATCH /api/admin/templates/:id
router.patch('/:id', async (req: Request, res: Response) => {
  const tmpl = await templateService.adminUpdate(Number(req.params.id), req.body);
  res.json(tmpl);
});

// DELETE /api/admin/templates/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await templateService.adminDelete(Number(req.params.id));
  res.status(204).end();
});

export default router;

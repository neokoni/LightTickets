import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as userService from '../services/user.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

router.get('/', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
  const result = await userService.listUsers(page, pageSize);
  res.json(result);
});

const roleSchema = z.object({
  role: z.enum(['player', 'staff', 'admin']),
});

router.patch('/:id/role', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const user = await userService.changeRole(req.params.id, parsed.data.role);
  res.json(user);
});

router.delete('/:id', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  await userService.deleteUser(req.params.id, req.user!.userId);
  res.status(204).end();
});

export default router;

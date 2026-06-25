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

const avatarSchema = z.object({
  avatarUrl: z.string().url().nullable().or(z.literal('')),
});

router.patch('/me/avatar', authMiddleware, async (req: Request, res: Response) => {
  const parsed = avatarSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const url = parsed.data.avatarUrl || null;
  const user = await userService.updateAvatar(req.user!.userId, url);
  res.json(user);
});

const usernameSchema = z.object({
  username: z.string().min(2).max(32),
});

router.patch('/me/username', authMiddleware, async (req: Request, res: Response) => {
  const parsed = usernameSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const user = await userService.updateUsername(req.user!.userId, parsed.data.username);
  res.json(user);
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(8, '新密码至少 8 个字符').max(128),
});

router.patch('/me/password', authMiddleware, async (req: Request, res: Response) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  await userService.changePassword(req.user!.userId, parsed.data.currentPassword, parsed.data.newPassword);
  res.json({ message: '密码已更新' });
});

const roleSchema = z.object({
  role: z.enum(['player', 'staff', 'admin']),
});

router.patch('/:id/role', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const userId = Number(req.params.id);
  if (isNaN(userId)) throw new ValidationError('无效的用户 ID');
  const user = await userService.changeRole(userId, parsed.data.role);
  res.json(user);
});

router.delete('/:id', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (isNaN(userId)) throw new ValidationError('无效的用户 ID');
  await userService.deleteUser(userId, req.user!.userId);
  res.status(204).end();
});

export default router;

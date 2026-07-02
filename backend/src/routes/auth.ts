import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { platformOnlyMiddleware } from '../middleware/platform.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

router.use(platformOnlyMiddleware);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(2).max(32),
});

const loginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string(),
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const { getSiteConfig } = await import('../services/setup.service.js');
  const config = await getSiteConfig();
  if (!config.allowWebRegister) {
    res.status(403).json({ message: '网页注册已关闭，请联系管理员' });
    return;
  }

  const result = await authService.register(parsed.data.email, parsed.data.password, parsed.data.username);
  res.status(201).json(result);
});

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const result = await authService.login(parsed.data.emailOrUsername, parsed.data.password);
  res.json(result);
});

router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ValidationError('refreshToken required');

  const result = await authService.refresh(refreshToken);
  res.json(result);
});

router.post('/link-minecraft', authMiddleware, async (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) throw new ValidationError('code required');

  const result = await authService.linkMinecraft(req.user!.userId, code);
  res.json(result);
});

router.delete('/link-minecraft', authMiddleware, async (req: Request, res: Response) => {
  const user = await authService.unlinkMinecraft(req.user!.userId);
  res.json(user);
});

export default router;

import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as authService from '../services/auth.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import { validate } from '../utils/validate.js';

const router = Router();
const REFRESH_COOKIE_NAME = 'lt_refresh_token';

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth',
  });
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(2).max(32),
});

const loginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string(),
});

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const data = validate(registerSchema, req.body);

  const { getSiteConfig } = await import('../services/setup.service.js');
  const config = await getSiteConfig();
  if (!config.allowWebRegister) {
    throw new ForbiddenError('网页注册已关闭，请联系管理员');
  }

  const result = await authService.register(data.email, data.password, data.username);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json(result);
});

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const data = validate(loginSchema, req.body);

  const result = await authService.login(data.emailOrUsername, data.password);
  setRefreshCookie(res, result.refreshToken);
  res.json(result);
});

router.post('/refresh', authLimiter, async (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers.cookie);
  const refreshToken = cookies[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
  if (!refreshToken) throw new ValidationError('refreshToken required');

  const result = await authService.refresh(refreshToken);
  res.json(result);
});

router.post('/logout', authMiddleware, async (_req: Request, res: Response) => {
  clearRefreshCookie(res);
  res.status(204).end();
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

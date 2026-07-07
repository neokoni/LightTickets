import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getConfig } from '../config.js';
import { UnauthorizedError } from '../utils/errors.js';
import { getSiteConfig } from '../services/setup.service.js';

export interface AuthPayload {
  userId: number;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function verifyBearer(header: string | undefined): AuthPayload | null {
  if (!header?.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), getConfig().security.jwtSecret) as AuthPayload;
  } catch {
    return null;
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const payload = verifyBearer(req.headers.authorization);
  if (!payload) throw new UnauthorizedError('缺少认证令牌或格式不正确');
  req.user = payload;
  next();
}

export async function conditionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const { requireLogin } = await getSiteConfig();

  if (!requireLogin) {
    const payload = verifyBearer(req.headers.authorization);
    if (payload) req.user = payload;
    return next();
  }

  const payload = verifyBearer(req.headers.authorization);
  if (!payload) throw new UnauthorizedError('缺少认证令牌或格式不正确');
  req.user = payload;
  next();
}

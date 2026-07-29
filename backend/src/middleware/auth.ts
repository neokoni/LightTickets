import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors.js';
import { getSiteConfig } from '../services/setup.service.js';
import { verifyAccessToken } from '../utils/token.js';
import { prisma } from '../db.js';

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
    return verifyAccessToken(header.slice(7));
  } catch {
    return null;
  }
}

async function resolveCurrentUser(header: string | undefined): Promise<AuthPayload | null> {
  const payload = verifyBearer(header);
  if (!payload) return null;
  const user = await prisma().user.findUnique({
    where: { id: payload.userId },
    select: { id: true, role: true },
  });
  if (!user) return null;
  return { userId: user.id, role: user.role };
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const payload = await resolveCurrentUser(req.headers.authorization);
  if (!payload) throw new UnauthorizedError('缺少认证令牌或格式不正确');
  req.user = payload;
  next();
}

export async function conditionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const { requireLogin } = await getSiteConfig();

  if (!requireLogin) {
    const payload = await resolveCurrentUser(req.headers.authorization);
    if (payload) req.user = payload;
    return next();
  }

  const payload = await resolveCurrentUser(req.headers.authorization);
  if (!payload) throw new UnauthorizedError('缺少认证令牌或格式不正确');
  req.user = payload;
  next();
}

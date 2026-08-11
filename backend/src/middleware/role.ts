import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';
import { ROLE } from '../constants/roles.js';

const VALID_ROLES = new Set<string>([ROLE.PLAYER, ROLE.STAFF, ROLE.ADMIN]);

export function requireRole(...roles: string[]) {
  for (const r of roles) {
    if (!VALID_ROLES.has(r)) {
      throw new Error(`Unknown role in requireRole: ${r}`);
    }
  }
  const allowed = new Set(roles);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !allowed.has(req.user.role)) {
      throw new ForbiddenError();
    }
    next();
  };
}

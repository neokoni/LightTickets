import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';
import { ROLE } from '../constants/roles.js';

const ROLE_HIERARCHY: Record<string, number> = {
  [ROLE.PLAYER]: 0,
  [ROLE.STAFF]: 1,
  [ROLE.ADMIN]: 2,
};

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new ForbiddenError();
    }
    const userLevel = ROLE_HIERARCHY[req.user.role] ?? 0;
    const minLevel = Math.min(...roles.map((r) => ROLE_HIERARCHY[r] ?? 0));
    if (userLevel < minLevel) {
      throw new ForbiddenError();
    }
    next();
  };
}

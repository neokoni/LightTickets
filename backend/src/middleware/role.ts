import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError } from '../utils/errors.js';
import { isAdminRole, isStaffRole, ROLE } from '../constants/roles.js';

type RoleRequirement = (role: string) => boolean;

const ROLE_REQUIREMENTS: ReadonlyMap<string, RoleRequirement> = new Map([
  [ROLE.PLAYER, (role) => role === ROLE.PLAYER || isStaffRole(role)],
  [ROLE.STAFF, isStaffRole],
  [ROLE.ADMIN, isAdminRole],
]);

export function requireRole(...roles: string[]) {
  if (roles.length === 0) {
    throw new Error('requireRole requires at least one role');
  }
  const requirements = roles.map((role) => {
    const requirement = ROLE_REQUIREMENTS.get(role);
    if (!requirement) {
      throw new Error(`Unknown role in requireRole: ${role}`);
    }
    return requirement;
  });
  return (req: Request, _res: Response, next: NextFunction) => {
    const userRole = req.user?.role;
    if (userRole === undefined || requirements.some((requirement) => !requirement(userRole))) {
      throw new ForbiddenError();
    }
    next();
  };
}

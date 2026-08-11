import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ROLE } from '../src/constants/roles.js';
import { requireRole } from '../src/middleware/role.js';
import { ForbiddenError } from '../src/utils/errors.js';

function invokeMiddleware(userRole: string | undefined, ...requiredRoles: string[]) {
  const middleware = requireRole(...requiredRoles);
  const req = {
    user: userRole === undefined ? undefined : { userId: 1, role: userRole, tokenEpoch: 0 },
  } as Request;
  const res = {} as Response;
  const next = vi.fn<NextFunction>();

  return { invoke: () => middleware(req, res, next), next };
}

describe('requireRole', () => {
  it.each([
    [ROLE.PLAYER, ROLE.PLAYER],
    [ROLE.STAFF, ROLE.PLAYER],
    [ROLE.ADMIN, ROLE.PLAYER],
    [ROLE.STAFF, ROLE.STAFF],
    [ROLE.ADMIN, ROLE.STAFF],
    [ROLE.ADMIN, ROLE.ADMIN],
  ])('allows %s to access a %s route', (userRole, requiredRole) => {
    const { invoke, next } = invokeMiddleware(userRole, requiredRole);

    expect(invoke).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
  });

  it.each([
    [ROLE.PLAYER, ROLE.STAFF],
    [ROLE.PLAYER, ROLE.ADMIN],
    [ROLE.STAFF, ROLE.ADMIN],
    ['unknown', ROLE.PLAYER],
    [undefined, ROLE.PLAYER],
  ])('rejects %s from a %s route', (userRole, requiredRole) => {
    const { invoke, next } = invokeMiddleware(userRole, requiredRole);

    expect(invoke).toThrow(ForbiddenError);
    expect(next).not.toHaveBeenCalled();
  });

  it('enforces the highest role when multiple roles are required', () => {
    expect(invokeMiddleware(ROLE.STAFF, ROLE.STAFF, ROLE.ADMIN).invoke).toThrow(ForbiddenError);
    expect(invokeMiddleware(ROLE.ADMIN, ROLE.STAFF, ROLE.ADMIN).invoke).not.toThrow();
  });

  it('rejects unknown required roles when middleware is created', () => {
    expect(() => requireRole('unknown')).toThrow('Unknown role in requireRole: unknown');
  });

  it('rejects an empty role requirement when middleware is created', () => {
    expect(() => requireRole()).toThrow('requireRole requires at least one role');
  });
});

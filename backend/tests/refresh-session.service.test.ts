import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { prisma } from './setup.js';
import { REFRESH_SESSION_TTL_MS } from '../src/constants/auth.js';
import * as refreshSessionService from '../src/services/refresh-session.service.js';

async function createUser(email: string) {
  return prisma().user.create({
    data: { email, username: email.split('@')[0], passwordHash: 'unused' },
  });
}

describe('refresh session service', () => {
  it('stores only a hash of a fixed-size opaque token', async () => {
    const user = await createUser('refresh-hash@test.com');
    const before = Date.now();
    const token = await refreshSessionService.createRefreshSession(user.id);
    const session = await prisma().refreshSession.findFirstOrThrow();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session.tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    expect(session.tokenHash).not.toContain(token);
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(before + REFRESH_SESSION_TTL_MS);
  });

  it('rotates a session into the same family and rejects the consumed token', async () => {
    const user = await createUser('refresh-rotate@test.com');
    const token = await refreshSessionService.createRefreshSession(user.id);
    const original = await prisma().refreshSession.findFirstOrThrow();

    const rotated = await refreshSessionService.rotateRefreshSession(token);
    expect(rotated?.userId).toBe(user.id);
    expect(rotated?.refreshToken).not.toBe(token);

    const sessions = await prisma().refreshSession.findMany({ orderBy: { createdAt: 'asc' } });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ familyId: original.familyId });
    expect(sessions[0].revokedAt).not.toBeNull();
    expect(sessions[0].rotatedAt).not.toBeNull();
    expect(sessions[1]).toMatchObject({ familyId: original.familyId, revokedAt: null });

    await expect(refreshSessionService.rotateRefreshSession(token)).resolves.toBeNull();
    await expect(
      refreshSessionService.rotateRefreshSession(rotated!.refreshToken),
    ).resolves.toBeNull();
  });

  it('revokes every active session for a user', async () => {
    const user = await createUser('refresh-revoke-all@test.com');
    const tokens = await Promise.all([
      refreshSessionService.createRefreshSession(user.id),
      refreshSessionService.createRefreshSession(user.id),
    ]);

    await refreshSessionService.revokeAllUserRefreshSessions(user.id);

    for (const token of tokens) {
      await expect(refreshSessionService.rotateRefreshSession(token)).resolves.toBeNull();
    }
    await expect(
      prisma().refreshSession.count({ where: { userId: user.id, revokedAt: null } }),
    ).resolves.toBe(0);
  });
});

import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { REFRESH_SESSION_TTL_MS } from '../constants/auth.js';

const REFRESH_TOKEN_BYTES = 32;

type RefreshSessionClient = Pick<Prisma.TransactionClient, 'refreshSession'>;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function newToken(): string {
  return crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

export async function createRefreshSession(
  userId: number,
  client: RefreshSessionClient = prisma(),
  familyId: string = crypto.randomUUID(),
): Promise<string> {
  const token = newToken();
  await client.refreshSession.create({
    data: {
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + REFRESH_SESSION_TTL_MS),
    },
  });
  return token;
}

export async function rotateRefreshSession(
  token: string,
): Promise<{ userId: number; refreshToken: string } | null> {
  const tokenHash = hashToken(token);
  const result = await prisma().$transaction(async (tx) => {
    const session = await tx.refreshSession.findUnique({ where: { tokenHash } });
    if (!session) return { kind: 'invalid' as const };

    const now = new Date();
    if (session.revokedAt) {
      if (session.rotatedAt) {
        await tx.refreshSession.updateMany({
          where: { familyId: session.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
      }
      return { kind: 'invalid' as const };
    }

    if (session.expiresAt <= now) {
      await tx.refreshSession.update({
        where: { id: session.id },
        data: { revokedAt: now },
      });
      return { kind: 'invalid' as const };
    }

    const consumed = await tx.refreshSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now, rotatedAt: now },
    });
    if (consumed.count !== 1) {
      await tx.refreshSession.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: now },
      });
      return { kind: 'invalid' as const };
    }

    const refreshToken = await createRefreshSession(session.userId, tx, session.familyId);
    return { kind: 'rotated' as const, userId: session.userId, refreshToken };
  });

  return result.kind === 'rotated'
    ? { userId: result.userId, refreshToken: result.refreshToken }
    : null;
}

export async function revokeRefreshSession(token: string): Promise<void> {
  await prisma().refreshSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserRefreshSessions(
  userId: number,
  client: RefreshSessionClient = prisma(),
): Promise<void> {
  await client.refreshSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

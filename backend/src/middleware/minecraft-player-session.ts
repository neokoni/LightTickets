import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
import { getSiteConfig } from '../services/setup.service.js';
import { UnauthorizedError } from '../utils/errors.js';
import { hashMinecraftSecret } from '../utils/minecraft-credential.js';

export interface MinecraftPlayerIdentity {
  userId: number;
  role: string;
  minecraftUuid: string;
  serverId: string;
}

declare global {
  namespace Express {
    interface Request {
      minecraftPlayer?: MinecraftPlayerIdentity;
    }
  }
}

async function resolveMinecraftPlayer(req: Request): Promise<MinecraftPlayerIdentity | null> {
  const token = req.headers['x-player-session'];
  if (typeof token !== 'string' || !req.server) return null;

  const session = await prisma().minecraftPlayerSession.findUnique({
    where: { tokenHash: hashMinecraftSecret(token) },
    include: {
      credential: {
        include: { user: { select: { id: true, role: true, minecraftUuid: true } } },
      },
    },
  });
  const user = session?.credential.user;
  if (
    !session ||
    session.serverId !== req.server.id ||
    session.expiresAt <= new Date() ||
    !user?.minecraftUuid ||
    user.minecraftUuid !== session.credential.minecraftUuid
  ) {
    return null;
  }

  return {
    userId: user.id,
    role: user.role,
    minecraftUuid: user.minecraftUuid,
    serverId: session.serverId,
  };
}

export async function minecraftPlayerSessionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const identity = await resolveMinecraftPlayer(req);
  if (!identity) throw new UnauthorizedError('Missing or invalid X-Player-Session header');
  req.minecraftPlayer = identity;
  next();
}

/**
 * Mirrors conditionalAuthMiddleware for MC viewers: the player session is
 * optional. It is only enforced when the platform requires login to view
 * tickets; otherwise requests degrade to the anonymous viewer (public tickets
 * only), exactly like the web ticket routes.
 */
export async function conditionalMinecraftPlayerSessionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const identity = await resolveMinecraftPlayer(req);
  if (identity) {
    req.minecraftPlayer = identity;
    next();
    return;
  }

  const { requireLogin } = await getSiteConfig();
  if (requireLogin) throw new UnauthorizedError('Minecraft player session is invalid or expired');
  next();
}

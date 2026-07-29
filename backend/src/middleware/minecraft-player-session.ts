import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db.js';
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

export async function minecraftPlayerSessionMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const token = req.headers['x-player-session'];
  if (typeof token !== 'string' || !req.server) {
    throw new UnauthorizedError('Missing or invalid X-Player-Session header');
  }

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
    throw new UnauthorizedError('Minecraft player session is invalid or expired');
  }

  req.minecraftPlayer = {
    userId: user.id,
    role: user.role,
    minecraftUuid: user.minecraftUuid,
    serverId: session.serverId,
  };
  next();
}

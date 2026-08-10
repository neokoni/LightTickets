import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db.js';
import { UnauthorizedError } from '../utils/errors.js';
import { hashServerApiKey } from '../utils/server-key.js';

declare global {
  namespace Express {
    interface Request {
      server?: { id: string; name: string };
    }
  }
}

export async function serverAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.headers['x-server-key'] as string | undefined;
  if (!apiKey) {
    throw new UnauthorizedError('Missing X-Server-Key header');
  }

  const server = await prisma().server.findUnique({
    where: { apiKeyHash: hashServerApiKey(apiKey) },
  });
  if (!server) {
    throw new UnauthorizedError('Invalid server key');
  }

  req.server = { id: server.id, name: server.name };
  next();
}

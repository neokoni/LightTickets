import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors.js';
import type { AuthenticatedServerApiKey } from '../services/server.service.js';
import * as serverService from '../services/server.service.js';

declare global {
  namespace Express {
    interface Request {
      server?: { id: string; name: string };
      serverApiKey?: AuthenticatedServerApiKey;
    }
  }
}

export async function serverAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const apiKey = req.headers['x-server-key'] as string | undefined;
  if (!apiKey) {
    throw new UnauthorizedError('Missing X-Server-Key header');
  }

  const authenticatedKey = await serverService.authenticateApiKey(apiKey);
  const pluginServerId =
    req.body && typeof req.body === 'object' && typeof req.body.serverId === 'string'
      ? req.body.serverId
      : undefined;
  const server = serverService.resolveAuthenticatedServer(authenticatedKey, pluginServerId);
  req.serverApiKey = authenticatedKey;
  req.server = { id: server.id, name: server.name };
  next();
}

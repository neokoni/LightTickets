import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../utils/errors.js';

export function platformOnlyMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return next();
  }

  const referer = req.headers.referer || req.headers.origin || '';
  const host = req.headers.host || '';

  const isSameOrigin = referer.includes(host);
  const isPlatformRequest = req.headers['x-platform-internal'] === 'true';

  if (isSameOrigin || isPlatformRequest) {
    return next();
  }

  throw new NotFoundError();
}
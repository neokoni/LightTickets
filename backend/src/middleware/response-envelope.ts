import type { NextFunction, Request, Response } from 'express';

export function responseEnvelope(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/api/health' || req.path === '/api/docs/openapi.json') {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body?: unknown): Response => {
    if (
      res.statusCode === 204 ||
      res.statusCode >= 300 ||
      (body && typeof body === 'object' && 'success' in body)
    ) {
      return originalJson(body);
    }
    return originalJson({ success: true, data: body });
  };

  next();
}

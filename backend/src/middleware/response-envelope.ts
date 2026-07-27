import type { NextFunction, Request, Response } from 'express';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isResponseEnvelope(body: unknown): boolean {
  if (!isRecord(body)) return false;

  if (body.success === true) {
    return Object.prototype.hasOwnProperty.call(body, 'data');
  }

  return (
    body.success === false &&
    typeof body.statusCode === 'number' &&
    Number.isInteger(body.statusCode) &&
    typeof body.message === 'string'
  );
}

export function responseEnvelope(req: Request, res: Response, next: NextFunction): void {
  if (req.path === '/api/health' || req.path === '/api/docs/openapi.json') {
    next();
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body?: unknown): Response => {
    if (res.statusCode === 204 || isResponseEnvelope(body)) {
      return originalJson(body);
    }
    return originalJson({ success: true, data: body });
  };

  next();
}

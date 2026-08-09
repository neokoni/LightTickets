import type { NextFunction, Request, Response } from 'express';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isResponseEnvelope(body: unknown): boolean {
  if (!isRecord(body)) return false;

  if (body.success === true) {
    const keys = Object.keys(body);
    return keys.length === 2 && keys.includes('success') && keys.includes('data');
  }

  if (
    body.success !== false ||
    typeof body.statusCode !== 'number' ||
    !Number.isInteger(body.statusCode) ||
    typeof body.message !== 'string'
  ) {
    return false;
  }

  const keys = Object.keys(body);
  const allowedKeys = new Set(['success', 'statusCode', 'message', 'traceId']);
  return (
    keys.every((key) => allowedKeys.has(key)) &&
    keys.length === (Object.prototype.hasOwnProperty.call(body, 'traceId') ? 4 : 3) &&
    (!Object.prototype.hasOwnProperty.call(body, 'traceId') || typeof body.traceId === 'string')
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

import type { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';
import { AppError, normalizeError } from '../utils/errors.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const normalized = normalizeError(err);
  if (normalized instanceof AppError) {
    res.status(normalized.statusCode).json({
      success: false,
      statusCode: normalized.statusCode,
      message: normalized.message,
    });
    return;
  }
  const traceId = crypto.randomUUID();
  console.error(`[error] traceId=${traceId} name=${normalized.name} message=${normalized.message}`);
  res.status(500).json({
    success: false,
    statusCode: 500,
    message: 'Internal server error',
    traceId,
  });
}

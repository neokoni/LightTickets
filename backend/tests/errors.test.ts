import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { AppError, normalizeError } from '../src/utils/errors.js';

describe('normalizeError', () => {
  it.each([
    [
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
      409,
    ],
    [
      new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: 'test' }),
      404,
    ],
    [
      new Prisma.PrismaClientKnownRequestError('related resource missing', {
        code: 'P2003',
        clientVersion: 'test',
      }),
      404,
    ],
    [new Prisma.PrismaClientValidationError('invalid', { clientVersion: 'test' }), 400],
  ])('maps Prisma errors to HTTP %i', (error, statusCode) => {
    const normalized = normalizeError(error);

    expect(normalized).toBeInstanceOf(AppError);
    expect((normalized as AppError).statusCode).toBe(statusCode);
  });
});

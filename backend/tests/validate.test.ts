import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  validate,
  idSchema,
  paginationSchema,
  parseId,
  parsePagination,
} from '../src/utils/validate.js';
import { ValidationError } from '../src/utils/errors.js';

describe('validate', () => {
  const schema = z.object({ name: z.string().min(1), age: z.number().int().positive() });

  it('returns parsed data when valid', () => {
    const data = validate(schema, { name: 'alice', age: 30 });
    expect(data).toEqual({ name: 'alice', age: 30 });
  });

  it('throws ValidationError with first issue message when invalid', () => {
    try {
      validate(schema, { name: '', age: -1 });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as Error).message).toMatch(/character/i);
    }
  });

  it('throws on wrong type', () => {
    expect(() => validate(schema, null)).toThrow(ValidationError);
  });

  it('infers output type (compile-time check via usage)', () => {
    const name: string = validate(z.string(), 'hi');
    expect(name).toBe('hi');
  });
});

describe('idSchema', () => {
  it('accepts non-empty string', () => {
    expect(idSchema.safeParse('abc').success).toBe(true);
  });

  it('rejects empty string', () => {
    expect(idSchema.safeParse('').success).toBe(false);
  });
});

describe('paginationSchema', () => {
  it('applies defaults page=1 pageSize=20', () => {
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ page: 1, pageSize: 20 });
    }
  });

  it('coerces string numbers', () => {
    const result = paginationSchema.safeParse({ page: '2', pageSize: '5' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ page: 2, pageSize: 5 });
    }
  });

  it('rejects pageSize over 100', () => {
    expect(paginationSchema.safeParse({ pageSize: 101 }).success).toBe(false);
  });

  it('rejects page below 1', () => {
    expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
  });
});

describe('parseId', () => {
  it('returns number for numeric string', () => {
    expect(parseId('42')).toBe(42);
  });

  it('throws ValidationError for non-numeric string', () => {
    expect(() => parseId('abc')).toThrow(ValidationError);
  });

  it('throws ValidationError for empty string', () => {
    expect(() => parseId('')).toThrow(ValidationError);
  });
});

describe('parsePagination', () => {
  it('returns defaults when query empty', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('coerces string values', () => {
    expect(parsePagination({ page: '3', pageSize: '15' })).toEqual({ page: 3, pageSize: 15 });
  });

  it('rejects pageSize over 100', () => {
    expect(() => parsePagination({ pageSize: 200 })).toThrow(ValidationError);
  });

  it('rejects page below 1', () => {
    expect(() => parsePagination({ page: 0 })).toThrow(ValidationError);
  });
});

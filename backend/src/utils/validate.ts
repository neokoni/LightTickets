import { z } from 'zod';
import { ValidationError } from './errors.js';

export function validate<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0].message);
  }
  return result.data as z.infer<S>;
}

export function parseId(raw: string): number {
  const id = Number(raw);
  if (raw.trim() === '' || isNaN(id)) throw new ValidationError('无效的 ID');
  return id;
}

export function parsePagination(query: Record<string, unknown>): {
  page: number;
  pageSize: number;
} {
  const result = paginationSchema.safeParse(query);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0].message);
  }
  return { page: result.data.page, pageSize: result.data.pageSize };
}

// Common reusable schemas
export const idSchema = z.string().min(1, 'ID is required');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

import { z } from 'zod';
import { paginationSchema } from '../utils/validate.js';

export const playerGroupIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{1,64}$/);
export const playerGroupCreateSchema = z.object({
  id: playerGroupIdSchema,
  name: z.string().max(191).optional(),
  note: z.string().max(2000).optional(),
});
export const playerGroupUpdateSchema = z.object({
  name: z.string().max(191).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});
export const playerGroupItemsSchema = z.object({
  values: z
    .array(
      z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_]{3,16}$/),
    )
    .min(1)
    .max(500),
});
export const playerGroupItemUpdateSchema = z.object({
  value: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,16}$/),
});
export const playerGroupSearchSchema = z.object({
  groupIds: z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
      (Array.isArray(value) ? value : value.split(',')).map((item) => item.trim()).filter(Boolean),
    ),
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export const playerGroupItemsQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(100).default(''),
});
export const playerGroupUploadSchema = z.object({
  groupId: playerGroupIdSchema,
  value: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_]{3,16}$/),
});

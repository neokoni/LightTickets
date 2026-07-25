import { z } from 'zod';

export const labelIdentifierSchema = z
  .string()
  .trim()
  .min(1, '标签标识符不能为空')
  .max(50, '标签标识符不能超过 50 个字符')
  .regex(/^[a-zA-Z0-9_-]+$/, '标签标识符只能包含字母、数字、下划线和短横线');

const labelNameSchema = z.string().trim().min(1).max(50);
const labelColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const labelCreateSchema = z.object({
  id: labelIdentifierSchema,
  name: labelNameSchema,
  color: labelColorSchema,
  description: z.string().optional(),
});

export const labelUpdateSchema = z.object({
  name: labelNameSchema.optional(),
  color: labelColorSchema.optional(),
  description: z.string().optional(),
});

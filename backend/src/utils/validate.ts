import { z, type ZodSchema } from 'zod';
import { ValidationError } from './errors.js';

export function validate<T>(schema: ZodSchema, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new ValidationError(`${issue.path.join('.') || 'input'}: ${issue.message}`);
  }
  return result.data as T;
}

// Common reusable schemas
export const idSchema = z.string().min(1, 'ID is required');

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const ticketStatusSchema = z.enum(['open', 'in_progress', 'resolved', 'closed']);
export const ticketTypeSchema = z.enum(['bug_report', 'permission_request', 'suggestion', 'report']);
export const prioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

export const createTicketSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  body: z.string().min(1, 'Body is required'),
  type: ticketTypeSchema,
  priority: prioritySchema.optional(),
  serverId: z.string().optional(),
});

export const updateTicketSchema = z.object({
  status: ticketStatusSchema.optional(),
  priority: prioritySchema.optional(),
  assigneeId: z.number().int().optional(),
});

export const createLabelSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color'),
  description: z.string().max(200, 'Description too long').optional(),
});

export const createCommentSchema = z.object({
  body: z.string().min(1, 'Body is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  username: z.string().min(2, 'Username too short').max(30, 'Username too long'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export const linkMinecraftSchema = z.object({
  code: z.string().min(1, 'Code is required'),
});

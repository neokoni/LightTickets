import { z } from 'zod';
import { TICKET_STATUS } from '../constants/ticket-status.js';
import { paginationSchema } from '../utils/validate.js';

export const minecraftUuidSchema = z.string().uuid();
export const minecraftNameSchema = z.string().regex(/^[a-zA-Z0-9_]{3,16}$/);

export const mcLinkCodeSchema = z.object({
  minecraftUuid: minecraftUuidSchema,
  minecraftName: minecraftNameSchema,
});

export const mcPlayerSessionSchema = z.object({
  minecraftUuid: z.string().min(1),
  playerCredential: z.string().min(32).max(128),
});

export const mcRegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  username: z.string().min(2).max(32),
  emailVerificationCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  minecraftUuid: minecraftUuidSchema,
  minecraftName: minecraftNameSchema,
});

export const mcTicketSchema = z.object({
  minecraftUuid: z.string(),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  template: z.string().min(1),
  formData: z.record(z.string(), z.string()).optional(),
  hidden: z.boolean().optional(),
  context: z
    .object({
      world: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
      gameMode: z.string().optional(),
    })
    .optional(),
});

export const mcViewerSchema = z.object({
  minecraftUuid: z.string().min(1),
});

export const mcTicketStatusSchema = z.enum([
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.CLOSED,
  TICKET_STATUS.INVALID,
]);

export const mcTicketListQuerySchema = paginationSchema.extend({
  minecraftUuid: z.string().min(1),
  statuses: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : value.split(',')))
    .pipe(z.array(mcTicketStatusSchema))
    .optional(),
  type: z.string().optional(),
  authorName: z.string().optional(),
  serverName: z.string().min(1).optional(),
  hasServer: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  search: z.string().optional(),
});

export const mcCommentSchema = z.object({
  minecraftUuid: z.string().min(1),
  ticketId: z.coerce.number().int().positive(),
  body: z.string().min(1),
});

export const mcTicketActionSchema = z.object({
  minecraftUuid: z.string().min(1),
});

export const mcStatusSchema = z.object({
  minecraftUuid: z.string(),
  status: mcTicketStatusSchema,
});

export const mcUnlinkSchema = z.object({
  minecraftUuid: z.string().min(1),
});

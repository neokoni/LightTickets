import { z } from 'zod';
import { TICKET_STATUS } from '../constants/ticket-status.js';

export const mcLinkCodeSchema = z.object({
  minecraftUuid: z.string(),
  minecraftName: z.string(),
});

export const mcRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(2).max(32),
  minecraftUuid: z.string(),
  minecraftName: z.string(),
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
  minecraftUuid: z.string().min(1).optional(),
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
  status: z.enum([
    TICKET_STATUS.OPEN,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.CLOSED,
    TICKET_STATUS.INVALID,
  ]),
});

export const mcUnlinkSchema = z.object({
  minecraftUuid: z.string().min(1),
});

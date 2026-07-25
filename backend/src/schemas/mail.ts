import { z } from 'zod';

export const mailConfigInputSchema = z
  .object({
    enabled: z.boolean().optional(),
    host: z.string().optional(),
    port: z.number().int().positive().optional(),
    secure: z.boolean().optional(),
    username: z.string().nullable().optional(),
    password: z.string().nullable().optional(),
    fromName: z.string().optional(),
    fromAddress: z.string().email().or(z.literal('')).optional(),
  })
  .strict();

export const mailTestSchema = z
  .object({
    mail: mailConfigInputSchema.optional(),
  })
  .strict();

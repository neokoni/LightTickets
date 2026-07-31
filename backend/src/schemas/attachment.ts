import { z } from 'zod';

export const attachmentConfigSchema = z
  .object({
    pendingQuotaMiB: z.number().int().min(1).max(102_400),
    pendingExpirationEnabled: z.boolean(),
    pendingTtlDays: z.number().int().min(1).max(365),
  })
  .strict();

export const attachmentConfigInputSchema = attachmentConfigSchema.partial().strict();

export type AttachmentConfigInput = z.infer<typeof attachmentConfigInputSchema>;

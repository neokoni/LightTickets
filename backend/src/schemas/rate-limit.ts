import { z } from 'zod';

const durationSecondsSchema = z.number().int().min(1).max(86_400);
const maxRequestsSchema = z.number().int().min(1).max(100_000);
const maxAttemptsSchema = z.number().int().min(1).max(100);

export const requestRateLimitRuleSchema = z
  .object({
    windowSeconds: durationSecondsSchema,
    maxRequests: maxRequestsSchema,
  })
  .strict();

export const toggleableRequestRateLimitRuleSchema = requestRateLimitRuleSchema.extend({
  enabled: z.boolean(),
});

export const emailRateLimitRuleSchema = z
  .object({
    cooldownSeconds: durationSecondsSchema,
  })
  .strict();

export const minecraftLinkRateLimitRuleSchema = z
  .object({
    maxAttempts: maxAttemptsSchema,
    lockSeconds: durationSecondsSchema,
  })
  .strict();

export const rateLimitConfigSchema = z
  .object({
    global: requestRateLimitRuleSchema,
    auth: requestRateLimitRuleSchema,
    loginPassword: toggleableRequestRateLimitRuleSchema,
    email: emailRateLimitRuleSchema,
    minecraftLink: minecraftLinkRateLimitRuleSchema,
  })
  .strict();

export const rateLimitConfigInputSchema = z
  .object({
    global: requestRateLimitRuleSchema.partial().strict().optional(),
    auth: requestRateLimitRuleSchema.partial().strict().optional(),
    loginPassword: toggleableRequestRateLimitRuleSchema.partial().strict().optional(),
    email: emailRateLimitRuleSchema.partial().strict().optional(),
    minecraftLink: minecraftLinkRateLimitRuleSchema.partial().strict().optional(),
  })
  .strict();

export type RateLimitConfigInput = z.infer<typeof rateLimitConfigInputSchema>;

import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  username: z.string().min(2).max(32),
  emailVerificationCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  turnstileToken: z.string().optional(),
});

export const registrationVerificationRequestSchema = z.object({
  email: z.string().trim().email(),
  turnstileToken: z.string().optional(),
});

export const loginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string(),
  turnstileToken: z.string().optional(),
});

export const passwordResetRequestSchema = z
  .object({
    emailOrUsername: z.string().min(1).optional(),
    email: z.string().min(1).optional(),
    turnstileToken: z.string().optional(),
  })
  .refine((data) => data.emailOrUsername || data.email, {
    message: '邮箱/用户名不能为空',
  });

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export const refreshRequestSchema = z.object({}).strict();

export const linkMinecraftSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

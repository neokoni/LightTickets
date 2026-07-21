import { z } from 'zod';
import { FEDERATED_AUTH_PROTOCOL, FEDERATED_AUTH_SECRET_MODE } from '../constants/federatedauth.js';

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const httpUrl = z
  .string()
  .trim()
  .url({ message: '必须是有效的 HTTP(S) URL' })
  .refine(isHttpUrl, '必须是有效的 HTTP(S) URL');

export const federatedAuthSlugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const federatedAuthJsonPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/);

const nullablePath = federatedAuthJsonPathSchema.nullable();

const providerFields = {
  slug: federatedAuthSlugSchema,
  name: z.string().trim().min(1).max(80),
  iconUrl: httpUrl.nullable().optional(),
  protocol: z.enum([FEDERATED_AUTH_PROTOCOL.OIDC, FEDERATED_AUTH_PROTOCOL.OAUTH]),
  issuer: httpUrl.nullable().optional(),
  authorizationEndpoint: httpUrl.nullable().optional(),
  tokenEndpoint: httpUrl.nullable().optional(),
  userInfoEndpoint: httpUrl.nullable().optional(),
  redirectUri: httpUrl,
  clientId: z.string().trim().min(1).max(512),
  clientSecret: z.string().max(2048).nullable().optional(),
  scope: z.string().trim().max(1000),
  subjectPath: federatedAuthJsonPathSchema,
  usernamePath: nullablePath.optional(),
  emailPath: nullablePath.optional(),
  avatarPath: nullablePath.optional(),
  authorizationParams: z.record(z.string(), z.string().max(2000)).optional(),
  pkce: z.boolean(),
  secretMode: z.enum([
    FEDERATED_AUTH_SECRET_MODE.BASIC,
    FEDERATED_AUTH_SECRET_MODE.POST,
    FEDERATED_AUTH_SECRET_MODE.BCRYPT,
  ]),
  accessTokenPath: federatedAuthJsonPathSchema,
  enabled: z.boolean(),
  allowRegistration: z.boolean(),
};

function validateProtocol(
  value: {
    protocol?: string;
    issuer?: string | null;
    authorizationEndpoint?: string | null;
    tokenEndpoint?: string | null;
    userInfoEndpoint?: string | null;
    secretMode?: string;
    scope?: string;
  },
  context: z.RefinementCtx,
): void {
  if (!value.protocol) return;
  if (value.protocol === FEDERATED_AUTH_PROTOCOL.OIDC) {
    if (!value.issuer) {
      context.addIssue({ code: 'custom', path: ['issuer'], message: 'OIDC issuer 不能为空' });
    }
    if (value.secretMode === FEDERATED_AUTH_SECRET_MODE.BCRYPT) {
      context.addIssue({
        code: 'custom',
        path: ['secretMode'],
        message: 'OIDC 不支持 bcrypt Client Secret',
      });
    }
    if (!value.scope?.split(/\s+/).includes('openid')) {
      context.addIssue({
        code: 'custom',
        path: ['scope'],
        message: 'OIDC scope 必须包含 openid',
      });
    }
    return;
  }
  for (const [field, label] of [
    ['authorizationEndpoint', '授权端点'],
    ['tokenEndpoint', 'Token 端点'],
    ['userInfoEndpoint', '用户信息端点'],
  ] as const) {
    if (!value[field]) {
      context.addIssue({ code: 'custom', path: [field], message: `${label}不能为空` });
    }
  }
}

export const federatedAuthProviderCreateSchema = z
  .object(providerFields)
  .strict()
  .superRefine(validateProtocol);

export const federatedAuthProviderUpdateSchema = z
  .object({
    ...Object.fromEntries(
      Object.entries(providerFields).map(([key, schema]) => [key, schema.optional()]),
    ),
  } as { [K in keyof typeof providerFields]: z.ZodOptional<(typeof providerFields)[K]> })
  .strict();

export const federatedAuthStartSchema = z
  .object({ returnTo: z.string().max(1000).default('/') })
  .strict();

export const federatedAuthCallbackSchema = z
  .object({
    code: z.string().optional(),
    state: z.string().optional(),
    error: z.string().optional(),
    error_description: z.string().optional(),
  })
  .passthrough();

export const federatedAuthRegistrationSchema = z
  .object({
    email: z.string().trim().email(),
    username: z.string().min(2).max(32),
    password: z.string().min(8).max(128),
    emailVerificationCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    turnstileToken: z.string().optional(),
  })
  .strict();

export const federatedAuthVerificationSchema = z
  .object({
    email: z.string().trim().email(),
    turnstileToken: z.string().optional(),
  })
  .strict();

export const federatedAuthUnlinkSchema = z.object({ currentPassword: z.string().min(1) }).strict();

export type FederatedAuthProviderCreateInput = z.infer<typeof federatedAuthProviderCreateSchema>;
export type FederatedAuthProviderUpdateInput = z.infer<typeof federatedAuthProviderUpdateSchema>;

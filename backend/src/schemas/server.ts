import { z } from 'zod';
import { SERVER_API_KEY_TYPES } from '../constants/server-api-key.js';

const serverIdentifyIdPattern = '^[^\\u0000-\\u001F\\u007F]+$';

export const serverIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, '服务器 ID 只能包含字母、数字、点、下划线和短横线');

// Matched against the server id a Velocity plugin reports, so it may contain any
// printable characters (including Chinese) but no control characters or newlines.
export const serverIdentifyIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (value) =>
      ![...value].some((char) => {
        const code = char.codePointAt(0) ?? 0;
        return code < 0x20 || code === 0x7f;
      }),
    '识别 ID 不能包含控制字符',
  )
  .meta({ pattern: serverIdentifyIdPattern });

export const serverCreateSchema = z.object({
  serverId: serverIdentifierSchema,
  identifyId: serverIdentifyIdSchema.optional(),
  alias: z.string().trim().min(1).max(50).optional(),
  address: z.string().trim().max(255).optional(),
  description: z.string().trim().max(500).optional(),
});

export const serverUpdateSchema = z
  .object({
    serverId: serverIdentifierSchema.optional(),
    identifyId: serverIdentifyIdSchema.nullable().optional(),
    alias: z.string().trim().min(1).max(50).nullable().optional(),
    address: z.string().trim().max(255).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: '至少需要提供一个更新字段',
  });

export const serverApiKeyCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(50).nullable().optional(),
    type: z.enum(SERVER_API_KEY_TYPES),
    serverIds: z.array(z.string().uuid()).min(1),
  })
  .superRefine((data, context) => {
    if (data.type === 'paper_folia' && data.serverIds.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['serverIds'],
        message: 'Paper/Folia API Key 必须绑定一个服务器',
      });
    }
    if (new Set(data.serverIds).size !== data.serverIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['serverIds'],
        message: '服务器不能重复选择',
      });
    }
  });

export const serverApiKeyUpdateSchema = serverApiKeyCreateSchema;

export const publicServerSchema = z.object({
  id: z.string().uuid(),
  serverId: z.string(),
  identifyId: z.string().nullable(),
  alias: z.string().nullable(),
  name: z.string(),
  address: z.string().nullable(),
  description: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export const publicServerApiKeySchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  type: z.enum(SERVER_API_KEY_TYPES),
  servers: z.array(publicServerSchema),
  createdAt: z.string().datetime(),
});

export const revealedServerApiKeySchema = z.object({ apiKey: z.string() });

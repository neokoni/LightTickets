import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { createApp } from './app.js';
import {
  federatedAuthCallbackSchema,
  federatedAuthProviderCreateSchema,
  federatedAuthProviderUpdateSchema,
  federatedAuthRegistrationSchema,
  federatedAuthStartSchema,
  federatedAuthUnlinkSchema,
  federatedAuthVerificationSchema,
} from './schemas/federatedauth.js';
import { rateLimitConfigSchema } from './schemas/rate-limit.js';
import { labelCreateSchema, labelIdentifierSchema, labelUpdateSchema } from './schemas/label.js';
import { mailTestSchema } from './schemas/mail.js';
import { siteUrlSchema } from './schemas/site.js';
import {
  linkMinecraftSchema,
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
  registrationVerificationRequestSchema,
} from './schemas/auth.js';
import {
  mcCommentSchema,
  mcLinkCodeSchema,
  mcPlayerSessionSchema,
  mcRegisterSchema,
  mcStatusSchema,
  mcTicketActionSchema,
  mcTicketSchema,
  mcUnlinkSchema,
  mcViewerSchema,
} from './schemas/mc.js';
import { storageUpdateSchema } from './schemas/storage.js';
import { settingsUpdateSchema, setupSchema } from './schemas/setup.js';
import { REFRESH_COOKIE_NAME } from './utils/auth-cookies.js';
import {
  completionHookIdSchema,
  ticketAssigneesSchema,
  ticketBodyUpdateSchema,
  ticketCompleteHookSchema,
  ticketCreateSchema,
  ticketLabelSchema,
  ticketListQuerySchema,
  ticketTitleUpdateSchema,
  ticketUpdateSchema,
} from './routes/tickets.js';
import { commentBodyUpdateSchema, commentCreateSchema } from './routes/comments.js';
import { serverCreateSchema, serverUpdateSchema } from './routes/servers.js';
import {
  emailChangeCancelSchema,
  unsubscribeSchema,
  userAvatarSchema,
  userEmailSchema,
  userEmailVerificationSchema,
  userNotificationSettingsSchema,
  userPasswordSchema,
  userRoleSchema,
  usernameSchema,
} from './routes/users.js';
import { adminTemplateCreateSchema, adminTemplateUpdateSchema } from './routes/admin-templates.js';
import { attachmentTargetFields } from './routes/attachments.js';
import { attachmentConfigSchema } from './schemas/attachment.js';
import { deliveryIdSchema } from './routes/admin-minecraft-hook-deliveries.js';

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

const jwtSecurityScheme = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

const apiKeySecurityScheme = registry.registerComponent('securitySchemes', 'apiKey', {
  type: 'apiKey',
  in: 'header',
  name: 'X-Server-Key',
});

const minecraftPlayerSessionSecurityScheme = registry.registerComponent(
  'securitySchemes',
  'minecraftPlayerSession',
  {
    type: 'apiKey',
    in: 'header',
    name: 'X-Player-Session',
  },
);

const refreshCookieSecurityScheme = registry.registerComponent('securitySchemes', 'refreshCookie', {
  type: 'apiKey',
  in: 'cookie',
  name: REFRESH_COOKIE_NAME,
});

const errorEnvelopeSchema = registry.register(
  'ErrorEnvelope',
  z.object({
    success: z.literal(false),
    statusCode: z.number().int(),
    message: z.string(),
    traceId: z.string().optional(),
  }),
);

const genericResponseDataSchema = z.union([
  z.object({}).passthrough(),
  z.array(z.unknown()),
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

const publicUserSchema = registry.register(
  'PublicUser',
  z.object({
    id: z.number().int().positive(),
    email: z.string().email(),
    pendingEmail: z.string().email().nullable(),
    username: z.string(),
    minecraftUuid: z.string().nullable(),
    minecraftName: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    receiveEmailNotifications: z.boolean(),
    role: z.enum(['player', 'staff', 'admin']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
);

const authResponseSchema = registry.register(
  'AuthResponse',
  z.object({
    user: publicUserSchema,
    accessToken: z.string(),
  }),
);

type AuthType =
  'none' | 'jwt' | 'refresh' | 'conditional' | 'admin' | 'staff' | 'apiKey' | 'minecraftPlayer';

interface RouteDef {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  summary: string;
  auth: AuthType;
  tags: string[];
  bodySchema?: z.ZodType;
  querySchema?: z.ZodObject;
  responseSchema?: z.ZodType;
  paramsSchema?: z.ZodObject;
  successStatus?: '200' | '201' | '204' | '303';
  successDescription?: string;
  bodyRequired?: boolean;
  requestMediaType?: 'application/json' | 'multipart/form-data';
  responseKind?: 'envelope' | 'raw' | 'none';
  responseMediaType?: string;
}

function inferParamsSchema(routePath: string): z.ZodObject | undefined {
  const names = Array.from(routePath.matchAll(/\{([^}]+)\}/g), (match) => match[1]);
  if (names.length === 0) return undefined;

  const shape: Record<string, z.ZodString> = {};
  for (const name of names) shape[name] = z.string();
  return z.object(shape);
}

function registerRoute(def: RouteDef) {
  const successStatus = def.successStatus ?? '200';
  const paramsSchema = def.paramsSchema ?? inferParamsSchema(def.path);
  const responseMediaType = def.responseMediaType ?? 'application/json';
  const responseKind =
    def.responseKind ?? (successStatus === '204' || successStatus === '303' ? 'none' : 'envelope');
  const successResponse = {
    description: def.successDescription ?? 'Success',
    ...(responseKind !== 'none' && {
      content: {
        [responseMediaType]: {
          schema:
            responseKind === 'raw'
              ? (def.responseSchema ?? genericResponseDataSchema)
              : z.object({
                  success: z.literal(true),
                  data: def.responseSchema ?? genericResponseDataSchema,
                }),
        },
      },
    }),
  };

  const pathItem = registry.registerPath({
    method: def.method,
    path: def.path,
    summary: def.summary,
    tags: def.tags,
    security:
      def.auth === 'none'
        ? []
        : def.auth === 'apiKey'
          ? [{ [apiKeySecurityScheme.name]: [] }]
          : def.auth === 'minecraftPlayer'
            ? [
                {
                  [apiKeySecurityScheme.name]: [],
                  [minecraftPlayerSessionSecurityScheme.name]: [],
                },
              ]
            : def.auth === 'conditional'
              ? [{ [jwtSecurityScheme.name]: [] }, {}]
              : def.auth === 'refresh'
                ? [{ [refreshCookieSecurityScheme.name]: [] }]
                : [{ [jwtSecurityScheme.name]: [] }],
    request: {
      ...(paramsSchema && { params: paramsSchema }),
      ...(def.querySchema && { query: def.querySchema }),
      ...(def.bodySchema && {
        body: {
          required: def.bodyRequired ?? true,
          content: { [def.requestMediaType ?? 'application/json']: { schema: def.bodySchema } },
        },
      }),
    },
    responses: {
      [successStatus]: successResponse,
      default: {
        description: 'Error',
        content: {
          'application/json': {
            schema: errorEnvelopeSchema,
          },
        },
      },
    },
  });
  return pathItem;
}

const registerAuthRoutes = () => {
  registerRoute({
    method: 'post',
    path: '/api/auth/register',
    summary: '注册新用户',
    auth: 'none',
    tags: ['Auth'],
    bodySchema: registerSchema,
    successStatus: '201',
    responseSchema: authResponseSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/register/verification-code',
    summary: '发送注册邮箱验证码',
    auth: 'none',
    tags: ['Auth'],
    bodySchema: registrationVerificationRequestSchema,
    responseSchema: z.object({
      accepted: z.literal(true),
      retryAfterSeconds: z.number().int().positive(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/login',
    summary: '用户登录',
    auth: 'none',
    tags: ['Auth'],
    bodySchema: loginSchema,
    responseSchema: authResponseSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/password-reset/request',
    summary: '请求密码重置邮件',
    auth: 'none',
    tags: ['Auth'],
    bodySchema: passwordResetRequestSchema,
    responseSchema: z.object({
      accepted: z.boolean(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/password-reset/confirm',
    summary: '确认密码重置',
    auth: 'none',
    tags: ['Auth'],
    bodySchema: passwordResetConfirmSchema,
    responseSchema: z.object({
      reset: z.boolean(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/refresh',
    summary: '刷新访问令牌',
    auth: 'refresh',
    tags: ['Auth'],
    responseSchema: authResponseSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/logout',
    summary: '退出登录并清除刷新令牌 Cookie',
    auth: 'none',
    tags: ['Auth'],
    successStatus: '204',
    successDescription: 'Logged out',
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/link-minecraft',
    summary: '绑定 Minecraft 账号',
    auth: 'jwt',
    tags: ['Auth'],
    bodySchema: linkMinecraftSchema,
  });
  registerRoute({
    method: 'delete',
    path: '/api/auth/link-minecraft',
    summary: '解绑 Minecraft 账号',
    auth: 'jwt',
    tags: ['Auth'],
  });
};

const registerTicketRoutes = () => {
  registerRoute({
    method: 'post',
    path: '/api/tickets',
    summary: '创建议题',
    auth: 'jwt',
    tags: ['Tickets'],
    bodySchema: ticketCreateSchema,
    successStatus: '201',
  });
  registerRoute({
    method: 'get',
    path: '/api/tickets',
    summary: '获取议题列表',
    auth: 'conditional',
    tags: ['Tickets'],
    querySchema: ticketListQuerySchema,
  });
  registerRoute({
    method: 'get',
    path: '/api/tickets/{id}',
    summary: '获取议题详情',
    auth: 'conditional',
    tags: ['Tickets'],
  });
  registerRoute({
    method: 'patch',
    path: '/api/tickets/{id}',
    summary: '更新议题状态',
    auth: 'jwt',
    tags: ['Tickets'],
    bodySchema: ticketUpdateSchema,
  });
  registerRoute({
    method: 'patch',
    path: '/api/tickets/{id}/body',
    summary: '更新议题正文',
    auth: 'jwt',
    tags: ['Tickets'],
    bodySchema: ticketBodyUpdateSchema,
  });
  registerRoute({
    method: 'patch',
    path: '/api/tickets/{id}/title',
    summary: '更新议题标题',
    auth: 'jwt',
    tags: ['Tickets'],
    bodySchema: ticketTitleUpdateSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/tickets/{id}/close',
    summary: '关闭议题',
    auth: 'jwt',
    tags: ['Tickets'],
  });
  registerRoute({
    method: 'post',
    path: '/api/tickets/{id}/reopen',
    summary: '重新打开议题',
    auth: 'jwt',
    tags: ['Tickets'],
  });
  registerRoute({
    method: 'post',
    path: '/api/tickets/{id}/completion-hooks/{hookId}/complete',
    summary: '提交并执行议题完成选项',
    auth: 'staff',
    tags: ['Tickets'],
    paramsSchema: z.object({ id: z.string(), hookId: completionHookIdSchema }),
    bodySchema: ticketCompleteHookSchema,
    responseSchema: z.object({
      id: z.uuid(),
      event: z.enum(['closed', 'invalid']),
      title: z.string(),
      fields: z.array(z.record(z.string(), z.unknown())),
      response: z.record(z.string(), z.union([z.string(), z.array(z.string())])).nullable(),
      status: z.enum(['pending', 'completed', 'cancelled']),
      visibility: z.enum(['public', 'staff']),
      createdAt: z.string(),
      completedAt: z.string().nullable(),
      completedBy: z
        .object({
          id: z.number().int(),
          username: z.string(),
          minecraftName: z.string().nullable(),
        })
        .nullable(),
    }),
  });
  registerRoute({
    method: 'get',
    path: '/api/tickets/{id}/attachments',
    summary: '获取议题附件列表',
    auth: 'jwt',
    tags: ['Tickets'],
  });
  registerRoute({
    method: 'put',
    path: '/api/tickets/{id}/assignees',
    summary: '设置受理人',
    auth: 'jwt',
    tags: ['Tickets'],
    bodySchema: ticketAssigneesSchema,
  });
  registerRoute({
    method: 'get',
    path: '/api/tickets/{ticketId}/audit',
    summary: '获取议题审计日志',
    auth: 'conditional',
    tags: ['Tickets'],
  });
};

const registerI18nRoutes = () => {
  registerRoute({
    method: 'get',
    path: '/api/i18n/languages',
    summary: '获取可用语言列表',
    auth: 'none',
    tags: ['I18n'],
  });
  registerRoute({
    method: 'get',
    path: '/api/i18n/languages/{id}',
    summary: '获取语言资源',
    auth: 'none',
    tags: ['I18n'],
  });
};

const registerCommentRoutes = () => {
  registerRoute({
    method: 'get',
    path: '/api/tickets/{id}/comments',
    summary: '获取评论列表',
    auth: 'conditional',
    tags: ['Comments'],
  });
  registerRoute({
    method: 'post',
    path: '/api/tickets/{id}/comments',
    summary: '创建评论',
    auth: 'jwt',
    tags: ['Comments'],
    bodySchema: commentCreateSchema,
    successStatus: '201',
  });
  registerRoute({
    method: 'patch',
    path: '/api/tickets/{id}/comments/{commentId}/body',
    summary: '更新评论内容',
    auth: 'jwt',
    tags: ['Comments'],
    bodySchema: commentBodyUpdateSchema,
  });
  registerRoute({
    method: 'delete',
    path: '/api/tickets/{id}/comments/{commentId}',
    summary: '删除评论',
    auth: 'jwt',
    tags: ['Comments'],
    successStatus: '204',
  });
};

const registerLabelRoutes = () => {
  const labelParamsSchema = z.object({ id: labelIdentifierSchema });
  const ticketParamsSchema = z.object({ id: z.string(), labelId: labelIdentifierSchema });

  registerRoute({
    method: 'get',
    path: '/api/labels',
    summary: '获取标签列表',
    auth: 'none',
    tags: ['Labels'],
  });
  registerRoute({
    method: 'post',
    path: '/api/labels',
    summary: '创建标签',
    auth: 'admin',
    tags: ['Labels'],
    bodySchema: labelCreateSchema,
    successStatus: '201',
  });
  registerRoute({
    method: 'patch',
    path: '/api/labels/{id}',
    summary: '更新标签',
    auth: 'admin',
    tags: ['Labels'],
    paramsSchema: labelParamsSchema,
    bodySchema: labelUpdateSchema,
  });
  registerRoute({
    method: 'delete',
    path: '/api/labels/{id}',
    summary: '删除标签',
    auth: 'admin',
    tags: ['Labels'],
    paramsSchema: labelParamsSchema,
    successStatus: '204',
  });
  registerRoute({
    method: 'post',
    path: '/api/tickets/{id}/labels',
    summary: '为议题添加标签',
    auth: 'staff',
    tags: ['Labels'],
    bodySchema: ticketLabelSchema,
    successStatus: '201',
    responseKind: 'none',
  });
  registerRoute({
    method: 'delete',
    path: '/api/tickets/{id}/labels/{labelId}',
    summary: '从议题移除标签',
    auth: 'staff',
    tags: ['Labels'],
    paramsSchema: ticketParamsSchema,
    successStatus: '204',
  });
};

const registerAttachmentRoutes = () => {
  registerRoute({
    method: 'post',
    path: '/api/attachments/upload',
    summary: '上传附件',
    auth: 'jwt',
    tags: ['Attachments'],
    bodySchema: z
      .object({
        file: z.string().openapi({ type: 'string', format: 'binary' }),
        ...attachmentTargetFields,
      })
      .refine((value) => value.ticketId === undefined || value.commentId === undefined),
    requestMediaType: 'multipart/form-data',
    successStatus: '201',
  });
  registerRoute({
    method: 'get',
    path: '/api/attachments/{id}',
    summary: '获取/下载附件',
    auth: 'conditional',
    tags: ['Attachments'],
    responseKind: 'raw',
    responseMediaType: 'application/octet-stream',
    responseSchema: z.string().openapi({ format: 'binary' }),
  });
  registerRoute({
    method: 'delete',
    path: '/api/attachments/{id}',
    summary: '删除附件',
    auth: 'jwt',
    tags: ['Attachments'],
    successStatus: '204',
  });
};

const registerServerRoutes = () => {
  registerRoute({
    method: 'get',
    path: '/api/servers',
    summary: '获取服务器列表',
    auth: 'admin',
    tags: ['Servers'],
  });
  registerRoute({
    method: 'post',
    path: '/api/servers',
    summary: '创建服务器',
    auth: 'admin',
    tags: ['Servers'],
    bodySchema: serverCreateSchema,
    successStatus: '201',
  });
  registerRoute({
    method: 'post',
    path: '/api/servers/{id}/regenerate-key',
    summary: '重新生成 API Key',
    auth: 'admin',
    tags: ['Servers'],
  });
  registerRoute({
    method: 'patch',
    path: '/api/servers/{id}',
    summary: '更新服务器',
    auth: 'admin',
    tags: ['Servers'],
    bodySchema: serverUpdateSchema,
  });
  registerRoute({
    method: 'delete',
    path: '/api/servers/{id}',
    summary: '删除服务器',
    auth: 'admin',
    tags: ['Servers'],
    successStatus: '204',
  });
};

const registerMcRoutes = () => {
  registerRoute({
    method: 'post',
    path: '/api/mc/register',
    summary: 'MC 插件注册用户',
    auth: 'apiKey',
    tags: ['MC'],
    bodySchema: mcRegisterSchema,
    responseSchema: z.object({
      user: z.object({}).passthrough(),
      playerCredential: z.string(),
    }),
    successStatus: '201',
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/link-code',
    summary: '生成 MC 绑定码',
    auth: 'apiKey',
    tags: ['MC'],
    bodySchema: mcLinkCodeSchema,
    responseSchema: z.object({
      code: z.string(),
      expiresAt: z.string().datetime(),
      playerCredential: z.string(),
    }),
    successStatus: '201',
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/session',
    summary: '用玩家凭据签发短期 MC session',
    auth: 'apiKey',
    tags: ['MC'],
    bodySchema: mcPlayerSessionSchema,
    responseSchema: z.object({
      sessionToken: z.string(),
      expiresAt: z.string().datetime(),
    }),
    successStatus: '201',
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/tickets',
    summary: 'MC 创建议题',
    auth: 'minecraftPlayer',
    tags: ['MC'],
    bodySchema: mcTicketSchema,
    successStatus: '201',
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/tickets',
    summary: 'MC 获取可见议题',
    auth: 'minecraftPlayer',
    tags: ['MC'],
    querySchema: mcViewerSchema.extend({
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    }),
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/tickets/{uuid}',
    summary: 'MC 获取玩家可见议题（兼容路径）',
    auth: 'minecraftPlayer',
    tags: ['MC'],
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/tickets/{id}/detail',
    summary: 'MC 获取议题详情',
    auth: 'minecraftPlayer',
    tags: ['MC'],
    querySchema: mcViewerSchema,
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/tickets/{id}/comments',
    summary: 'MC 获取议题评论',
    auth: 'minecraftPlayer',
    tags: ['MC'],
    querySchema: mcViewerSchema,
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/user/{uuid}',
    summary: 'MC 查询用户信息',
    auth: 'minecraftPlayer',
    tags: ['MC'],
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/comments',
    summary: 'MC 创建评论',
    auth: 'minecraftPlayer',
    tags: ['MC'],
    bodySchema: mcCommentSchema,
    successStatus: '201',
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/tickets/{id}/close',
    summary: 'MC 关闭议题',
    auth: 'minecraftPlayer',
    tags: ['MC'],
    bodySchema: mcTicketActionSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/tickets/{id}/reopen',
    summary: 'MC 重开议题',
    auth: 'minecraftPlayer',
    tags: ['MC'],
    bodySchema: mcTicketActionSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/tickets/{id}/status',
    summary: 'MC 更新议题状态',
    auth: 'minecraftPlayer',
    tags: ['MC'],
    bodySchema: mcStatusSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/unlink',
    summary: 'MC 解绑用户',
    auth: 'apiKey',
    tags: ['MC'],
    bodySchema: mcUnlinkSchema,
  });
};

const registerTemplateRoutes = () => {
  registerRoute({
    method: 'get',
    path: '/api/templates',
    summary: '获取模板列表',
    auth: 'none',
    tags: ['Templates'],
    responseSchema: z.array(
      z.object({
        name: z.string(),
        name_i18n: z.string(),
        description: z.string(),
        labels: z.array(z.string()),
        hidden: z.union([z.boolean(), z.literal('optional')]),
      }),
    ),
  });
  registerRoute({
    method: 'get',
    path: '/api/templates/{name}',
    summary: '获取模板详情',
    auth: 'none',
    tags: ['Templates'],
  });
  registerRoute({
    method: 'get',
    path: '/api/admin/templates',
    summary: '管理端获取模板列表',
    auth: 'admin',
    tags: ['Admin Templates'],
  });
  registerRoute({
    method: 'get',
    path: '/api/admin/templates/{name}',
    summary: '管理端获取模板详情',
    auth: 'admin',
    tags: ['Admin Templates'],
  });
  registerRoute({
    method: 'post',
    path: '/api/admin/templates',
    summary: '创建模板',
    auth: 'admin',
    tags: ['Admin Templates'],
    bodySchema: adminTemplateCreateSchema,
    successStatus: '201',
  });
  registerRoute({
    method: 'patch',
    path: '/api/admin/templates/{name}',
    summary: '更新模板',
    auth: 'admin',
    tags: ['Admin Templates'],
    bodySchema: adminTemplateUpdateSchema,
  });
  registerRoute({
    method: 'delete',
    path: '/api/admin/templates/{name}',
    summary: '删除模板',
    auth: 'admin',
    tags: ['Admin Templates'],
    successStatus: '204',
  });
};

const registerStorageRoutes = () => {
  registerRoute({
    method: 'get',
    path: '/api/admin/storage',
    summary: '获取存储配置',
    auth: 'admin',
    tags: ['Admin Storage'],
  });
  registerRoute({
    method: 'put',
    path: '/api/admin/storage',
    summary: '更新存储配置',
    auth: 'admin',
    tags: ['Admin Storage'],
    bodySchema: storageUpdateSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/admin/storage/test',
    summary: '测试 S3 连接',
    auth: 'admin',
    tags: ['Admin Storage'],
    responseSchema: z.object({
      message: z.string(),
    }),
  });
};

const registerMinecraftHookDeliveryRoutes = () => {
  registerRoute({
    method: 'get',
    path: '/api/admin/minecraft-hook-deliveries',
    summary: '获取失败的 Minecraft Hook 投递',
    auth: 'admin',
    tags: ['Admin Minecraft Hook Deliveries'],
  });
  registerRoute({
    method: 'post',
    path: '/api/admin/minecraft-hook-deliveries/{id}/retry',
    summary: '重试失败的 Minecraft Hook 投递',
    auth: 'admin',
    tags: ['Admin Minecraft Hook Deliveries'],
    paramsSchema: deliveryIdSchema,
    responseSchema: z.object({ retried: z.boolean() }),
  });
};

const registerUserRoutes = () => {
  registerRoute({
    method: 'get',
    path: '/api/users',
    summary: '获取用户列表',
    auth: 'admin',
    tags: ['Users'],
  });
  registerRoute({
    method: 'get',
    path: '/api/users/assignable',
    summary: '获取可分配用户列表',
    auth: 'staff',
    tags: ['Users'],
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/me/avatar',
    summary: '更新头像',
    auth: 'jwt',
    tags: ['Users'],
    bodySchema: userAvatarSchema,
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/me/username',
    summary: '更新用户名',
    auth: 'jwt',
    tags: ['Users'],
    bodySchema: usernameSchema,
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/me/password',
    summary: '修改密码',
    auth: 'jwt',
    tags: ['Users'],
    bodySchema: userPasswordSchema,
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/me/email',
    summary: '请求更换邮箱',
    auth: 'jwt',
    tags: ['Users'],
    bodySchema: userEmailSchema,
    responseSchema: z.object({
      accepted: z.literal(true),
      pendingEmail: z.string().email(),
      retryAfterSeconds: z.number().int().nonnegative(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/users/me/email/verify',
    summary: '验证并切换邮箱',
    auth: 'jwt',
    tags: ['Users'],
    bodySchema: userEmailVerificationSchema,
    responseSchema: publicUserSchema,
  });
  registerRoute({
    method: 'delete',
    path: '/api/users/me/email',
    summary: '取消待验证的邮箱更换',
    auth: 'jwt',
    tags: ['Users'],
    responseSchema: z.object({ cancelled: z.literal(true) }),
  });
  registerRoute({
    method: 'post',
    path: '/api/users/email-change/cancel',
    summary: '通过旧邮箱中的令牌撤销邮箱更换',
    auth: 'none',
    tags: ['Users'],
    bodySchema: emailChangeCancelSchema,
    responseSchema: z.object({ cancelled: z.literal(true) }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/me/notifications',
    summary: '更新个人邮件通知设置',
    auth: 'jwt',
    tags: ['Users'],
    bodySchema: userNotificationSettingsSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/users/email-notifications/unsubscribe',
    summary: '通过邮件链接关闭个人邮件通知',
    auth: 'none',
    tags: ['Users'],
    bodySchema: unsubscribeSchema,
    responseSchema: z.object({ unsubscribed: z.literal(true) }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/{id}/role',
    summary: '更改用户角色',
    auth: 'admin',
    tags: ['Users'],
    bodySchema: userRoleSchema,
  });
  registerRoute({
    method: 'delete',
    path: '/api/users/{id}',
    summary: '删除用户',
    auth: 'admin',
    tags: ['Users'],
    successStatus: '204',
  });
};

const registerSetupRoutes = () => {
  const adminSettingsResponseSchema = z
    .object({
      passwordResetEnabled: z
        .boolean()
        .describe('True only when SMTP is usable and siteUrl is a canonical HTTPS origin'),
      registrationEmailVerificationEnabled: z.boolean().describe('True when SMTP is usable'),
      rateLimit: rateLimitConfigSchema,
      rateLimitDefaults: rateLimitConfigSchema,
      attachment: attachmentConfigSchema,
      attachmentDefaults: attachmentConfigSchema,
    })
    .passthrough();

  registerRoute({
    method: 'get',
    path: '/api/setup/site-config',
    summary: '获取站点配置',
    auth: 'none',
    tags: ['Setup'],
    responseSchema: z.object({
      isSetup: z.boolean(),
      requireLogin: z.boolean(),
      allowWebRegister: z.boolean(),
      allowMcRegister: z.boolean(),
      passwordResetEnabled: z
        .boolean()
        .describe('True only when SMTP is usable and siteUrl is a canonical HTTPS origin'),
      registrationEmailVerificationEnabled: z.boolean().describe('True when SMTP is usable'),
      siteName: z.string(),
      siteUrl: siteUrlSchema.nullable(),
      footerContent: z.string().nullable(),
      defaultLanguage: z.string(),
      turnstile: z.object({
        enabled: z.boolean(),
        siteKey: z.string(),
      }),
      federatedAuthProviders: z.array(
        z.object({
          slug: z.string(),
          name: z.string(),
          iconUrl: z.string().nullable(),
          allowRegistration: z.boolean(),
        }),
      ),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/setup',
    summary: '执行初始化设置',
    auth: 'none',
    tags: ['Setup'],
    bodySchema: setupSchema,
    successStatus: '201',
    responseSchema: z.object({
      setup: z.object({
        id: z.string(),
        isSetup: z.boolean(),
        siteName: z.string(),
        siteUrl: siteUrlSchema.nullable(),
        defaultLanguage: z.string(),
        createdAt: z.string().datetime(),
        updatedAt: z.string().datetime(),
      }),
      admin: z.object({
        id: z.number().int().positive(),
        email: z.string().email(),
        username: z.string(),
        role: z.literal('admin'),
      }),
      accessToken: z.string(),
    }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/setup/settings',
    summary: '更新站点设置',
    auth: 'admin',
    tags: ['Setup'],
    bodySchema: settingsUpdateSchema,
    responseSchema: adminSettingsResponseSchema,
  });
  registerRoute({
    method: 'get',
    path: '/api/setup/settings',
    summary: '获取管理端站点设置',
    auth: 'admin',
    tags: ['Setup'],
    responseSchema: adminSettingsResponseSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/setup/settings/mail/test',
    summary: '测试 SMTP 连接',
    auth: 'admin',
    tags: ['Setup'],
    bodySchema: mailTestSchema,
    bodyRequired: false,
    responseSchema: z.object({
      message: z.string(),
    }),
  });
};

const registerHealthRoute = () => {
  registerRoute({
    method: 'get',
    path: '/api/health',
    summary: '健康检查',
    auth: 'none',
    tags: ['System'],
    responseKind: 'raw',
    responseSchema: z.object({ status: z.literal('ok') }),
  });
  registerRoute({
    method: 'get',
    path: '/api/docs/openapi.json',
    summary: '获取 OpenAPI 规范',
    auth: 'none',
    tags: ['System'],
    responseKind: 'raw',
  });
};

const registerFederatedAuthRoutes = () => {
  const slugParams = z.object({ slug: z.string().min(1) });
  const idParams = z.object({ id: z.string().uuid() });
  const valueParams = z.object({ value: z.string().min(1) });
  registerRoute({
    method: 'post',
    path: '/api/auth/federatedauth/{slug}/start',
    summary: '开始外部登录',
    auth: 'none',
    tags: ['外部登录'],
    bodySchema: federatedAuthStartSchema,
    paramsSchema: slugParams,
  });
  registerRoute({
    method: 'get',
    path: '/api/auth/federatedauth/{slug}/callback',
    summary: '处理外部登录回调',
    auth: 'none',
    tags: ['外部登录'],
    paramsSchema: slugParams,
    querySchema: federatedAuthCallbackSchema,
    successStatus: '303',
    successDescription: 'Redirect to the frontend completion or registration page',
  });
  registerRoute({
    method: 'get',
    path: '/api/auth/federatedauth/registration/session',
    summary: '获取外部登录注册会话',
    auth: 'none',
    tags: ['外部登录'],
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/federatedauth/registration/verification-code',
    summary: '发送外部登录本地账户注册邮箱验证码',
    auth: 'none',
    tags: ['外部登录'],
    bodySchema: federatedAuthVerificationSchema,
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/federatedauth/registration/complete',
    summary: '创建本地账户并绑定外部登录身份',
    auth: 'none',
    tags: ['外部登录'],
    bodySchema: federatedAuthRegistrationSchema,
    successStatus: '201',
    responseSchema: authResponseSchema,
  });
  registerRoute({
    method: 'get',
    path: '/api/users/me/federatedauth',
    summary: '列出当前账户的外部登录绑定',
    auth: 'jwt',
    tags: ['外部登录'],
  });
  registerRoute({
    method: 'post',
    path: '/api/users/me/federatedauth/{value}/start',
    summary: '开始绑定外部登录身份',
    auth: 'jwt',
    tags: ['外部登录'],
    bodySchema: federatedAuthStartSchema,
    paramsSchema: valueParams,
  });
  registerRoute({
    method: 'delete',
    path: '/api/users/me/federatedauth/{value}',
    summary: '解绑外部登录身份',
    auth: 'jwt',
    tags: ['外部登录'],
    bodySchema: federatedAuthUnlinkSchema,
    paramsSchema: valueParams,
    successStatus: '204',
  });
  registerRoute({
    method: 'get',
    path: '/api/admin/federatedauth/providers',
    summary: '列出外部登录 Provider',
    auth: 'admin',
    tags: ['外部登录'],
  });
  registerRoute({
    method: 'post',
    path: '/api/admin/federatedauth/providers',
    summary: '创建外部登录 Provider',
    auth: 'admin',
    tags: ['外部登录'],
    bodySchema: federatedAuthProviderCreateSchema,
    successStatus: '201',
  });
  registerRoute({
    method: 'patch',
    path: '/api/admin/federatedauth/providers/{id}',
    summary: '更新外部登录 Provider',
    auth: 'admin',
    tags: ['外部登录'],
    bodySchema: federatedAuthProviderUpdateSchema,
    paramsSchema: idParams,
  });
  registerRoute({
    method: 'delete',
    path: '/api/admin/federatedauth/providers/{id}',
    summary: '删除外部登录 Provider',
    auth: 'admin',
    tags: ['外部登录'],
    paramsSchema: idParams,
    successStatus: '204',
  });
  registerRoute({
    method: 'delete',
    path: '/api/admin/federatedauth/providers/{id}/identities',
    summary: '解绑外部登录 Provider 的全部身份',
    auth: 'admin',
    tags: ['外部登录'],
    paramsSchema: idParams,
    responseSchema: z.object({ unlinked: z.number().int().nonnegative() }),
  });
  registerRoute({
    method: 'post',
    path: '/api/admin/federatedauth/providers/{id}/test',
    summary: '测试外部登录 Provider 配置',
    auth: 'admin',
    tags: ['外部登录'],
    paramsSchema: idParams,
  });
};

registerHealthRoute();
registerAuthRoutes();
registerI18nRoutes();
registerTicketRoutes();
registerCommentRoutes();
registerLabelRoutes();
registerAttachmentRoutes();
registerServerRoutes();
registerMcRoutes();
registerTemplateRoutes();
registerStorageRoutes();
registerMinecraftHookDeliveryRoutes();
registerUserRoutes();
registerSetupRoutes();
registerFederatedAuthRoutes();

const generator = new OpenApiGeneratorV3(registry.definitions);

const openapi = generator.generateDocument({
  openapi: '3.0.3',
  info: {
    title: 'LightTickets API',
    version: '1.0.0',
    description: 'LightTickets API 文档',
  },
  servers: [{ url: 'http://localhost:23320', description: 'Development server' }],
});

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

interface RuntimeLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
  regexp?: RegExp;
  keys?: Array<{ name: string }>;
  handle?: { stack?: RuntimeLayer[] };
}

function joinRoutePaths(prefix: string, routePath: string): string {
  const joined = `${prefix}/${routePath}`.replace(/\/{2,}/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function mountPath(layer: RuntimeLayer): string {
  let source = layer.regexp?.source;
  if (!source || source === '^\\/?(?=\\/|$)') return '';

  source = source.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '');
  for (const key of layer.keys ?? []) {
    source = source.replace('(?:\\/([^/]+?))', `/:${key.name}`);
  }
  return source.replaceAll('\\/', '/');
}

function collectRuntimeRoutes(stack: RuntimeLayer[], prefix = ''): Set<string> {
  const routes = new Set<string>();
  for (const layer of stack) {
    if (layer.route) {
      const routePath = joinRoutePaths(prefix, layer.route.path).replace(
        /:([A-Za-z0-9_]+)/g,
        '{$1}',
      );
      for (const [method, enabled] of Object.entries(layer.route.methods)) {
        if (enabled && HTTP_METHODS.has(method)) routes.add(`${method.toUpperCase()} ${routePath}`);
      }
      continue;
    }

    if (layer.handle?.stack) {
      const nestedPrefix = joinRoutePaths(prefix, mountPath(layer));
      for (const route of collectRuntimeRoutes(layer.handle.stack, nestedPrefix)) routes.add(route);
    }
  }
  return routes;
}

function getRuntimeRoutes(): Set<string> {
  const app = createApp({ enableInitialSetup: true });
  const router = Reflect.get(app, '_router') as { stack?: RuntimeLayer[] } | undefined;
  if (!router?.stack) throw new Error('Unable to inspect Express routes');
  return collectRuntimeRoutes(router.stack);
}

function getDocumentedRoutes(): Set<string> {
  const routes = new Set<string>();
  for (const [routePath, pathItem] of Object.entries(openapi.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of Object.keys(pathItem)) {
      if (HTTP_METHODS.has(method)) routes.add(`${method.toUpperCase()} ${routePath}`);
    }
  }
  return routes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateResponseContracts(): void {
  const nonEnvelopedRoutes = new Set([
    'GET /api/health',
    'GET /api/docs/openapi.json',
    'GET /api/attachments/{id}',
  ]);

  for (const [routePath, pathItem] of Object.entries(openapi.paths ?? {})) {
    if (!isRecord(pathItem)) continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !isRecord(operation)) continue;
      const route = `${method.toUpperCase()} ${routePath}`;
      const responses = operation.responses;
      if (!isRecord(responses) || !isRecord(responses.default)) {
        throw new Error(`${route} must document the standard error envelope`);
      }

      if (nonEnvelopedRoutes.has(route)) continue;
      for (const [status, response] of Object.entries(responses)) {
        if (!/^2\d\d$/.test(status) || !isRecord(response) || !isRecord(response.content)) continue;
        const jsonContent = response.content['application/json'];
        if (!isRecord(jsonContent) || !isRecord(jsonContent.schema)) continue;

        const properties = jsonContent.schema.properties;
        const required = jsonContent.schema.required;
        if (
          !isRecord(properties) ||
          !('success' in properties) ||
          !('data' in properties) ||
          !Array.isArray(required) ||
          !required.includes('success') ||
          !required.includes('data')
        ) {
          throw new Error(`${route} ${status} must use the success/data response envelope`);
        }
      }
    }
  }
}

function validateOpenApiDocument(): void {
  if (openapi.openapi !== '3.0.3') {
    throw new Error(`OpenAPI dialect must be 3.0.3, received ${openapi.openapi}`);
  }
  if (openapi.info.version !== '1.0.0') {
    throw new Error(`WIP API version must remain 1.0.0, received ${openapi.info.version}`);
  }

  const runtimeRoutes = getRuntimeRoutes();
  const documentedRoutes = getDocumentedRoutes();
  const missing = [...runtimeRoutes].filter((route) => !documentedRoutes.has(route)).sort();
  const stale = [...documentedRoutes].filter((route) => !runtimeRoutes.has(route)).sort();
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(
      `OpenAPI route diff failed\nMissing: ${missing.join(', ') || '(none)'}\nStale: ${stale.join(', ') || '(none)'}`,
    );
  }

  validateResponseContracts();
}

validateOpenApiDocument();

const outputPath = path.resolve('openapi.json');
fs.writeFileSync(outputPath, JSON.stringify(openapi, null, 2), 'utf-8');
const pathCount = Object.keys(openapi.paths || {}).length;
console.log(`[openapi] Generated ${outputPath} with ${pathCount} paths`);

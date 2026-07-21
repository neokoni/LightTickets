import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { DatabaseProvider } from './constants/database-provider.js';
import { StorageDriver } from './constants/storage-driver.js';
import {
  federatedAuthProviderCreateSchema,
  federatedAuthProviderUpdateSchema,
  federatedAuthRegistrationSchema,
  federatedAuthStartSchema,
  federatedAuthUnlinkSchema,
  federatedAuthVerificationSchema,
} from './schemas/federatedauth.js';

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

type AuthType = 'none' | 'jwt' | 'conditional' | 'admin' | 'staff' | 'apiKey';

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
}

function registerRoute(def: RouteDef) {
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
          : [{ [jwtSecurityScheme.name]: [] }],
    request: {
      ...(def.paramsSchema && { params: def.paramsSchema }),
      ...(def.querySchema && { query: def.querySchema }),
      ...(def.bodySchema && {
        body: {
          content: { 'application/json': { schema: def.bodySchema } },
        },
      }),
    },
    responses: {
      ...(def.responseSchema
        ? {
            [def.successStatus ?? '200']: {
              description: def.successDescription ?? 'Success',
              content: { 'application/json': { schema: def.responseSchema } },
            },
          }
        : {
            [def.successStatus ?? '200']: {
              description: def.successDescription ?? 'Success',
            },
          }),
      '400': {
        description: 'Bad Request',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              statusCode: z.literal(400),
              message: z.string(),
            }),
          },
        },
      },
      '401': {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              statusCode: z.literal(401),
              message: z.string(),
            }),
          },
        },
      },
      '500': {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: z.object({
              success: z.literal(false),
              statusCode: z.literal(500),
              message: z.string(),
              traceId: z.string(),
            }),
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
    bodySchema: z.object({
      email: z.string().email(),
      password: z.string().min(8),
      username: z.string().min(2).max(32),
      emailVerificationCode: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
      turnstileToken: z.string().optional(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/register/verification-code',
    summary: '发送注册邮箱验证码',
    auth: 'none',
    tags: ['Auth'],
    bodySchema: z.object({
      email: z.string().email(),
      turnstileToken: z.string().optional(),
    }),
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
    bodySchema: z.object({
      emailOrUsername: z.string().min(1),
      password: z.string(),
      turnstileToken: z.string().optional(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/password-reset/request',
    summary: '请求密码重置邮件',
    auth: 'none',
    tags: ['Auth'],
    bodySchema: z.object({
      emailOrUsername: z.string().min(1),
      turnstileToken: z.string().optional(),
    }),
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
    bodySchema: z.object({
      token: z.string().min(1),
      password: z.string().min(8),
    }),
    responseSchema: z.object({
      reset: z.boolean(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/refresh',
    summary: '刷新访问令牌',
    auth: 'none',
    tags: ['Auth'],
    bodySchema: z.object({
      refreshToken: z.string(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/auth/link-minecraft',
    summary: '绑定 Minecraft 账号',
    auth: 'jwt',
    tags: ['Auth'],
    bodySchema: z.object({
      code: z.string(),
    }),
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
    bodySchema: z.object({
      title: z.string().min(1).max(200),
      template: z.string(),
      formData: z.record(z.string(), z.unknown()),
      serverId: z.string().optional(),
      attachmentIds: z.array(z.string()).optional(),
      hidden: z.boolean().optional(),
    }),
  });
  registerRoute({
    method: 'get',
    path: '/api/tickets',
    summary: '获取议题列表',
    auth: 'conditional',
    tags: ['Tickets'],
    querySchema: z.object({
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
      statuses: z.string().optional(),
      type: z.string().optional(),
      authorId: z.coerce.number().int().positive().optional(),
      authorName: z.string().optional(),
      serverId: z.string().optional(),
      serverName: z.string().optional(),
      hasServer: z.enum(['true', 'false']).optional(),
      labelId: z.string().optional(),
      search: z.string().optional(),
    }),
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
    bodySchema: z.object({
      status: z.string().optional(),
      assigneeId: z.number().optional(),
      hidden: z.boolean().optional(),
    }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/tickets/{id}/body',
    summary: '更新议题正文',
    auth: 'jwt',
    tags: ['Tickets'],
    bodySchema: z.object({ body: z.string().min(1) }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/tickets/{id}/title',
    summary: '更新议题标题',
    auth: 'jwt',
    tags: ['Tickets'],
    bodySchema: z.object({ title: z.string().min(1).max(200) }),
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
    bodySchema: z.object({ assigneeIds: z.array(z.number().int()) }),
  });
  registerRoute({
    method: 'get',
    path: '/api/tickets/{id}/audit',
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
    bodySchema: z.object({ body: z.string().min(1) }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/tickets/{id}/comments/{commentId}/body',
    summary: '更新评论内容',
    auth: 'jwt',
    tags: ['Comments'],
    bodySchema: z.object({ body: z.string().min(1) }),
  });
  registerRoute({
    method: 'delete',
    path: '/api/tickets/{id}/comments/{commentId}',
    summary: '删除评论',
    auth: 'jwt',
    tags: ['Comments'],
  });
};

const registerLabelRoutes = () => {
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
    bodySchema: z.object({
      name: z.string().min(1),
      color: z.string(),
      description: z.string().optional(),
    }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/labels/{id}',
    summary: '更新标签',
    auth: 'admin',
    tags: ['Labels'],
    bodySchema: z.object({
      name: z.string().optional(),
      color: z.string().optional(),
      description: z.string().optional(),
    }),
  });
  registerRoute({
    method: 'delete',
    path: '/api/labels/{id}',
    summary: '删除标签',
    auth: 'admin',
    tags: ['Labels'],
  });
  registerRoute({
    method: 'post',
    path: '/api/tickets/{id}/labels',
    summary: '为议题添加标签',
    auth: 'jwt',
    tags: ['Labels'],
    bodySchema: z.object({ labelId: z.string() }),
  });
  registerRoute({
    method: 'delete',
    path: '/api/tickets/{id}/labels/{labelId}',
    summary: '从议题移除标签',
    auth: 'jwt',
    tags: ['Labels'],
  });
};

const registerAttachmentRoutes = () => {
  registerRoute({
    method: 'post',
    path: '/api/attachments/upload',
    summary: '上传附件',
    auth: 'jwt',
    tags: ['Attachments'],
  });
  registerRoute({
    method: 'get',
    path: '/api/attachments/{id}',
    summary: '获取/下载附件',
    auth: 'conditional',
    tags: ['Attachments'],
  });
  registerRoute({
    method: 'delete',
    path: '/api/attachments/{id}',
    summary: '删除附件',
    auth: 'jwt',
    tags: ['Attachments'],
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
    bodySchema: z.object({
      name: z.string().min(1),
      address: z.string().optional(),
      description: z.string().optional(),
    }),
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
    bodySchema: z.object({
      name: z.string().optional(),
      address: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
    }),
  });
  registerRoute({
    method: 'delete',
    path: '/api/servers/{id}',
    summary: '删除服务器',
    auth: 'admin',
    tags: ['Servers'],
  });
};

const registerMcRoutes = () => {
  registerRoute({
    method: 'post',
    path: '/api/mc/register',
    summary: 'MC 插件注册用户',
    auth: 'apiKey',
    tags: ['MC'],
    bodySchema: z.object({
      email: z.string().email(),
      password: z.string().min(8),
      username: z.string().min(2).max(32),
      minecraftUuid: z.string(),
      minecraftName: z.string(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/link-code',
    summary: '生成 MC 绑定码',
    auth: 'apiKey',
    tags: ['MC'],
    bodySchema: z.object({
      minecraftUuid: z.string(),
      minecraftName: z.string(),
      serverId: z.string(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/tickets',
    summary: 'MC 创建议题',
    auth: 'apiKey',
    tags: ['MC'],
    bodySchema: z.object({
      minecraftUuid: z.string(),
      title: z.string(),
      template: z.string(),
      formData: z.record(z.string(), z.unknown()),
      hidden: z.boolean().optional(),
      gameContext: z.string().optional(),
    }),
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/tickets',
    summary: 'MC 获取可见议题',
    auth: 'apiKey',
    tags: ['MC'],
    querySchema: z.object({
      minecraftUuid: z.string().optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().optional(),
    }),
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/tickets/{uuid}',
    summary: 'MC 获取玩家可见议题（兼容路径）',
    auth: 'apiKey',
    tags: ['MC'],
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/tickets/{id}/detail',
    summary: 'MC 获取议题详情',
    auth: 'apiKey',
    tags: ['MC'],
    querySchema: z.object({ minecraftUuid: z.string().optional() }),
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/tickets/{id}/comments',
    summary: 'MC 获取议题评论',
    auth: 'apiKey',
    tags: ['MC'],
    querySchema: z.object({ minecraftUuid: z.string().optional() }),
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/user/{uuid}',
    summary: 'MC 查询用户信息',
    auth: 'apiKey',
    tags: ['MC'],
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/comments',
    summary: 'MC 创建评论',
    auth: 'apiKey',
    tags: ['MC'],
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/tickets/{id}/close',
    summary: 'MC 关闭议题',
    auth: 'apiKey',
    tags: ['MC'],
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/tickets/{id}/reopen',
    summary: 'MC 重开议题',
    auth: 'apiKey',
    tags: ['MC'],
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/tickets/{id}/status',
    summary: 'MC 更新议题状态',
    auth: 'apiKey',
    tags: ['MC'],
    bodySchema: z.object({ status: z.string() }),
  });
  registerRoute({
    method: 'post',
    path: '/api/mc/unlink',
    summary: 'MC 解绑用户',
    auth: 'apiKey',
    tags: ['MC'],
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
    bodySchema: z.object({
      name: z.string().min(1),
      nameI18n: z.string(),
      description: z.string(),
      titlePrefix: z.string().optional(),
      labels: z.string().optional(),
      body: z.string(),
      completionHooks: z.string().optional(),
      enabled: z.boolean().optional(),
      hidden: z.union([z.boolean(), z.literal('optional')]).optional(),
    }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/admin/templates/{name}',
    summary: '更新模板',
    auth: 'admin',
    tags: ['Admin Templates'],
    bodySchema: z.object({
      nameI18n: z.string().optional(),
      description: z.string().optional(),
      titlePrefix: z.string().optional(),
      labels: z.string().optional(),
      body: z.string().optional(),
      completionHooks: z.string().optional(),
      enabled: z.boolean().optional(),
      hidden: z.union([z.boolean(), z.literal('optional')]).optional(),
    }),
  });
  registerRoute({
    method: 'delete',
    path: '/api/admin/templates/{name}',
    summary: '删除模板',
    auth: 'admin',
    tags: ['Admin Templates'],
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
    bodySchema: z.object({
      driver: z.enum([StorageDriver.LOCAL, StorageDriver.S3]),
      uploadDir: z.string().optional(),
      s3: z
        .object({
          endpoint: z.string().optional(),
          region: z.string().optional(),
          bucket: z.string().optional(),
          accessKeyId: z.string().optional(),
          secretAccessKey: z.string().optional(),
          forcePathStyle: z.boolean().optional(),
          presignExpiry: z.number().int().positive().optional(),
        })
        .optional(),
    }),
  });
  registerRoute({
    method: 'post',
    path: '/api/admin/storage/test',
    summary: '测试 S3 连接',
    auth: 'admin',
    tags: ['Admin Storage'],
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
    bodySchema: z.object({ avatarUrl: z.string().nullable() }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/me/username',
    summary: '更新用户名',
    auth: 'jwt',
    tags: ['Users'],
    bodySchema: z.object({ username: z.string().min(2).max(32) }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/me/password',
    summary: '修改密码',
    auth: 'jwt',
    tags: ['Users'],
    bodySchema: z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8),
    }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/me/email',
    summary: '更新邮箱',
    auth: 'jwt',
    tags: ['Users'],
    bodySchema: z.object({ email: z.string().email() }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/me/notifications',
    summary: '更新个人邮件通知设置',
    auth: 'jwt',
    tags: ['Users'],
    bodySchema: z.object({ receiveEmailNotifications: z.boolean() }),
  });
  registerRoute({
    method: 'post',
    path: '/api/users/email-notifications/unsubscribe',
    summary: '通过邮件链接关闭个人邮件通知',
    auth: 'none',
    tags: ['Users'],
    bodySchema: z.object({ token: z.string().min(1) }),
    responseSchema: z.object({ unsubscribed: z.literal(true) }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/users/{userId}/role',
    summary: '更改用户角色',
    auth: 'admin',
    tags: ['Users'],
    bodySchema: z.object({ role: z.enum(['player', 'staff', 'admin']) }),
  });
  registerRoute({
    method: 'delete',
    path: '/api/users/{userId}',
    summary: '删除用户',
    auth: 'admin',
    tags: ['Users'],
  });
};

const registerSetupRoutes = () => {
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
      passwordResetEnabled: z.boolean(),
      registrationEmailVerificationEnabled: z.boolean(),
      siteName: z.string(),
      siteUrl: z.string().nullable(),
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
    bodySchema: z
      .object({
        db: z
          .object({
            provider: z.enum([DatabaseProvider.SQLITE, DatabaseProvider.MYSQL]),
            host: z.string().optional(),
            port: z.number().int().positive().optional(),
            username: z.string().optional(),
            password: z.string().optional(),
            database: z.string().optional(),
            args: z.string().optional(),
          })
          .strict()
          .superRefine((db, ctx) => {
            if (db.provider !== DatabaseProvider.MYSQL) return;
            for (const field of ['host', 'username', 'database'] as const) {
              if (!db[field]?.trim()) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: 'MySQL 配置必填',
                  path: [field],
                });
              }
            }
          }),
        admin: z.object({
          email: z.string().email(),
          password: z.string().min(6),
          username: z.string().min(2).max(30),
        }),
        site: z
          .object({
            siteName: z.string().optional(),
            siteUrl: z.string().optional(),
            defaultLanguage: z.string().optional(),
          })
          .optional(),
        mc: z.object({ defaultServerName: z.string().optional() }).optional(),
        storage: z
          .object({
            driver: z.enum([StorageDriver.LOCAL, StorageDriver.S3]),
            s3: z
              .object({
                endpoint: z.string().optional(),
                bucket: z.string().optional(),
                accessKeyId: z.string().optional(),
                secretAccessKey: z.string().optional(),
                forcePathStyle: z.boolean().optional(),
                presignExpiry: z.number().int().positive().optional(),
              })
              .optional(),
          })
          .optional(),
      })
      .strict(),
  });
  registerRoute({
    method: 'patch',
    path: '/api/setup/settings',
    summary: '更新站点设置',
    auth: 'admin',
    tags: ['Setup'],
    bodySchema: z.object({
      requireLogin: z.boolean().optional(),
      allowWebRegister: z.boolean().optional(),
      allowMcRegister: z.boolean().optional(),
      siteName: z.string().max(100).optional(),
      siteUrl: z.string().url().nullable().optional(),
      footerContent: z.string().max(2000).nullable().optional(),
      defaultLanguage: z.string().optional(),
      sendEmailNotifications: z.boolean().optional(),
      mail: z
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
        .optional(),
      turnstile: z
        .object({
          enabled: z.boolean().optional(),
          siteKey: z.string().optional(),
          secretKey: z.string().nullable().optional(),
        })
        .optional(),
    }),
  });
  registerRoute({
    method: 'get',
    path: '/api/setup/settings',
    summary: '获取管理端站点设置',
    auth: 'admin',
    tags: ['Setup'],
  });
  registerRoute({
    method: 'post',
    path: '/api/setup/settings/mail/test',
    summary: '测试 SMTP 连接',
    auth: 'admin',
    tags: ['Setup'],
    responseSchema: z.object({
      success: z.boolean(),
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
  });
};

const registerFederatedAuthRoutes = () => {
  const slugParams = z.object({ slug: z.string().min(1) });
  const idParams = z.object({ id: z.string().uuid() });
  const identityParams = z.object({ identityId: z.string().uuid() });
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
    querySchema: z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
      error_description: z.string().optional(),
    }),
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
    path: '/api/users/me/federatedauth/{slug}/start',
    summary: '开始绑定外部登录身份',
    auth: 'jwt',
    tags: ['外部登录'],
    bodySchema: federatedAuthStartSchema,
    paramsSchema: slugParams,
  });
  registerRoute({
    method: 'delete',
    path: '/api/users/me/federatedauth/{identityId}',
    summary: '解绑外部登录身份',
    auth: 'jwt',
    tags: ['外部登录'],
    bodySchema: federatedAuthUnlinkSchema,
    paramsSchema: identityParams,
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
registerUserRoutes();
registerSetupRoutes();
registerFederatedAuthRoutes();

const generator = new OpenApiGeneratorV3(registry.definitions);

const openapi = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'LightTickets API',
    version: '1.0.0',
    description: 'LightTickets API 文档',
  },
  servers: [{ url: 'http://localhost:23320', description: 'Development server' }],
});

const outputPath = path.resolve('openapi.json');
fs.writeFileSync(outputPath, JSON.stringify(openapi, null, 2), 'utf-8');
const pathCount = Object.keys(openapi.paths || {}).length;
console.log(`[openapi] Generated ${outputPath} with ${pathCount} paths`);

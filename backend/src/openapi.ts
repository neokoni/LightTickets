import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

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
  responseSchema?: z.ZodType;
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
      ...(def.bodySchema && {
        body: {
          content: { 'application/json': { schema: def.bodySchema } },
        },
      }),
    },
    responses: {
      ...(def.responseSchema
        ? {
            '200': {
              description: 'Success',
              content: { 'application/json': { schema: def.responseSchema } },
            },
          }
        : {
            '200': { description: 'Success' },
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
    }),
  });
  registerRoute({
    method: 'get',
    path: '/api/tickets',
    summary: '获取议题列表',
    auth: 'conditional',
    tags: ['Tickets'],
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
      gameContext: z.string().optional(),
    }),
  });
  registerRoute({
    method: 'get',
    path: '/api/mc/tickets/{uuid}',
    summary: 'MC 获取玩家议题',
    auth: 'apiKey',
    tags: ['MC'],
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
    }),
  });
  registerRoute({
    method: 'patch',
    path: '/api/admin/templates/{name}',
    summary: '更新模板',
    auth: 'admin',
    tags: ['Admin Templates'],
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
      driver: z.enum(['local', 's3']),
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
  });
  registerRoute({
    method: 'post',
    path: '/api/setup',
    summary: '执行初始化设置',
    auth: 'none',
    tags: ['Setup'],
    bodySchema: z.object({
      db: z.object({
        provider: z.enum(['sqlite', 'mysql']),
        databaseUrl: z.string().optional(),
        host: z.string().optional(),
        port: z.number().int().positive().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        database: z.string().optional(),
      }),
      admin: z.object({
        email: z.string().email(),
        password: z.string().min(6),
        username: z.string().min(2).max(30),
      }),
      site: z
        .object({ siteName: z.string().optional(), siteUrl: z.string().optional() })
        .optional(),
      mc: z.object({ defaultServerName: z.string().optional() }).optional(),
      storage: z
        .object({
          driver: z.enum(['local', 's3']),
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
    }),
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
      siteName: z.string().min(1).max(100).optional(),
      siteUrl: z.string().url().nullable().optional(),
      footerContent: z.string().max(2000).nullable().optional(),
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

registerHealthRoute();
registerAuthRoutes();
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

const generator = new OpenApiGeneratorV3(registry.definitions);

const openapi = generator.generateDocument({
  openapi: '3.0.0',
  info: {
    title: 'LightTickets API',
    version: '1.0.0',
    description: 'LightTickets 工单系统 API 文档',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Development server' }],
});

const outputPath = path.resolve('openapi.json');
fs.writeFileSync(outputPath, JSON.stringify(openapi, null, 2), 'utf-8');
const pathCount = Object.keys(openapi.paths || {}).length;
console.log(`[openapi] Generated ${outputPath} with ${pathCount} paths`);

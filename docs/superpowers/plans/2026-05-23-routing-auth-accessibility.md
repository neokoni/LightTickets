# 路由守卫重构 — Setup 保护、主题切换、公开/登录控制 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复路由守卫重定向逻辑，为 Setup 页面添加主题切换，实现公开/登录访问控制。

**Architecture:** 后端新增 `requireLogin` 字段和内存缓存，前端路由守卫按 setup→requireLogin→auth→admin 的严格顺序检查。Setup 页面独立添加主题按钮。议题列表/详情在公开模式下无需认证。

**Tech Stack:** Vue 3.5, Vue Router, Pinia, Express, Prisma, TailwindCSS 4

---

## 文件结构

### 后端修改

| 文件 | 变更 | 职责 |
|------|------|------|
| `backend/prisma/schema.prisma` | 修改 | SetupStatus 新增 requireLogin 字段 |
| `backend/src/services/setup.service.ts` | 修改 | 内存缓存、新增 getSiteConfig、updateSettings |
| `backend/src/routes/setup.ts` | 修改 | 移除 /status，新增 /site-config 和 /settings 路由 |
| `backend/src/routes/tickets.ts` | 修改 | GET 路由条件认证 |
| `backend/src/app.ts` | 修改 | 新增 /api/site-config 路由挂载 |
| `backend/src/middleware/auth.ts` | 修改 | 新增 optionalAuthMiddleware |

### 前端修改

| 文件 | 变更 | 职责 |
|------|------|------|
| `frontend/src/api/setup.ts` | 修改 | 移除 getSetupStatus，新增 getSiteConfig、updateSettings |
| `frontend/src/router/index.ts` | 修改 | 守卫逻辑重构，新增 meta.public，缓存 requireLogin |
| `frontend/src/views/SetupView.vue` | 修改 | 添加主题切换按钮 |
| `frontend/src/views/admin/AdminSettingsView.vue` | 修改 | 添加 requireLogin 开关 |
| `frontend/src/components/layout/AppHeader.vue` | 修改 | logout 行为根据 requireLogin 变化 |
| `frontend/src/stores/auth.ts` | 修改 | logout 返回 requireLogin 状态 |
| `frontend/src/views/TicketListView.vue` | 修改 | 未登录时隐藏"新建"按钮或改为登录链接 |
| `frontend/src/views/TicketDetailView.vue` | 修改 | 未登录时隐藏评论表单和状态操作 |

---

### Task 1: 数据库 — 添加 requireLogin 字段

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: 修改 schema 添加 requireLogin 字段**

在 `SetupStatus` 模型中 `siteUrl` 行后添加：

```prisma
  requireLogin Boolean @default(false) @map("require_login")
```

完整的 `SetupStatus` 模型：

```prisma
model SetupStatus {
  id           String   @id @default(cuid())
  isSetup      Boolean  @default(false) @map("is_setup")
  siteName     String   @default("LightTickets") @map("site_name")
  siteUrl      String?  @map("site_url")
  requireLogin Boolean  @default(false) @map("require_login")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  @@map("setup_status")
}
```

- [ ] **Step 2: 创建并运行迁移**

Run: `cd /home/neokoni/projects/LightTicketss/backend && npx prisma migrate dev --name add_require_login`

- [ ] **Step 3: 生成 Prisma 客户端**

Run: `cd /home/neokoni/projects/LightTicketss/backend && npx prisma generate`

- [ ] **Step 4: 提交**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add requireLogin field to SetupStatus model"
```

---

### Task 2: 后端 — 内存缓存与 site-config / settings API

**Files:**
- Modify: `backend/src/services/setup.service.ts`
- Modify: `backend/src/routes/setup.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: 修改 setup.service.ts 添加内存缓存和新方法**

在文件顶部添加缓存变量和 `SiteConfig` 接口，修改 `getSetupStatus` 使用缓存，新增 `getSiteConfig`、`updateSettings`：

```typescript
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { AppError, ValidationError } from '../utils/errors.js';
import { generateTokens } from '../utils/token.js';

const prisma = new PrismaClient();

export interface SiteConfig {
  isSetup: boolean;
  requireLogin: boolean;
  siteName: string;
}

let cachedSiteConfig: SiteConfig | null = null;

export function invalidateSiteCache() {
  cachedSiteConfig = null;
}

export async function getSiteConfig(): Promise<SiteConfig> {
  if (cachedSiteConfig) return cachedSiteConfig;
  const status = await prisma.setupStatus.findFirst();
  cachedSiteConfig = {
    isSetup: status?.isSetup ?? false,
    requireLogin: status?.requireLogin ?? false,
    siteName: status?.siteName ?? 'LightTickets',
  };
  return cachedSiteConfig;
}

export async function getSetupStatus() {
  const status = await prisma.setupStatus.findFirst();
  return {
    isSetup: status?.isSetup ?? false,
    siteName: status?.siteName ?? 'LightTickets',
  };
}

export async function updateSettings(data: { requireLogin?: boolean }) {
  const status = await prisma.setupStatus.findFirst();
  if (!status) throw new AppError(404, '站点尚未初始化');

  const updated = await prisma.setupStatus.update({
    where: { id: status.id },
    data: {
      ...(data.requireLogin !== undefined && { requireLogin: data.requireLogin }),
    },
  });

  invalidateSiteCache();

  return {
    requireLogin: updated.requireLogin,
    siteName: updated.siteName,
  };
}
```

保留 `completeSetup` 不变，但在其末尾、`return` 之前添加一行清除缓存：

在 `completeSetup` 函数中，`const tokens = generateTokens(admin.id, admin.role);` 之前添加：

```typescript
  invalidateSiteCache();
```

- [ ] **Step 2: 修改 setup.ts 路由，添加 /site-config 和 /settings**

将 `backend/src/routes/setup.ts` 改为：

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as setupService from '../services/setup.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

const setupSchema = z.object({
  db: z.object({
    provider: z.enum(['sqlite', 'mysql']),
    databaseUrl: z.string().min(1),
  }),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    username: z.string().min(2).max(30),
  }),
  site: z.object({
    siteName: z.string().optional(),
    siteUrl: z.string().optional(),
  }).optional(),
  mc: z.object({
    defaultServerName: z.string().optional(),
  }).optional(),
});

// GET /api/site-config - public, no auth required
router.get('/site-config', async (_req: Request, res: Response) => {
  const config = await setupService.getSiteConfig();
  res.json(config);
});

// POST /api/setup - perform initial setup
router.post('/', async (req: Request, res: Response) => {
  const parsed = setupSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const result = await setupService.completeSetup(parsed.data);
  res.status(201).json(result);
});

// PATCH /api/setup/settings - admin only
router.patch('/settings', authMiddleware, requireRole('admin'), async (req: Request, res: Response) => {
  const schema = z.object({
    requireLogin: z.boolean().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const result = await setupService.updateSettings(parsed.data);
  res.json(result);
});

export default router;
```

- [ ] **Step 3: 修改 app.ts 挂载 site-config**

在 `app.ts` 中，setup 路由的挂载方式改为让 `/api/setup/site-config` 可以不带认证工作。当前 `app.use('/api/setup', setupRoutes)` 已经生效，因为 `/site-config` 路由本身不加 `authMiddleware`，无需修改 `app.ts`。

验证：确认 `app.ts` 无需修改。

- [ ] **Step 4: 提交**

```bash
git add backend/src/services/setup.service.ts backend/src/routes/setup.ts
git commit -m "feat: add site-config and settings API with in-memory cache"
```

---

### Task 3: 后端 — 议题路由条件认证

**Files:**
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/routes/tickets.ts`

- [ ] **Step 1: 在 auth.ts 添加 optionalAuthMiddleware**

在 `backend/src/middleware/auth.ts` 末尾追加：

```typescript
export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next();
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = payload;
  } catch {
    // invalid token, proceed without auth
  }
  next();
}
```

- [ ] **Step 2: 修改 tickets.ts 使用条件认证**

将 `backend/src/routes/tickets.ts` 的 `router.use(authMiddleware);` 改为逐路由指定。关键改动：GET 列表和 GET 详情用 `optionalAuthMiddleware`，其他路由用 `authMiddleware`：

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as ticketService from '../services/ticket.service.js';
import * as labelService from '../services/label.service.js';
import * as permissionService from '../services/permission.service.js';
import * as setupService from '../services/setup.service.js';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  type: z.enum(['bug_report', 'permission_request', 'suggestion', 'report']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  serverId: z.string().optional(),
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const ticket = await ticketService.create({ ...parsed.data, authorId: req.user!.userId });
  res.status(201).json(ticket);
});

router.get('/', async (req: Request, res: Response) => {
  const { requireLogin } = await setupService.getSiteConfig();
  if (requireLogin) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: '缺少认证令牌' });
    }
    try {
      const jwt = await import('jsonwebtoken');
      const { config } = await import('../config.js');
      const payload = jwt.verify(header.slice(7), config.jwtSecret);
      (req as any).user = payload;
    } catch {
      return res.status(401).json({ error: '无效的认证令牌' });
    }
  } else {
    // public mode: try to attach user if token present, but don't require it
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const jwt = await import('jsonwebtoken');
        const { config } = await import('../config.js');
        const payload = jwt.verify(header.slice(7), config.jwtSecret);
        (req as any).user = payload;
      } catch {}
    }
  }

  const result = await ticketService.list({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    status: req.query.status as any,
    type: req.query.type as any,
    authorId: req.query.authorId as string,
    serverId: req.query.serverId as string,
    labelId: req.query.labelId as string,
    search: req.query.search as string,
  });
  res.json(result);
});

router.get('/:id', async (req: Request, res: Response) => {
  const { requireLogin } = await setupService.getSiteConfig();
  if (requireLogin) {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ error: '缺少认证令牌' });
    }
    try {
      const jwt = await import('jsonwebtoken');
      const { config } = await import('../config.js');
      const payload = jwt.verify(header.slice(7), config.jwtSecret);
      (req as any).user = payload;
    } catch {
      return res.status(401).json({ error: '无效的认证令牌' });
    }
  }

  const ticket = await ticketService.getById(req.params.id);
  res.json(ticket);
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.update(req.params.id, req.user!.userId, req.user!.role, req.body);
  res.json(ticket);
});

router.post('/:id/approve', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const ticket = await permissionService.approve(req.params.id, req.user!.userId);
  res.json(ticket);
});

router.post('/:id/reject', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const ticket = await permissionService.reject(req.params.id, req.user!.userId, req.body.reason);
  res.json(ticket);
});

// Labels
router.post('/:id/labels', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const { labelId } = req.body;
  if (!labelId) throw new ValidationError('标签ID不能为空');
  await labelService.addToTicket(req.params.id, labelId);
  res.status(201).end();
});

router.delete('/:id/labels/:labelId', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  await labelService.removeFromTicket(req.params.id, req.params.labelId);
  res.status(204).end();
});

export default router;
```

注意：GET 路由使用内联条件认证逻辑（调用 `setupService.getSiteConfig()` 获取内存缓存值），避免动态 import 带来的问题。其他路由仍然使用 `authMiddleware`。

- [ ] **Step 3: 重构 — 提取条件认证为中间件避免重复**

上述 GET 路由中的认证逻辑重复了。在 `auth.ts` 中添加一个基于 `requireLogin` 的条件中间件：

在 `backend/src/middleware/auth.ts` 末尾追加：

```typescript
import { getSiteConfig } from '../services/setup.service.js';

export async function conditionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const { requireLogin } = await getSiteConfig();

  if (!requireLogin) {
    // public mode: attach user if token present, but don't require it
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      try {
        const payload = jwt.verify(header.slice(7), config.jwtSecret) as AuthPayload;
        req.user = payload;
      } catch {}
    }
    return next();
  }

  // requireLogin mode: must have valid token
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('缺少认证令牌或格式不正确');
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    throw new UnauthorizedError('无效的认证令牌');
  }
}
```

然后简化 `tickets.ts` 中的 GET 路由，使用 `conditionalAuthMiddleware`：

```typescript
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';

// ...

router.get('/', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const result = await ticketService.list({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    status: req.query.status as any,
    type: req.query.type as any,
    authorId: req.query.authorId as string,
    serverId: req.query.serverId as string,
    labelId: req.query.labelId as string,
    search: req.query.search as string,
  });
  res.json(result);
});

router.get('/:id', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.getById(req.params.id);
  res.json(ticket);
});
```

其余路由保持使用 `authMiddleware`。

- [ ] **Step 4: 提交**

```bash
git add backend/src/middleware/auth.ts backend/src/routes/tickets.ts
git commit -m "feat: conditional auth for public ticket access"
```

---

### Task 4: 后端 — 评论路由条件认证

**Files:**
- Modify: `backend/src/routes/comments.ts`

- [ ] **Step 1: 修改 comments.ts，GET 评论使用条件认证**

将 `router.use(authMiddleware)` 改为逐路由指定。GET 评论在公开模式下无需认证，创建评论始终要求认证：

```typescript
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as commentService from '../services/comment.service.js';
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';

const router = Router({ mergeParams: true });

const createSchema = z.object({
  body: z.string().min(1),
});

router.get('/', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const comments = await commentService.listByTicket(req.params.id);
  res.json(comments);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const comment = await commentService.create(req.params.id, req.user!.userId, parsed.data.body);
  res.status(201).json(comment);
});

export default router;
```

- [ ] **Step 2: 提交**

```bash
git add backend/src/routes/comments.ts
git commit -m "feat: conditional auth for public comment viewing"
```

---

### Task 5: 前端 — API 层更新

**Files:**
- Modify: `frontend/src/api/setup.ts`

- [ ] **Step 1: 更新 setup.ts API 文件**

移除 `getSetupStatus`（已被 `getSiteConfig` 替代），新增 `getSiteConfig`、`updateSettings`：

```typescript
import { apiFetch } from './client';

export interface SiteConfig {
  isSetup: boolean;
  requireLogin: boolean;
  siteName: string;
}

export interface SetupPayload {
  db: {
    provider: 'sqlite' | 'mysql';
    databaseUrl: string;
  };
  admin: {
    email: string;
    password: string;
    username: string;
  };
  site?: {
    siteName?: string;
    siteUrl?: string;
  };
  mc?: {
    defaultServerName?: string;
  };
}

export interface SetupResult {
  setup: {
    id: number;
    isSetup: boolean;
    siteName: string;
    siteUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  admin: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
  accessToken: string;
  refreshToken: string;
}

export interface SettingsResult {
  requireLogin: boolean;
  siteName: string;
}

export async function getSiteConfig(): Promise<SiteConfig> {
  return apiFetch<SiteConfig>('/setup/site-config', { method: 'GET' });
}

export async function completeSetup(payload: SetupPayload): Promise<SetupResult> {
  return apiFetch<SetupResult>('/setup', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateSettings(data: { requireLogin?: boolean }): Promise<SettingsResult> {
  return apiFetch<SettingsResult>('/setup/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/api/setup.ts
git commit -m "feat: add getSiteConfig and updateSettings API, remove getSetupStatus"
```

---

### Task 6: 前端 — 路由守卫重构

**Files:**
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: 重写路由守卫**

替换整个 `frontend/src/router/index.ts` 内容：

```typescript
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { getSiteConfig } from '@/api/setup'

// Site config cache (persists per session)
function getCachedSiteConfig() {
  const isSetup = sessionStorage.getItem('lt-setup-checked')
  const requireLogin = sessionStorage.getItem('lt-require-login')
  return {
    isSetup: isSetup === 'true' ? true : isSetup === 'false' ? false : null,
    requireLogin: requireLogin === 'true' ? true : requireLogin === 'false' ? false : null,
  }
}

export let siteConfig = getCachedSiteConfig()

function updateSiteConfigCache(data: { isSetup: boolean; requireLogin: boolean }) {
  siteConfig = { isSetup: data.isSetup, requireLogin: data.requireLogin }
  sessionStorage.setItem('lt-setup-checked', String(data.isSetup))
  sessionStorage.setItem('lt-require-login', String(data.requireLogin))
}

export function invalidateSiteConfigCache() {
  siteConfig = { isSetup: null, requireLogin: null }
  sessionStorage.removeItem('lt-setup-checked')
  sessionStorage.removeItem('lt-require-login')
}

export function setRequireLoginCache(value: boolean) {
  siteConfig.requireLogin = value
  sessionStorage.setItem('lt-require-login', String(value))
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/setup',
      name: 'setup',
      component: () => import('@/views/SetupView.vue'),
      meta: { setup: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'tickets',
      component: () => import('@/views/TicketListView.vue'),
      meta: { public: true },
    },
    {
      path: '/tickets/new',
      name: 'ticket-create',
      component: () => import('@/views/TicketCreateView.vue'),
      meta: { auth: true },
    },
    {
      path: '/tickets/:id',
      name: 'ticket-detail',
      component: () => import('@/views/TicketDetailView.vue'),
      meta: { public: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { auth: true },
    },
    {
      path: '/admin',
      component: () => import('@/views/admin/AdminLayout.vue'),
      meta: { auth: true, admin: true },
      children: [
        { path: '', redirect: '/admin/labels' },
        { path: 'labels', name: 'admin-labels', component: () => import('@/views/admin/AdminLabelsView.vue') },
        { path: 'servers', name: 'admin-servers', component: () => import('@/views/admin/AdminServersView.vue') },
        { path: 'users', name: 'admin-users', component: () => import('@/views/admin/AdminUsersView.vue') },
        { path: 'settings', name: 'admin-settings', component: () => import('@/views/admin/AdminSettingsView.vue') },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // 1. Wait for auth restore
  if (auth.loading) {
    await auth.restore()
  }

  // 2. Fetch site config if not cached
  if (siteConfig.isSetup === null) {
    try {
      const config = await getSiteConfig()
      updateSiteConfigCache(config)
    } catch {
      // API unreachable: assume not setup
      siteConfig.isSetup = false
      siteConfig.requireLogin = false
      sessionStorage.setItem('lt-setup-checked', 'false')
      sessionStorage.setItem('lt-require-login', 'false')
    }
  }

  // 3. Setup page protection
  if (to.meta.setup && siteConfig.isSetup) {
    return { name: 'login' }
  }

  // 4. If not setup, only allow setup page
  if (!siteConfig.isSetup && to.name !== 'setup') {
    return { name: 'setup' }
  }

  // 5. requireLogin check
  const requireLogin = siteConfig.requireLogin === true

  if (!auth.isAuthenticated) {
    // requireLogin ON: all non-guest routes require auth
    if (requireLogin && !to.meta.guest && !to.meta.setup) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    // requireLogin OFF: only meta.auth routes require auth
    if (!requireLogin && to.meta.auth) {
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    // requireLogin OFF + meta.public: allow
  }

  // 6. Already logged in visiting guest routes → go home
  if (auth.isAuthenticated && to.meta.guest) {
    return { name: 'tickets' }
  }

  // 7. Admin check
  if (to.meta.admin && !auth.isAdmin) {
    return { name: 'tickets' }
  }
})

export default router
```

- [ ] **Step 2: 更新 SetupView.vue 中的 import 引用**

在 `SetupView.vue` 中，将 `import('@/router').then((mod) => { mod.setupChecked = true })` 改为使用新的缓存函数：

```typescript
import { setRequireLoginCache } from '@/router'

// ... 在 submit 函数中：
// 旧: import('@/router').then((mod) => { mod.setupChecked = true })
// 新: 
import('@/router').then((mod) => {
  mod.setRequireLoginCache(false) // default: public mode after setup
  // Also mark setup as complete
  sessionStorage.setItem('lt-setup-checked', 'true')
  mod.siteConfig.isSetup = true
})
```

同时移除旧的 `sessionStorage.setItem('setup-checked', 'true')`（行 101），因为上面已经处理了。

- [ ] **Step 3: 验证路由无无限重定向**

手动测试场景：
1. 未 setup → 访问任意页 → 应跳转 /setup
2. 已 setup → 访问 /setup → 应跳转 /login
3. requireLogin=true + 未登录 → / → /login
4. requireLogin=false + 未登录 → / → 显示议题列表
5. 已登录 → /login → / (议题列表)

- [ ] **Step 4: 提交**

```bash
git add frontend/src/router/index.ts frontend/src/views/SetupView.vue
git commit -m "feat: rewrite route guard with setup/login/public logic"
```

---

### Task 7: 前端 — Setup 页面主题切换按钮

**Files:**
- Modify: `frontend/src/views/SetupView.vue`

- [ ] **Step 1: 添加主题切换按钮**

在 `<script setup>` 中添加 import：

```typescript
import { useUiStore } from '@/stores/ui'
import { Icon } from '@iconify/vue'

const ui = useUiStore()
```

在模板外层 `<div>` 添加 `relative` class，并在内部最前面添加主题切换按钮：

在 `<div class="min-h-screen ...">` 的 class 中添加 `relative`：

```html
<div class="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 relative">
```

在容器 `<div class="w-full max-w-xl ...">` 之前（即外层 div 内开头）添加：

```html
<div class="absolute top-4 right-4">
  <button
    @click="ui.toggleTheme()"
    class="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
    :aria-label="ui.theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'"
  >
    <Icon :icon="ui.theme === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="w-5 h-5" />
  </button>
</div>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/views/SetupView.vue
git commit -m "feat: add theme toggle to setup page"
```

---

### Task 8: 前端 — 登出行为变更

**Files:**
- Modify: `frontend/src/stores/auth.ts`
- Modify: `frontend/src/components/layout/AppHeader.vue`

- [ ] **Step 1: 修改 auth store 的 logout 方法**

不需要在 store 里直接做路由跳转（store 不应依赖 router）。让 `logout` 保持简单，只清除状态。路由跳转由调用方负责。

`auth.ts` 的 `logout` 方法保持不变（当前已经是只清除 token 和 user）。

- [ ] **Step 2: 修改 AppHeader.vue 的登出逻辑**

在 AppHeader.vue 中，修改两处 logout 点击事件：

**桌面端下拉菜单中的退出按钮**（约行 45）：

将：
```html
<button @click="auth.logout()" class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700">退出登录</button>
```

改为：
```html
<button @click="handleLogout" class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700">退出登录</button>
```

**移动端菜单中的退出按钮**（约行 93）：

将：
```html
<button @click="auth.logout(); ui.mobileMenuOpen = false" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
```

改为：
```html
<button @click="handleLogout" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
```

在 `<script setup>` 中添加：

```typescript
import { useRouter } from 'vue-router'
import { siteConfig } from '@/router'

const router = useRouter()

function handleLogout() {
  auth.logout()
  ui.mobileMenuOpen = false
  if (siteConfig.requireLogin) {
    router.push({ name: 'login' })
  }
}
```

注意：AppHeader.vue 已经 import 了 `useAuthStore` 和 `useUiStore`，只需新增 `useRouter` 和 `siteConfig` 的 import。

- [ ] **Step 3: 同样修改 api/client.ts 中的 401 自动跳转**

在 `client.ts` 中（约行 63），当前 `401` 时会 `window.location.href = '/login'`。这个在 `requireLogin=false` 时不对，因为公开模式下用户可能只是 `token` 过期了不应强制跳转登录页。

将：
```typescript
window.location.href = '/login'
throw new Error('Session expired')
```

改为：
```typescript
// In public mode, just clear the token and let the page continue
accessToken = null
localStorage.removeItem('lt-refresh-token')
throw new Error('Session expired')
```

这样在公开模式下，`401` 只是清除过期的 `token`，不会强制跳转登录页。页面上的写操作会显示错误提示，但读操作仍然可以继续。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/stores/auth.ts frontend/src/components/layout/AppHeader.vue frontend/src/api/client.ts
git commit -m "feat: logout redirects to login only when requireLogin is on"
```

---

### Task 9: 前端 — 未登录用户 UI 适配

**Files:**
- Modify: `frontend/src/views/TicketListView.vue`
- Modify: `frontend/src/views/TicketDetailView.vue`

- [ ] **Step 1: TicketListView.vue — 未登录时"新建"按钮改为登录链接**

将行 80：
```html
<BaseButton as="router-link" to="/tickets/new" size="sm" icon="lucide:plus">新建</BaseButton>
```

改为：
```html
<BaseButton v-if="auth.isAuthenticated" as="router-link" to="/tickets/new" size="sm" icon="lucide:plus">新建</BaseButton>
<RouterLink v-else to="/login" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">登录以创建议题</RouterLink>
```

在 `<script setup>` 中添加 `import { useAuthStore } from '@/stores/auth'` 和 `const auth = useAuthStore()`。

- [ ] **Step 2: TicketDetailView.vue — 未登录时隐藏评论表单和操作按钮**

在评论表单（约行 136-142 的 `<form>` 标签）外层加 `v-if="auth.isAuthenticated"`：

```html
<form v-if="auth.isAuthenticated" @submit.prevent="submitComment" class="space-y-3">
```

`TicketDetailView.vue` 已有 `const auth = useAuthStore()`，无需新增 import。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/views/TicketListView.vue frontend/src/views/TicketDetailView.vue
git commit -m "feat: adapt UI for unauthenticated users in public mode"
```

---

### Task 10: 前端 — Admin 设置页面 requireLogin 开关

**Files:**
- Modify: `frontend/src/views/admin/AdminSettingsView.vue`

- [ ] **Step 1: 实现 AdminSettingsView 完整内容**

替换整个 `AdminSettingsView.vue`：

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSiteConfig, updateSettings } from '@/api/setup'
import { setRequireLoginCache } from '@/router'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const requireLogin = ref(false)
const loading = ref(false)
const saving = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const config = await getSiteConfig()
    requireLogin.value = config.requireLogin
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  try {
    const result = await updateSettings({ requireLogin: requireLogin.value })
    setRequireLoginCache(result.requireLogin)
    ui.toast('设置已保存', 'success')
  } catch (e: any) {
    ui.toast(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-lg font-semibold text-slate-900 dark:text-white">平台设置</h2>

    <div v-if="loading" class="py-4 text-center text-slate-400">加载中...</div>

    <div v-else class="space-y-4 max-w-lg">
      <div class="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">要求登录查看议题</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">开启后，未登录用户将无法查看议题列表和详情</p>
        </div>
        <button
          @click="requireLogin = !requireLogin"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
          :class="requireLogin ? 'bg-slate-900 dark:bg-slate-100' : 'bg-slate-200 dark:bg-slate-700'"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform"
            :class="requireLogin ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <button
        @click="save"
        :disabled="saving"
        class="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-colors disabled:opacity-50"
      >
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/views/admin/AdminSettingsView.vue
git commit -m "feat: add requireLogin toggle to admin settings"
```

---

### Task 11: 端到端测试与清理

**Files:**
- 无新文件

- [ ] **Step 1: 验证后端启动无报错**

Run: `cd /home/neokoni/projects/LightTicketss/backend && npm run dev`

确认没有 TypeScript 编译错误。

- [ ] **Step 2: 验证前端启动无报错**

Run: `cd /home/neokoni/projects/LightTicketss/frontend && npm run dev`

确认没有 TypeScript 编译错误。

- [ ] **Step 3: 手动测试场景清单**

1. **未 setup 状态** → 访问 `/` → 应重定向到 `/setup`
2. **已 setup + requireLogin=false + 未登录** → `/` → 显示议题列表，无"新建"按钮，有"登录以创建议题"链接
3. **已 setup + requireLogin=false + 未登录** → `/tickets/:id` → 显示议题详情，无评论表单
4. **已 setup + requireLogin=false + 未登录** → `/tickets/new` → 重定向到 `/login`
5. **已 setup + requireLogin=true + 未登录** → `/` → 重定向到 `/login`
6. **已 setup + requireLogin=true + 登录后退出** → 重定向到 `/login`
7. **已 setup + requireLogin=false + 登录后退出** → 停留在当前页面
8. **已 setup → 访问 `/setup`** → 重定向到 `/login`
9. **Setup 页面** → 右上角有主题切换按钮，样式与导航栏一致
10. **Admin 设置页** → "要求登录查看议题"开关可切换，保存后生效

- [ ] **Step 4: 最终提交（如有修复）**

如果有任何修复，做最终提交。

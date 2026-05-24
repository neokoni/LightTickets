# 路由守卫重构 — Setup 保护、主题切换、公开/登录控制

日期：2026-05-23

## 背景

当前存在三个问题：
1. 首次访问已 setup 的实例时，路由守卫会错误地重定向到 `/setup`（因为 `setupChecked === null` 且目标不是 setup 跨由时直接跳 setup，而非先判断是否已 setup）
2. Setup 页面没有主题切换按钮
3. 所有议题页面强制登录，没有公开访问模式；退出登录后仍留在主页面而非回到登录页

## 设计

### 一、路由守卫与重定向

**守卫执行顺序（严格按此顺序）：**

1. 等待 `auth.restore()` 完成
2. Setup 检查 — `setupChecked === null` 时调用 `GET /api/site-config`，缓存 `isSetup` 和 `requireLogin` 到 `sessionStorage`。如果 `!isSetup` → `/setup`
3. Setup 跨由保护 — 访问 `/setup` 且已 setup → 重定向到 `/login`（而非 `/` 或 `/tickets`），避免循环
4. requireLogin 检查：
   - `requireLogin = true` + 未登录 + 目标非 guest 跨由 → `/login`
   - `requireLogin = false` + 未登录 + `meta.auth` 路由 → `/login?redirect=...`
   - `requireLogin = false` + 未登录 + `meta.public` 路由 → 放行
5. 已登录用户访问 guest 跨由 → `/`
6. Admin 权限检查（不变）

**防无限重定向：** 每个守卫分支的目标路由不会被同一守卫二次拦截。setup→login 不被 setup 守卫拦截，login→tickets 不被 guest 守卫拦截。

**路由 meta 变更：**

- `/` 和 `/tickets/:id` 增加 `meta.public: true`
- `/tickets/new` 保持 `meta.auth: true`
- `/login` 和 `/register` 保持 `meta.guest: true`

**后端 setup 状态缓存：**

- `getSetupStatus` 在内存中缓存结果，完成 setup 后标记内存变量，不再每次查数据库
- `GET /api/site-config` 利用同一缓存

### 二、Setup 页面主题切换

Setup 页面不使用 AppShell（无 AppHeader），在页面容器右上角添加独立主题切换按钮：

- 外层 `<div>` 加 `relative`
- 右上角绝对定位按钮，样式与 AppHeader 主题按钮完全一致：
  `p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors`
- 图标使用 `lucide:sun / lucide:moon`
- 调用 `useUiStore().toggleTheme()`

不引入整个导航栏，只添加单个按钮。

### 三、公开/登录控制

**数据库变更：**

`SetupStatus` 新增字段：

```prisma
requireLogin Boolean @default(false) @map("require_login")
```

默认 `false` = 公开模式。

**API 变更：**

- `GET /api/site-config` — 公开接口，无需认证，返回 `{ isSetup, requireLogin, siteName }`。此接口替代路由守卫中对 `GET /api/setup/status` 的调用
- `GET /api/setup/status` — 移除，功能合并到 `GET /api/site-config`
- `PATCH /api/admin/settings` — 管理员可更新 `requireLogin`

**后端议题访问控制：**

- 公开模式下，`GET /api/tickets` 和 `GET /api/tickets/:id` 不需要认证
- 创建议题、评论等写操作始终要求认证
- 实现方式：将 `router.use(authMiddleware)` 改为逐路由指定。GET 列表和 GET 详情路由前加条件判断：若内存缓存的 `requireLogin` 为 true 则应用 `authMiddleware`，否则跳过

**登出行为：**

- `requireLogin = true` 时登出 → `router.push({ name: 'login' })`
- `requireLogin = false` 时登出 → 停留在当前页面，刷新组件状态

**前端管理页面：**

AdminSettingsView 增加"要求登录查看议题"开关（toggle），调用 `PATCH /api/admin/settings` 更新 `requireLogin`。更新后前端缓存也同步刷新。

**前端 site-config 缓存：**

- 首次加载时从 `GET /api/site-config` 获取 `isSetup` 和 `requireLogin`
- 存储到 `sessionStorage`：`setup-checked` 和 `site-require-login`
- 管理员更新设置后，前端刷新缓存值

## 影响范围

- `frontend/src/router/index.ts` — 守卫逻辑重构
- `frontend/src/views/SetupView.vue` — 添加主题切换按钮
- `frontend/src/views/admin/AdminSettingsView.vue` — 添加 requireLogin 开关
- `frontend/src/api/setup.ts` — 新增 `getSiteConfig` API
- `frontend/src/stores/auth.ts` — logout 行为变更
- `backend/src/services/setup.service.ts` — 内存缓存 + 新增 settings 服务
- `backend/src/routes/setup.ts` — 新增 site-config 跨由，移除 status 跨由，新增 settings 跨由
- `backend/src/routes/tickets.ts` — 条件认证中间件
- `backend/prisma/schema.prisma` — SetupStatus 新增 requireLogin 字段
- `frontend/src/components/layout/AppHeader.vue` — logout 按钮行为变更
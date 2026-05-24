# LightTickets 项目约束与需求文档

> 本文档记录 LightTickets 在开发、部署、运行过程中必须遵循的约束条件与项目需求。  
> **最后更新:** 2025-05-20

---

## 一、语言与国际化约束

### 1.1 全站统一中文
- **后端错误信息**必须使用中文返回给前端。所有业务错误（包括但不限于 `AppError`、`ValidationError`、`NotFoundError`、`UnauthorizedError`、`ForbiddenError`）的 message 均为中文。
- **前端界面文案**（按钮、标题、表单标签、空状态、提示 toast 等）统一使用简体中文。
- **日志与内部调试**可保留英文，但对外暴露的 API 响应必须中文。
- **数据库字段**使用英文（Prisma schema 标准做法），但前端展示时翻译为中文。

### 1.2 本地化文件
- 后端新增业务错误消息时，应同步在 `backend/src/locales/zh-CN.ts` 中维护 `Errors` 常量，供团队查阅，但代码中直接内联字符串即可。

---

## 二、设计与样式约束

### 2.1 强调色（Accent Color）
- 不使用自建颜色管理系统，直接使用 TailwindCSS 原生色板。
- **亮色模式**：Primary 按钮使用 `bg-black text-gray-100`，hover 为 `bg-gray-800`。
- **暗色模式**：Primary 按钮使用 `bg-slate-800 text-slate-100`，hover 为 `bg-slate-700`，与页面深色背景协调。
- 链接文字使用 `text-slate-900 dark:text-slate-100`，焦点环使用 `ring-slate-900/40 dark:ring-slate-100/40`。
- 使用 BaseButton 组件统一管理按钮样式，通过 `as` prop 支持渲染为 `router-link`。

### 2.2 配色方案响应
- 不再使用 `@theme` 中的 `--color-accent-*` CSS 变量，所有颜色由 Tailwind 原生 class + `dark:` 变体控制。
- `app.css` 的 `@theme` 块仅保留 `--font-sans` 字体定义。
- 文本颜色、边框颜色、表单输入框的背景与边框在深色模式下需使用 `slate` 体系的暗色值（`#334155`、`#1e293b` 等），不能依赖浏览器默认反色。

---

## 三、架构与部署约束

### 3.1 前后端分离与代理
- 前端为 **Vue 3 SPA**，运行在 Vite 开发服务器（默认端口 `5173`，开发时可能漂移至 `5174`、`5175`）。
- 后端为 **Express API**，开发运行时固定监听端口 `3000`。
- 前端通过 Vite 的 `server.proxy` 将 `/api` 请求反向代理到 `http://localhost:3000`。
- **前端绝对禁止硬编码后端地址**（除开发代理外），所有请求都基于 `/api` 相对路径。

### 3.2 后端进程管理
- Express 进程使用 `tsx watch` 启动，文件变更会自动重启。
- **致命约束**：如果后端进程是在某个路由文件（如 `src/routes/setup.ts`）创建**之前**启动的，`tsx watch` 仅会热加载已有文件的新内容，**不会自动加载全新模块**。必须执行以下步骤才能识别新路由：
  1. 找到并杀死原进程：`lsof -ti:3000 | xargs kill -9`
  2. 重新执行 `npm run dev`
- 开发阶段出现 `404 Not Found` 但代码存在时，首要排查项即为此问题。

### 3.3 数据库支持
- Prisma 支持 `sqlite` 与 `mysql` 两种 provider。
- Setup 向导中：
  - **SQLite** 直接输入文件路径（如 `file:./dev.db`）。
  - **MySQL** 支持两种输入模式：
    1. 字段模式：分别输入 host、port、user、password、database，由前端拼接成 connection URL。
    2. URL 模式：直接粘贴 `mysql://user:pass@host:3306/db` 格式字符串。
- **生产环境必须使用 MySQL**，SQLite 仅用于开发或小规模场景。
- 一旦完成 Setup（`setupStatus.isSetup = true`），**不可变更数据库配置**。如需变更，需手动清空数据库或重建容器。

---

## 四、流程与业务规则约束

### 4.1 Setup 向导（初始化）
- 新部署的站点**首次访问时必须进入 Setup 向导页面**，不能显示主界面导航栏和登录注册入口。
- 路由守卫 `router/index.ts` 通过调用 `GET /api/setup/status` 判断 `isSetup`；如果未设置则强制重定向到 `/setup`。
- 为避免 Setup 页面反复闪烁，守卫在 `sessionStorage` 中缓存 `setup-checked` 结果。
- Setup 成功后会自动创建管理员账号并颁发 `accessToken`/`refreshToken`，用户直接登录。
- **重复 Setup 禁止**：如果数据库中已存在 `setupStatus` 记录，再次 `POST /api/setup` 必须返回 `409 Conflict`，message 为“站点已完成初始化，无法重复设置”。

### 4.2 用户角色
- 三种固定角色：`player`（玩家）、`staff`（工作人员）、`admin`（管理员）。
- `staff` 与 `admin` 可处理议题审批；仅 `admin` 可管理服务器和标签。
- 角色字段为枚举值，不可自由扩展，如需新增角色必须先改 Prisma schema 并执行 migration。

### 4.3 议题（Ticket）规则
- 议题的 `type` 必须为以下四类之一：`bug_report`、`permission_request`、`suggestion`、`report`。
- 议题创建后，`author`（作者）可修改 `status`；`staff`/`admin` 可修改 `priority`、`assignee` 以及 `status`。
- `permission_request` 类型议题需要关联 `permissionRequest` 数据，否则审批接口会拒绝。
- 状态变更为 `resolved`/`closed`/`rejected` 时，系统应自动填充 `closedAt`；但 Prisma 中该字段由业务代码写入，不是 `@updatedAt` 的自动行为。

### 4.4 文件上传
- 附件上传使用 Multer 写入 `backend/uploads/` 目录。
- `uploads/` 已加入 `.gitignore`，部署时该目录为持久化卷（Docker Volume 或宿主机目录）。
- 生产环境部署时，应使用对象存储（S3/MinIO）替代本地磁盘存储，目前为预留扩展。

---

## 五、测试与代码质量约束

### 5.1 强制测试覆盖
- **任何新增 API 接口必须编写对应的自动化测试**。现有后端测试包括：
  - `auth.test.ts` — 注册、登录、Token 刷新
  - `tickets.test.ts` — 议题创建与更新
  - `comments.test.ts` — 评论增删改查
  - `labels.test.ts` — 标签 CRUD
  - `permissions.test.ts` — 权限申请审批、角色控制
  - `mc.test.ts` — 服务端插件 API 鉴权
  - `setup.test.ts` — Setup 状态查询、成功初始化、无效载荷、重复守卫
- 测试运行命令：`cd backend && npx vitest run`。
- 所有测试执行前会自动清理数据库（`prisma.ticket.deleteMany`、`prisma.user.deleteMany` 等 + `prisma.setupStatus.deleteMany`），保证测试互不污染。

### 5.2 错误处理规范
- 路由层**不允许**使用裸 `throw new Error('...')`，必须通过 `next(error)` 或 `asyncWrap` 交给全局错误中间件。
- Service 层必须只抛出定义在 `utils/errors.ts` 中的异常子类：
  - `ValidationError(400)` — 参数校验失败
  - `UnauthorizedError(401)` — 未登录或令牌无效
  - `ForbiddenError(403)` — 角色/权限不足
  - `NotFoundError(404)` — 资源不存在
  - `AppError(statusCode)` — 其他业务异常（如 409 冲突）
- 全局错误处理中间件应将异常映射为 `{ success: false, statusCode, message }` JSON 返回。

---

## 六、Socket.io 与实时通信约束

### 6.1 实时更新策略
- MC 插件通过 WebSocket 订阅议题实时通知。
- 目前 Web 端仍采用**智能轮询**策略（详情页 5-10s，列表页 20-30s）。
- Socket.io 的 ticket 更新事件需在 Service 层状态变更后显式调用 `emitTicketUpdate()` 触发，不能遗漏。

---

## 七、开发环境常见陷阱

| 现象 | 可能原因 | 恢复步骤 |
|---|---|---|
| 前端白屏 / 无法加载 | `apiFetch`（或 `apiClient`）未从 `client.ts` 正确导出 | 检查 `client.ts` 的导出命名，统一使用 `apiFetch` |
| POST `/api/setup` 返回 404 | 旧 Express 进程仍在跑，没加载新路由文件 | `kill -9` 旧进程 + `npm run dev` |
| POST `/api/setup` 返回 409 | 数据库已有 `setupStatus` 记录，这是预期行为 | 清空数据库或重置测试环境 |
| 深色模式按钮不可见 | 按钮未设置 dark: 变体 | 使用 BaseButton 组件，primary variant 已内置 dark 模式样式 |
| 后端响应英文错误 | `errors.ts` 或 Service 层变更了 message，但其他文件仍用硬编码英文 | 统一替换为中文，并更新 `zh-CN.ts` |

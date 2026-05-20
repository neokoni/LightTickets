# LightTicket 设计文档

## 概述

LightTicket 是一个与 Minecraft 服务器深度集成的工单管理平台，采用前后端分离架构。玩家可在游戏内或 Web 端提交 Bug 报告、权限申请、建议反馈和举报，管理员通过 Web 端或游戏内处理工单。前端体验对标 GitHub Issues 的标签与筛选能力。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3.5 + Vite + Pinia + TailwindCSS 4 |
| 后端 | Node.js + Express + Socket.io + Prisma ORM |
| 数据库 | MySQL 8.0+（生产）/ SQLite（开发/小规模） |
| MC 插件 | Java 17+, Paper API, Folia 兼容 |
| 文件存储 | 本地磁盘（可扩展至 S3 兼容存储） |

## 系统架构

```
┌─────────────┐         ┌──────────────────────────────────┐         ┌─────────────────┐
│  Vue 3 SPA  │──REST──▶│  Express API + Socket.io Server  │◀──WS───│  MC Plugin      │
│  (CDN 部署) │◀─REST───│  Prisma ORM                      │──REST──▶│  (Paper/Purpur) │
└─────────────┘         └──────────────────────────────────┘         └─────────────────┘
   轮询获取更新              │                                          实时 WebSocket
                            ▼
                   ┌──────────────┐    ┌──────────┐
                   │ MySQL/SQLite │    │ 文件存储  │
                   └──────────────┘    └──────────┘
```

通信方式：
- Web 前端 ↔ 后端：REST API + 智能轮询（详情页 5-10s，列表页 30s，后台暂停）
- MC 插件 ↔ 后端：REST API（主动请求）+ WebSocket（接收实时通知）

部署：云服务器部署后端 + 数据库，MC 服务器独立部署插件。

## 数据模型

### User（用户）
- id, email, password_hash, username
- minecraft_uuid, minecraft_name（绑定后填充）
- role: player | staff | admin
- created_at, updated_at

### Server（子服务器）
- id, name, api_key
- address, description
- created_at

### Ticket（工单）
- id, title, body（Markdown）
- type: bug_report | permission_request | suggestion | report
- status: open | in_progress | resolved | closed | rejected
- priority: low | medium | high | critical
- author_id → User
- server_id → Server
- assignee_id → User（可选）
- created_at, updated_at, closed_at

### TicketLabel（工单-标签关联）
- ticket_id → Ticket
- label_id → Label

### Label（标签）
- id, name, color, description

### Comment（评论）
- id, ticket_id → Ticket
- author_id → User
- body（Markdown）
- source: web | minecraft
- created_at

### Attachment（附件）
- id, ticket_id → Ticket（可选）
- comment_id → Comment（可选）
- filename, path, mime_type, size
- uploaded_by → User
- created_at

### PermissionRequest（权限申请扩展）
- id, ticket_id → Ticket
- permission_node 或 group_name
- execution_status: pending | executed | failed
- executed_at, error_message

### LinkCode（绑定验证码）
- id, code（6位）
- minecraft_uuid, minecraft_name
- server_id → Server
- expires_at
- used: boolean

### AuditLog（操作日志）
- id, ticket_id → Ticket
- actor_id → User
- action: status_change | label_add | label_remove | assign | permission_execute ...
- old_value, new_value
- created_at

## 账号系统

### 注册/登录
- 邮箱 + 密码注册（bcrypt 加密）
- JWT 认证：access token 2h + refresh token 7d
- 未绑定 MC 账号时功能受限（只能浏览）

### Minecraft 绑定流程
1. 玩家游戏内执行 `/lt link`
2. 插件生成 6 位验证码，调用 API 存入 LinkCode 表（有效期 5 分钟）
3. 玩家在 Web 端「账号设置 → 绑定 MC」输入验证码
4. 后端校验 → 将 UUID + 玩家名绑定到 Web 账号
5. 绑定成功，游戏内操作自动关联此账号

### MC 插件认证
- 每个子服务器注册时分配 API Key
- 插件请求携带 `X-Server-Key` header
- 玩家操作通过 UUID 关联 Web 账号

### 权限角色
| 角色 | 权限 |
|------|------|
| player | 创建工单、评论自己的工单、查看公开工单 |
| staff | 处理工单、分配标签、审批权限申请 |
| admin | 全部权限 + 管理用户/服务器/系统设置 |

## MC 插件设计

### 命令（使用 Brigadier API）

```
/lt create <类型> <标题>        创建工单（后续聊天输入描述）
/lt list [mine|all]            查看工单列表
/lt view <ID>                  查看工单详情
/lt comment <ID> <内容>        添加评论
/lt close <ID>                 关闭自己的工单
/lt link                       生成绑定验证码

# Staff 命令
/lt assign <ID> <玩家>         分配工单
/lt label <ID> <标签>          添加标签
/lt approve <ID>               审批权限申请
/lt reject <ID> [原因]         拒绝权限申请
```

### 技术约束
- 使用 Paper 新接口：Brigadier command API、Adventure 文本组件、Paper 事件系统
- Folia 兼容：所有调度使用 RegionScheduler / GlobalRegionScheduler / EntityScheduler，不使用 BukkitScheduler
- 异步 HTTP 请求不阻塞游戏线程

### 自动采集上下文（Bug 工单）
- 玩家坐标（世界名 + XYZ）
- 服务器版本、子服务器名称
- 玩家当前游戏模式
- 可配置是否采集最近聊天记录

### 实时通知（WebSocket 接收）
- 工单被回复 → 聊天消息提醒（Adventure Component）
- 权限审批通过 → 通知 + 自动执行 LuckPerms API
- 权限被拒绝 → 通知 + 原因

### LuckPerms 集成
审批通过后：
- 通过 LuckPerms API 添加权限节点或用户组
- 执行结果回报后端，更新 PermissionRequest 状态
- 失败时记录错误信息，工单标记为 failed

## 前端设计

### UI 风格
- 参考 craft233.top 的设计语言：毛玻璃效果、Inter 字体、圆角、slate 灰色层次、dark mode
- 强调色可配置（管理后台设置），默认使用中性色调（slate/blue），不默认绿色
- TailwindCSS 4（CSS-first 配置，CSS 变量驱动主题色）
- 响应式设计，支持移动端
- @iconify/vue 图标库

### 核心页面
- **工单列表页**: 状态/类型/标签/服务器筛选，搜索，排序，标签彩色展示
- **工单详情页**: Markdown 渲染，评论时间线，状态变更记录，附件预览
- **创建工单页**: 类型选择 → 动态表单（Bug 有截图上传，权限申请有权限选择器）
- **个人中心**: 我的工单、账号设置、MC 绑定管理
- **管理后台**: 用户管理、服务器管理、标签管理、系统设置

### 交互特点
- 标签系统：自定义颜色 + 名称，多标签筛选
- Markdown 编辑器：支持图片粘贴上传
- 智能轮询：根据页面活跃度调整频率

## API 设计（主要端点）

```
# 认证
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/link-minecraft    (验证码绑定)

# 工单
GET    /api/tickets                 (列表，支持筛选/分页)
POST   /api/tickets                 (创建)
GET    /api/tickets/:id             (详情)
PATCH  /api/tickets/:id             (更新状态/分配)
DELETE /api/tickets/:id             (删除，仅 admin)

# 评论
GET    /api/tickets/:id/comments
POST   /api/tickets/:id/comments

# 标签
GET    /api/labels
POST   /api/labels                  (admin)
PATCH  /api/labels/:id              (admin)
DELETE /api/labels/:id              (admin)

# 附件
POST   /api/attachments/upload
GET    /api/attachments/:id

# 权限申请
POST   /api/tickets/:id/approve     (staff+)
POST   /api/tickets/:id/reject      (staff+)

# 服务器管理
GET    /api/servers                  (admin)
POST   /api/servers                  (admin)

# MC 插件专用（X-Server-Key 认证）
POST   /api/mc/link-code            (生成验证码)
POST   /api/mc/tickets              (游戏内创建工单)
GET    /api/mc/tickets/:uuid        (查询玩家工单)
POST   /api/mc/comments             (游戏内评论)
```

## 项目结构

```
LightTickets/
├── frontend/                  Vue 3 前端
│   ├── src/
│   │   ├── views/            页面组件
│   │   ├── components/       通用组件
│   │   ├── stores/           Pinia 状态管理
│   │   ├── api/              API 请求封装
│   │   └── router/           路由配置
│   └── ...
├── backend/                   Express 后端
│   ├── src/
│   │   ├── routes/           路由定义
│   │   ├── controllers/      控制器
│   │   ├── services/         业务逻辑
│   │   ├── middleware/       中间件（认证、权限）
│   │   ├── socket/           Socket.io 事件处理
│   │   └── prisma/           Prisma schema + migrations
│   └── ...
├── plugin/                    Minecraft 插件（Gradle 项目）
│   ├── src/main/java/
│   │   └── top/craft233/lightticket/
│   │       ├── commands/     Brigadier 命令
│   │       ├── listeners/    事件监听
│   │       ├── api/          HTTP + WebSocket 客户端
│   │       ├── luckperms/    LuckPerms 集成
│   │       └── scheduler/    Folia 兼容调度器
│   └── build.gradle.kts
└── docs/
```

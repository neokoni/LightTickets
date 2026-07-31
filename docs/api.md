# LightTickets API 文档

## 基础约定

- 基础路径：`/api`
- 内容类型：`application/json`
- Web 端认证：`Authorization: Bearer <accessToken>`
- Refresh Token：由后端通过 `HttpOnly` Cookie `lt_refresh_token` 下发；响应体中的 `refreshToken` 仅为灰度兼容字段，前端不得存入 `localStorage`。
- MC 插件服务器认证：`X-Server-Key: <server.apiKey>`，仅用于 `/api/mc/*`。
- MC 玩家接口还必须携带 `X-Player-Session`。插件使用绑定时签发的
  `playerCredential` 调用 `POST /api/mc/session` 换取 5 分钟 session；后端从绑定的 API
  账户读取实时角色与权限，不信任请求中的 UUID 或插件本地角色。

成功响应统一为：

```json
{
  "success": true,
  "data": {}
}
```

错误响应统一为：

```json
{
  "success": false,
  "statusCode": 400,
  "message": "参数校验失败"
}
```

`204 No Content` 无响应体。`GET /api/health` 和 `GET /api/docs/openapi.json` 不包 envelope。

## 公开接口

### 健康检查

`GET /api/health`

响应：

```json
{ "status": "ok" }
```

### 站点配置

`GET /api/setup/site-config`

返回 setup 状态、站点名、注册策略、页脚等公开配置。`registrationEmailVerificationEnabled`
表示当前 SMTP 是否可用于网页注册邮箱验证。
`federatedAuthProviders` 仅包含已启用 Provider 的公开名称、图标、slug 与注册开关，不包含端点、Client ID 或密钥。

### 外部登录

`POST /api/auth/federatedauth/:slug/start` 创建一次性登录流程并返回授权地址；回调地址为
`GET /api/auth/federatedauth/:slug/callback`。流程使用 HttpOnly 浏览器绑定 Cookie、state，默认使用
PKCE；OIDC 额外校验 nonce 和 ID Token。

未绑定身份不会按 Provider 邮箱匹配账户。允许注册时，回调进入账户创建流程，用户必须
自行填写邮箱、用户名和至少 8 位的本地密码；本地邮箱验证码策略与普通网页注册一致。账户和身份绑定
在同一数据库事务中创建。

已登录用户可通过 `/api/users/me/federatedauth/*` 主动绑定或解绑身份。管理员通过
`/api/admin/federatedauth/providers/*` 管理 Provider。高级 OAuth 选项包括关闭 PKCE、选择
`client_secret_basic`/`client_secret_post`/bcrypt `$2y$` Secret 方式，以及自定义 Access Token 和
用户信息 JSON Path。所有非标准行为默认关闭，不根据域名自动启用或回退。

管理员可调用 `DELETE /api/admin/federatedauth/providers/:id/identities` 一次解除该 Provider 的全部
身份绑定。该操作只删除外部身份关系，账户及其密码、议题等数据均保留；Provider 仍需另行删除。

外部登录数据库变更均为新增表，`security.externalEncryptionKey` 也是向后兼容的新增配置项；回滚到
不含此功能的版本时旧程序会忽略这些内容。升级前仍应备份数据库和 `config.yml`，回滚不得删除绑定表或
更换加密密钥，以便恢复新版本后继续读取既有 Provider 密钥。

### 语言列表

`GET /api/i18n/languages`

公开接口。返回内置语言（当前包含 `zh-CN`、`en-US`）和 `data/locales/*.json` 自定义语言的清单。

### 语言资源

`GET /api/i18n/languages/:id`

公开接口。返回合并后的语言资源；自定义语言缺失的 key 回退到内置 `zh-CN`。

### 模板列表

`GET /api/templates`

返回启用模板列表。模板由数据库维护，YAML 文件用于初始化和同步。

### 模板详情

`GET /api/templates/:name`

返回单个模板定义。

模板包含 `hidden` 创建策略：`true` 表示始终隐藏，`false` 表示始终公开，`optional`
表示创建者必须选择。读取模板 YAML 时兼容历史误拼 `optinal`，API 统一返回 `optional`。

## 初始化与认证

### 初始化站点

`POST /api/setup`

请求体：

```json
{
  "db": {
    "provider": "sqlite"
  },
  "admin": {
    "email": "admin@example.com",
    "password": "Password123!",
    "username": "admin"
  },
  "site": {
    "siteName": "LightTickets",
    "siteUrl": "https://tickets.example.com",
    "defaultLanguage": "zh-CN"
  },
  "mc": {
    "defaultServerName": "主服务器"
  },
  "storage": {
    "driver": "local"
  }
}
```

`site.siteUrl` 必须是仅包含 origin 的 HTTP(S) URL，不得包含用户名、密码、路径、查询参数或
fragment；保存时会规范化为 origin。密码重置只在该地址使用 HTTPS 时启用。

MySQL 可使用字段模式：

```json
{
  "db": {
    "provider": "mysql",
    "host": "localhost",
    "port": 3306,
    "username": "root",
    "password": "secret",
    "database": "lighttickets"
  }
}
```

文件存储可在初始化阶段选择本地或 S3 兼容存储。S3 示例：

```json
{
  "storage": {
    "driver": "s3",
    "s3": {
      "endpoint": "http://localhost:9000",
      "bucket": "lighttickets",
      "accessKeyId": "minioadmin",
      "secretAccessKey": "minioadmin",
      "forcePathStyle": true,
      "presignExpiry": 300
    }
  }
}
```

成功后创建管理员、初始化模板和 AppConfig，并返回 `accessToken`；同时设置 refresh cookie。
Turnstile 默认关闭，初始化接口不接受 Turnstile 配置；如需启用，只能在管理后台的 Turnstile 设置中配置 Site Key 和 Secret Key。

### 注册

`POST /api/auth/register/verification-code`

SMTP 启用且配置完整时，网页注册需要先请求邮箱验证码。该公开接口挂认证限流；启用
Turnstile 时同样必须传 `turnstileToken`。

```json
{
  "email": "user@example.com",
  "turnstileToken": "optional-token"
}
```

成功响应：

```json
{
  "accepted": true,
  "retryAfterSeconds": 60
}
```

验证码为 6 位数字，10 分钟内有效、最多允许 5 次错误尝试。同一邮箱默认每 60 秒只能发送一次，管理员可在限流策略中调整；`retryAfterSeconds` 返回当前生效的冷却秒数。
请求验证码使用的 Turnstile token 已被消费，最终注册前需要由组件刷新取得新 token。

`POST /api/auth/register`

请求体：

```json
{
  "email": "user@example.com",
  "password": "Password123!",
  "username": "player",
  "emailVerificationCode": "123456",
  "turnstileToken": "optional-token"
}
```

受 `allowWebRegister` 控制。成功后返回用户和 token，并设置 refresh cookie。
启用 Turnstile 后必须传 `turnstileToken`；未启用时可省略。
SMTP 可用时必须传 `emailVerificationCode`，验证成功后验证码在创建用户的同一事务中一次性消费；
SMTP 未启用或配置不完整时该字段可省略，并保持原有注册流程。

> **WIP 注意**：启用 SMTP 后，网页注册会立即要求携带邮箱验证码。
> 回滚旧版本时新增验证表可安全保留；旧程序不会读取该表。

### 登录

`POST /api/auth/login`

请求体：

```json
{
  "emailOrUsername": "user@example.com",
  "password": "Password123!",
  "turnstileToken": "optional-token"
}
```

启用 Turnstile 后必须传 `turnstileToken`；未启用时可省略。

### 请求密码重置邮件

`POST /api/auth/password-reset/request`

公开接口，挂认证限流。SMTP 需先在管理后台邮件配置中手动启用，且管理员必须配置规范化的
HTTPS `siteUrl`；重置链接永远不会从请求的 `Origin`、`Referer`、`Host` 或
`Forwarded`/`X-Forwarded-*` 头推导。配置缺失或不安全时返回 400，且不创建 token、不发送邮件。
同一账号默认每 60 秒最多发送一封密码重置邮件，管理员可在限流策略中调整。

请求体：

```json
{
  "emailOrUsername": "user@example.com",
  "turnstileToken": "optional-token"
}
```

`emailOrUsername` 与登录接口一致，可传邮箱或用户名。若邮件服务可用，无论账号是否存在都返回通用响应：
启用 Turnstile 后必须传 `turnstileToken`；未启用时可省略。

```json
{
  "accepted": true
}
```

### 确认密码重置

`POST /api/auth/password-reset/confirm`

请求体：

```json
{
  "token": "reset-token",
  "password": "NewPassword123!"
}
```

成功后重置密码，并使该用户未使用的重置 token 失效。

### 刷新 Access Token

`POST /api/auth/refresh`

浏览器客户端不需要请求体，后端读取 `lt_refresh_token` cookie。灰度兼容期内也接受：

```json
{
  "refreshToken": "..."
}
```

### 登出

`POST /api/auth/logout`

需要 Bearer Token。清除 refresh cookie，返回 `204`。

### 绑定 / 解绑 Minecraft

- `POST /api/auth/link-minecraft`，请求体 `{ "code": "123456" }`
- `DELETE /api/auth/link-minecraft`

## 议题

状态值：

- `open`：开放
- `in_progress`：处理中
- `closed`：已关闭
- `invalid`：无效

### 创建议题

`POST /api/tickets`

需要认证。

请求体：

```json
{
  "title": "议题标题",
  "template": "bug_report",
  "formData": {
    "description": "问题描述",
    "reproduce": "复现步骤"
  },
  "attachmentIds": ["attachment-id"],
  "hidden": true
}
```

字段：

- `title`：1-200 字符
- `template`：模板名
- `formData`：严格按所选模板声明的字段提交；未知字段、缺失必填字段、非法选项和超长值会被拒绝
- `serverId`：可选，但只有 `staff` / `admin` 可以通过 Web API 指定；普通用户提交该字段返回 `403`，
  Minecraft API 则只能使用当前已认证 API Key 对应的服务器
- `attachmentIds`：可选，预上传附件 UUID 列表；只能认领当前用户所有、仍为 `pending` 且未过期的附件，创建成功后原子关联到该议题
- `hidden`：仅当模板策略为 `optional` 时必填；其他策略由后端强制决定

### 议题列表

`GET /api/tickets`

可选认证。查询参数：

- `page` / `pageSize`
- `statuses`：逗号分隔或多值，如 `open,in_progress`
- `type`：模板名
- `authorId`
- `authorName`
- `serverId`
- `serverName`：精确匹配 Minecraft 服务器名称
- `hasServer`：`true` / `false`
- `labelId`
- `search`

未登录用户只能看到公开议题；普通用户还能看到自己创建的隐藏议题；`staff` / `admin`
可看到全部议题。

### 议题详情

`GET /api/tickets/:id`

可选认证。

隐藏议题对无权用户返回 `404`。同一规则适用于评论、审计日志和附件读取，避免通过关联资源绕过。
当访问者为 `staff` / `admin` 时，详情还会包含 `completionHooks`，用于显示模板在本次状态
变更时生成的执行选项及其 `pending` / `completed` 状态（`cancelled` 仅保留为历史兼容值）。普通用户和未登录用户
仅会收到已完成且 `visibility` 为 `public` 的结果卡片；`staff` 结果和所有待决策字段不会公开。
已完成结果包含 `completedAt` 决策完成时间和 `completedBy` 操作人。

### 更新议题状态 / 负责人

`PATCH /api/tickets/:id`

请求体：

```json
{
  "status": "in_progress",
  "assigneeId": 2,
  "hidden": false
}
```

作者可在规则内开关自己的议题；`staff` / `admin` 可处理任意状态和负责人。
只有 `staff` / `admin` 可更改 `hidden`，更改会写入议题审计日志。
状态迁移采用旧状态条件更新；并发请求未取得迁移权时返回 `409`，且不会重复创建审计或执行 Hook。
若目标状态包含 Minecraft console command Hook，则必须由 `staff` / `admin` 操作，普通作者返回 `403`。

### 更新正文

`PATCH /api/tickets/:id/body`

请求体：

```json
{ "body": "新的正文" }
```

### 更新标题

`PATCH /api/tickets/:id/title`

请求体：

```json
{ "title": "新标题" }
```

### 关闭 / 重新打开

- `POST /api/tickets/:id/close`
- `POST /api/tickets/:id/reopen`

同一议题只会在第一次匹配到决策配置时创建一组执行选项。重新打开、再次关闭或切换状态不会
取消、重建或重新执行决策；待决策记录会保持可提交，已完成记录会继续保留。

### 提交完成执行选项

`POST /api/tickets/:id/completion-hooks/:hookId/complete`

需要 `staff` 权限。请求体中的文本值用于 `input` / `textarea` / `dropdown`，字符串数组用于
`checkboxes`：

```json
{
  "values": {
    "rewards": ["金币", "物品"],
    "note": "已发放"
  }
}
```

后端按模板快照校验必填项和预设选项，原子地将状态标记为 `completed` 并记录操作人，然后按
配置顺序下发多个动作。已完成的记录再次提交返回 `409`，不会重复下发动作。

Minecraft Hook 与状态变更在同一数据库事务中写入 outbox。每次投递及其中的 `hookId` 均保持
稳定；在线插件执行后发送 ACK，后端会在重连和定时任务中重投未确认项。插件在本地数据库持久
记录已执行的 `hookId`，因此重投不会重复执行 console command。缺少 `deliveryId`、非法 `hookId`
或旧版仅含 `commands` 的消息会被插件拒绝。

该 outbox 表为 additive migration。部署时应先应用数据库迁移，再同时升级后端和插件；应用层回滚时
保留该表和未确认记录。不得回滚到随机 Hook ID、无 ACK 或无持久去重的旧执行路径。

首次状态变化生成至少一个执行选项时，审计日志会追加一次“等待执行决策”；每次提交成功后再以
实际操作人为 actor 追加“完成了决策”。

### 指派人

`PUT /api/tickets/:id/assignees`

需要 `staff` 权限。

请求体：

```json
{ "assigneeIds": [2, 3] }
```

### 标签关联

- `POST /api/tickets/:id/labels`，需要 `staff`，请求体 `{ "labelId": "..." }`
- `DELETE /api/tickets/:id/labels/:labelId`，需要 `staff`

### 议题附件列表

`GET /api/tickets/:id/attachments`

需要认证。

## 评论

挂载路径：`/api/tickets/:id/comments`

- `GET /`：评论列表，可选认证
- `POST /`：创建评论，需要认证，请求体 `{ "body": "评论内容" }`
- `PATCH /:commentId/body`：编辑评论，需要认证
- `DELETE /:commentId`：删除评论，作者或 `staff` / `admin` 可操作；删除前清理评论附件物理文件

## 附件

### 上传附件

`POST /api/attachments/upload`

需要认证，`multipart/form-data`：

- `file`：文件
- `ticketId`：可选，只接受正整数
- `commentId`：可选，只接受 UUID

`ticketId` 和 `commentId` 不能同时提供。向已有对象上传时，仅对象作者或 `staff` / `admin`
可以操作；不提供对象 ID 时创建一条归当前用户所有的预上传记录。未关联附件不限制文件数量，
只计算当前用户所有仍有效 pending 文件的合计容量。默认额度为 50 MiB；过期开关默认开启，
有效期为 7 天，管理员可以修改。关闭开关后，新上传的未关联附件不会自动过期；到期文件立即
停止占用额度，并由定时任务删除数据库记录和物理对象。

文件会先校验 mimetype 白名单，再做 magic bytes 二次校验。上传先创建 `pending` 数据库记录，
再写入本地存储或 S3/MinIO；任一步失败时执行补偿清理。

### 获取附件

`GET /api/attachments/:id`

本地存储直接返回文件；S3 存储返回 `302` 预签名 URL。

### 删除附件

`DELETE /api/attachments/:id`

上传者或 `admin` 可删除，删除数据库记录前会删除物理文件。

## 标签

- `GET /api/labels`
- `POST /api/labels`，需要 `admin`，请求体包含必填的唯一标识符 `id`（如 `bug`）、`name` 和 `color`
- `PATCH /api/labels/:id`，需要 `admin`
- `DELETE /api/labels/:id`，需要 `admin`

标签标识符只能包含字母、数字、下划线和短横线，创建后不可修改；标签颜色格式为 hex，如 `#22c55e`。

## 服务器管理

挂载路径：`/api/servers`，全部需要 `admin`。

- `GET /`
- `POST /`
- `POST /:id/regenerate-key`
- `PATCH /:id`
- `DELETE /:id`

服务器 `apiKey` 用于 MC 插件访问 `/api/mc/*`。

## 用户

- `GET /api/users`：管理员用户分页列表
- `GET /api/users/assignable`：可指派用户列表
- `PATCH /api/users/me/avatar`
- `PATCH /api/users/me/username`
- `PATCH /api/users/me/password`
- `PATCH /api/users/me/email`
- `PATCH /api/users/me/notifications`：登录用户更新个人邮件通知偏好，请求体为
  `{ "receiveEmailNotifications": boolean }`，新用户默认 `true`
- `POST /api/users/email-notifications/unsubscribe`：公开接口，请求体为邮件中的签名
  `{ "token": string }`；成功后关闭对应用户的个人邮件通知。访问邮件链接本身不会直接退订，需在网页确认
- `PATCH /api/users/:id/role`：管理员修改角色
- `DELETE /api/users/:id`：管理员删除用户，不能删除自己

角色：

- `player`
- `staff`
- `admin`

## 管理后台

### 站点设置

`GET /api/setup/settings`

需要 `admin`。返回站点设置、邮件设置、Turnstile 设置、限流策略和附件策略；邮件密码和 Turnstile Secret Key 只返回是否已设置，不返回明文。
`sendEmailNotifications` 表示是否发送议题回复和状态变更邮件，默认 `false`。
`passwordResetEnabled` 仅在 SMTP 可用且 `siteUrl` 为 HTTPS origin 时为 `true`；
`registrationEmailVerificationEnabled` 只取决于 SMTP 是否可用。
`rateLimit` 是当前生效值，`rateLimitDefaults` 是内置默认值，管理页输入框的 placeholder 直接使用后者。
`attachment` 是当前附件策略，`attachmentDefaults` 是内置默认值。

`PATCH /api/setup/settings`

需要 `admin`。

请求体字段均可选：

```json
{
  "requireLogin": true,
  "allowWebRegister": true,
  "allowMcRegister": true,
  "siteName": "LightTickets",
  "siteUrl": "https://tickets.example.com",
  "footerContent": "页脚内容",
  "defaultLanguage": "zh-CN",
  "mail": {
    "enabled": true,
    "host": "smtp.example.com",
    "port": 587,
    "secure": false,
    "username": "mailer",
    "password": "secret",
    "fromName": "Tickets",
    "fromAddress": "noreply@example.com"
  },
  "turnstile": {
    "enabled": true,
    "siteKey": "0x4AAAA...",
    "secretKey": "secret"
  },
  "rateLimit": {
    "global": {
      "windowSeconds": 60,
      "maxRequests": 100
    },
    "auth": {
      "windowSeconds": 60,
      "maxRequests": 10
    },
    "email": {
      "cooldownSeconds": 60
    }
  },
  "attachment": {
    "pendingQuotaMiB": 50,
    "pendingExpirationEnabled": true,
    "pendingTtlDays": 7
  }
}
```

`mail.password` 不传或传空时保留原密码；关闭邮件只需设置 `mail.enabled=false`。SMTP 配置为可选配置，只通过管理后台维护，不属于初始化步骤。
`siteUrl` 接受 HTTP(S) origin 并规范化存储，但 HTTP 地址不会启用密码重置；设置为 `null`
或空字符串会立即关闭密码重置，不影响注册邮箱验证码。
议题邮件通知仅在 SMTP 配置可用、平台 `sendEmailNotifications=true`、议题创建者个人
`receiveEmailNotifications=true` 且操作者不是创建者本人时发送。发送失败不会影响回复或状态变更操作。
`turnstile.secretKey` 不传或传空时保留原 Secret Key；关闭 Turnstile 只需设置 `turnstile.enabled=false`。Turnstile 配置为可选配置，只通过管理后台维护，不属于初始化步骤。

限流策略保存在数据库 `AppConfig` 中，修改后立即应用。全局限流按 IP 统计所有 API 请求；认证限流按 IP 统计所有挂载认证限流器的接口并共享额度。请求窗口内前 `maxRequests` 次放行，之后返回 429，到窗口结束后重新计数。注册验证码和密码重置邮件统一读取 `email.cooldownSeconds`；前者按规范化邮箱统计，后者按用户账号统计。所有秒数和请求额度必须为正整数；秒数最大 86400，请求额度最大 100000。

内置默认策略为：全局每 60 秒 100 次、认证接口每 60 秒 10 次、邮件发送冷却 60 秒。默认值只在后端 `constants/rate-limit.ts` 定义，API、业务逻辑和管理页共同读取该定义。读取已保存的旧版分项邮件配置时会取两项冷却时间中的较大值作为统一配置。

附件策略保存在数据库 `AppConfig` 中，只限制每个用户仍有效 pending 附件的合计容量，不限制
文件数量。`pendingQuotaMiB` 范围为 1-102400 MiB，默认 50 MiB；
`pendingExpirationEnabled` 控制新上传的 pending 附件是否自动过期，默认开启；
`pendingTtlDays` 范围为 1-365 天，默认 7 天。配置变更不追溯修改已有附件的 `expiresAt`。
未启用过期的附件仍参与配额聚合；过期记录不参与配额聚合，并由后台清理任务删除，删除失败时
保留 `deleting` 状态供下轮重试。上述策略在管理员后台的“存储设置”页面维护。

`POST /api/setup/settings/mail/test`

需要 `admin`。请求体可通过 `mail` 传入当前页面的 SMTP 配置；传入字段优先，未传字段从数据库
中的已保存配置补齐（空密码会保留已保存密码）。测试不要求邮件服务已经启用，也不会保存传入
配置。随后执行 Nodemailer 连接验证并返回标准成功 envelope：

```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "SMTP 连接成功"
  }
}
```

配置不完整时返回 `400`，连接验证失败时返回 `502`；两者都使用标准错误 envelope，不会以
HTTP 200 返回业务级 `success: false`。

### 模板管理

挂载路径：`/api/admin/templates`，需要 `admin`。

- `GET /`
- `GET /:name`
- `POST /`
- `PATCH /:name`
- `DELETE /:name`

`GET /:name` 返回 `source` 字段，其中包含模板文件的完整 YAML 原文。`PATCH /:name`
可单独提交 `{ "source": "..." }` 直接更新原文；后端会在写入前解析并校验模板结构。

### 存储配置

挂载路径：`/api/admin/storage`，需要 `admin`。

- `GET /`
- `PUT /`
- `POST /test`

本地存储配置：

```json
{
  "driver": "local",
  "uploadDir": "data/uploads"
}
```

S3 配置：

```json
{
  "driver": "s3",
  "s3": {
    "endpoint": "http://localhost:9000",
    "region": "us-east-1",
    "bucket": "lighttickets",
    "accessKeyId": "minio",
    "secretAccessKey": "secret",
    "forcePathStyle": true,
    "presignExpiry": 300
  }
}
```

`secretAccessKey` 查询时会被掩码；更新时不传则保留原值。
`POST /test` 成功时在标准成功 envelope 的 `data` 中返回
`{ "success": true, "message": "连接成功" }`。尚未配置 S3 时返回 `400`，连接失败时返回
`502`，并统一使用标准错误 envelope。

## 审计日志

`GET /api/tickets/:ticketId/audit`

可选认证，返回议题审计日志列表。

## MC 插件接口

所有 `/api/mc/*` 接口必须带服务器凭据：

```http
X-Server-Key: <server.apiKey>
```

`register`、`link-code`、`session` 和 `unlink` 以外的玩家接口还必须带：

```http
X-Player-Session: <short-lived session token>
```

玩家 session 绑定 API 账号、Minecraft UUID 和签发它的服务器。后端按 API 账号当前的
`player` / `staff` / `admin` 角色执行权限检查，并将所有议题查询与操作限制在当前
`X-Server-Key` 对应的服务器。

### 插件注册账号

`POST /api/mc/register`

受 `allowMcRegister` 控制。成功响应只返回用户资料和 `playerCredential`，不向插件返回 Web
Access Token 或 Refresh Token。

### 生成绑定码

`POST /api/mc/link-code`

请求体：

```json
{
  "minecraftUuid": "uuid",
  "minecraftName": "Steve"
}
```

响应同时返回只展示一次的 `playerCredential`。插件必须安全保存该值，数据库只保存其 SHA-256
hash；旧版插件绑定没有此凭据，必须先在 Web 解绑后重新绑定。

### 签发玩家 session

`POST /api/mc/session`

```json
{
  "minecraftUuid": "uuid",
  "playerCredential": "credential returned during binding"
}
```

返回 5 分钟有效的 `sessionToken`。session 只能与签发时使用的同一 `X-Server-Key` 搭配使用。

### 从游戏内创建议题

`POST /api/mc/tickets`

请求体：

```json
{
  "minecraftUuid": "uuid",
  "title": "问题标题",
  "body": "正文",
  "template": "bug_report",
  "formData": {},
  "hidden": true,
  "context": {
    "world": "world",
    "x": 1,
    "y": 64,
    "z": 1,
    "gameMode": "survival"
  }
}
```

### MC 议题与评论

- `GET /api/mc/tickets?minecraftUuid=<uuid>`
- `GET /api/mc/tickets/:uuid`：上一版本兼容路径
- `GET /api/mc/tickets/:id/detail?minecraftUuid=<uuid>`
- `GET /api/mc/tickets/:id/comments?minecraftUuid=<uuid>`
- `GET /api/mc/user/:uuid`
- `POST /api/mc/comments`
- `POST /api/mc/tickets/:id/close`
- `POST /api/mc/tickets/:id/reopen`
- `POST /api/mc/tickets/:id/status`
- `POST /api/mc/unlink`：固定拒绝；解绑只能由已登录用户调用 Web 端
  `DELETE /api/auth/link-minecraft`

请求中的 `minecraftUuid` 必须与 `X-Player-Session` 绑定的 UUID 一致，否则返回 `403`。玩家可以读取
当前服务器内的公开议题和自己创建的隐藏议题；`staff` / `admin` 可按其 API 账号权限读取当前服务器内
的全部议题。只有 server key、没有玩家 session 时返回 `401`，不再回退为匿名公开读取。

升级时先应用 credential/session 新增表迁移，再同步更新后端与插件。旧插件和没有
`playerCredential` 的历史绑定会 fail-closed，用户需在 Web 解绑后重新绑定。数据库变更均为新增结构；
回滚应用版本时这些表可保留，但只能回滚到仍要求玩家 session 的 hardened 版本，禁止恢复仅凭 server
key 和自报 UUID 鉴权的旧实现。若必须回退数据库，从升级前备份恢复。

## OpenAPI

- `GET /api/docs/openapi.json`

返回构建生成的 OpenAPI JSON；如果尚未生成，返回 `404` 标准错误响应。
规范方言固定为 OpenAPI `3.0.3`；项目仍处于 WIP，`info.version` 保持初始版本 `1.0.0`。
生成过程会校验成功/错误 envelope，并对比 Express 实际路由与文档路由，存在遗漏或陈旧路由时失败。

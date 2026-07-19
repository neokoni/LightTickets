# LightTickets API 文档

## 基础约定

- 基础路径：`/api`
- 内容类型：`application/json`
- Web 端认证：`Authorization: Bearer <accessToken>`
- Refresh Token：由后端通过 `HttpOnly` Cookie `lt_refresh_token` 下发；响应体中的 `refreshToken` 仅为灰度兼容字段，前端不得存入 `localStorage`。
- MC 插件认证：`X-Server-Key: <server.apiKey>`，仅用于 `/api/mc/*`。

成功响应统一为：

```json
{
  "success": true,
  "data": {}
}
```

灰度兼容期内，对象响应会同时保留顶层字段，例如：

```json
{
  "success": true,
  "data": { "accessToken": "..." },
  "accessToken": "..."
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

验证码为 6 位数字，10 分钟内有效、最多允许 5 次错误尝试，同一邮箱每 60 秒只能发送一次。
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

公开接口，挂认证限流。SMTP 需先在管理后台邮件配置中手动启用；初始化流程不包含邮件配置。同一账号每分钟最多发送一封密码重置邮件。

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
  "serverId": "server-id",
  "attachmentIds": ["attachment-id"],
  "hidden": true
}
```

字段：

- `title`：1-200 字符
- `template`：模板名
- `formData`：字符串键值对象
- `serverId`：可选
- `attachmentIds`：可选，预上传附件 ID 列表；创建成功后关联到该议题
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
- `ticketId`：可选
- `commentId`：可选

文件会先校验 mimetype 白名单，再做 magic bytes 二次校验。支持本地存储和 S3/MinIO。

### 获取附件

`GET /api/attachments/:id`

本地存储直接返回文件；S3 存储返回 `302` 预签名 URL。

### 删除附件

`DELETE /api/attachments/:id`

上传者或 `admin` 可删除，删除数据库记录前会删除物理文件。

## 标签

- `GET /api/labels`
- `POST /api/labels`，需要 `admin`
- `PATCH /api/labels/:id`，需要 `admin`
- `DELETE /api/labels/:id`，需要 `admin`

标签颜色格式为 hex，如 `#22c55e`。

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

需要 `admin`。返回站点设置、邮件设置和 Turnstile 设置；邮件密码和 Turnstile Secret Key 只返回是否已设置，不返回明文。
`sendEmailNotifications` 表示是否发送议题回复和状态变更邮件，默认 `false`。

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
  }
}
```

`mail.password` 不传或传空时保留原密码；关闭邮件只需设置 `mail.enabled=false`。SMTP 配置为可选配置，只通过管理后台维护，不属于初始化步骤。
议题邮件通知仅在 SMTP 配置可用、平台 `sendEmailNotifications=true`、议题创建者个人
`receiveEmailNotifications=true` 且操作者不是创建者本人时发送。发送失败不会影响回复或状态变更操作。
`turnstile.secretKey` 不传或传空时保留原 Secret Key；关闭 Turnstile 只需设置 `turnstile.enabled=false`。Turnstile 配置为可选配置，只通过管理后台维护，不属于初始化步骤。

`POST /api/setup/settings/mail/test`

需要 `admin`。使用已保存的 SMTP 配置执行 Nodemailer 连接验证，返回：

```json
{
  "success": true,
  "message": "SMTP 连接成功"
}
```

### 模板管理

挂载路径：`/api/admin/templates`，需要 `admin`。

- `GET /`
- `GET /:name`
- `POST /`
- `PATCH /:name`
- `DELETE /:name`

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

## 审计日志

`GET /api/tickets/:ticketId/audit`

可选认证，返回议题审计日志列表。

## MC 插件接口

所有 `/api/mc/*` 接口必须带：

```http
X-Server-Key: <server.apiKey>
```

### 插件注册账号

`POST /api/mc/register`

受 `allowMcRegister` 控制。

### 生成绑定码

`POST /api/mc/link-code`

请求体：

```json
{
  "minecraftUuid": "uuid",
  "minecraftName": "Steve"
}
```

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

- `GET /api/mc/tickets?minecraftUuid=<uuid>`：`minecraftUuid` 可选；不提供时只返回公开议题
- `GET /api/mc/tickets/:uuid`：上一版本兼容路径
- `GET /api/mc/tickets/:id/detail?minecraftUuid=<uuid>`
- `GET /api/mc/tickets/:id/comments?minecraftUuid=<uuid>`
- `GET /api/mc/user/:uuid`
- `POST /api/mc/comments`
- `POST /api/mc/tickets/:id/close`
- `POST /api/mc/tickets/:id/reopen`
- `POST /api/mc/tickets/:id/status`
- `POST /api/mc/unlink`

MC 读取接口始终需要服务器 API Key，但玩家身份上下文 `minecraftUuid` 可选。提供已绑定 UUID 后，
玩家可以读取自己创建的隐藏议题，`staff` / `admin` 可以读取全部；未提供或未绑定时按公开访问处理。

## OpenAPI

- `GET /api/docs/openapi.json`

返回构建生成的 OpenAPI JSON；如果尚未生成，返回 `404` 标准错误响应。

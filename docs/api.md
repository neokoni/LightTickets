# LightTickets API 文档

## 基础信息

- 基础路径: `/api`
- 认证方式: Bearer Token (JWT)
- 内容类型: `application/json`

## 议题接口

**议题状态:**
- `open`: 开放
- `in_progress`: 处理中
- `closed`: 已关闭
- `invalid`: 无效

### 创建议题
> `POST /api/tickets`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "title": "议题标题",
  "template": "bug-report",
  "formData": {
    "description": "问题描述",
    "steps": "重现步骤"
  },
  "priority": "medium",
  "serverId": "server-id"
}
```

**字段要求:**
- `title`: 1-200个字符
- `template`: 模板名称
- `formData`: 键值对对象
- `priority`: 可选, `low` | `medium` | `high` | `critical`
- `serverId`: 可选, 服务器ID

**响应 (201):**
```json
{
  "id": 1,
  "title": "议题标题",
  "body": "渲染后的正文",
  "template": "bug-report",
  "formData": "{\"description\":\"问题描述\",\"steps\":\"重现步骤\"}",
  "status": "open",
  "priority": "medium",
  "authorId": 1,
  "serverId": "server-id",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "author": {
    "id": 1,
    "username": "username",
    "minecraftName": null
  },
  "labels": []
}
```

### 获取议题列表
> `GET /api/tickets`

可选认证

**查询参数:**
- `page`: 页码 (默认1)
- `pageSize`: 每页数量 (默认20)
- `status`: 状态筛选
- `type`: 模板类型筛选
- `authorId`: 作者ID筛选
- `serverId`: 服务器ID筛选
- `labelId`: 标签ID筛选
- `search`: 搜索关键词

**响应 (200):**
```json
{
  "tickets": [
    {
      "id": 1,
      "title": "议题标题",
      "status": "open",
      "priority": "medium",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "author": {
        "id": 1,
        "username": "username",
        "minecraftName": null
      },
      "labels": [],
      "_count": {
        "comments": 5
      }
    }
  ],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

### 获取单个议题详情
> `GET /api/tickets/:id`

可选认证

**响应 (200):**
```json
{
  "id": 1,
  "title": "议题标题",
  "body": "议题正文",
  "template": "bug-report",
  "formData": "{}",
  "status": "open",
  "priority": "medium",
  "authorId": 1,
  "assigneeId": null,
  "serverId": "server-id",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "author": {
    "id": 1,
    "username": "username",
    "minecraftName": null
  },
  "assignee": null,
  "labels": [],
  "server": {
    "id": "server-id",
    "name": "服务器名称"
  },
  "permissionRequest": null
}
```

### 更新议题
> `PATCH /api/tickets/:id`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "status": "in_progress",
  "priority": "high",
  "assigneeId": 2
}
```

**权限:**
- 议题作者可以更新自己的状态，但只能设置为 `open` 或 `closed`
- `staff` / `admin` 可以将状态设置为任意有效值
- `priority` 和 `assigneeId` 仅 `staff` / `admin` 可更新

**响应 (200):** 更新后的议题对象

### 更新议题正文
> `PATCH /api/tickets/:id/body`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "body": "新的议题正文"
}
```

**响应 (200):** 更新后的议题对象

### 更新议题标题
> `PATCH /api/tickets/:id/title`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "title": "新标题"
}
```

**字段要求:**
- `title`: 1-200个字符

**响应 (200):** 更新后的议题对象

### 关闭议题
> `POST /api/tickets/:id/close`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

将议题状态设置为 `closed`，表示已关闭。

**响应 (200):** 更新后的议题对象

### 重新打开议题
> `POST /api/tickets/:id/reopen`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

将议题状态设置为 `open`。议题作者只能重新打开 `closed` 状态的自己的议题；`staff` / `admin` 也可以重新打开 `invalid` 状态的无效议题。

**响应 (200):** 更新后的议题对象

### 批准议题
> `POST /api/tickets/:id/approve`

需要staff权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (200):** 更新后的议题对象

### 拒绝议题
> `POST /api/tickets/:id/reject`

需要staff权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "reason": "拒绝原因"
}
```

**响应 (200):** 更新后的议题对象

### 添加标签到议题
> `POST /api/tickets/:id/labels`

需要staff权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "labelId": "label-id"
}
```

**响应 (201):** 空响应

### 从议题移除标签
> `DELETE /api/tickets/:id/labels/:labelId`

需要staff权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (204):** 空响应

## 评论接口

### 获取议题评论列表
> `GET /api/tickets/:id/comments`

可选认证

**响应 (200):**
```json
[
  {
    "id": "comment-id",
    "body": "评论内容",
    "ticketId": 1,
    "authorId": 1,
    "source": "web",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "author": {
      "id": 1,
      "username": "username",
      "minecraftName": null
    }
  }
]
```

### 创建评论
> `POST /api/tickets/:id/comments`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "body": "评论内容"
}
```

**响应 (201):**
```json
{
  "id": "comment-id",
  "body": "评论内容",
  "ticketId": 1,
  "authorId": 1,
  "source": "web",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 更新评论内容
> `PATCH /api/tickets/:id/comments/:commentId/body`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "body": "新的评论内容"
}
```

**响应 (200):** 更新后的评论对象

## 审计日志接口

### 获取议题审计日志
> `GET /api/tickets/:ticketId/audit`

可选认证

**响应 (200):**
```json
[
  {
    "id": "audit-id",
    "ticketId": 1,
    "userId": 1,
    "action": "status_change",
    "oldValue": "{\"status\":\"open\"}",
    "newValue": "{\"status\":\"in_progress\"}",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "user": {
      "id": 1,
      "username": "username"
    }
  }
]
```

## 标签接口

### 获取标签列表
> `GET /api/labels`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (200):**
```json
[
  {
    "id": "label-id",
    "name": "bug",
    "color": "#ff0000",
    "description": "Bug报告",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### 创建标签
> `POST /api/labels`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "name": "bug",
  "color": "#ff0000",
  "description": "Bug报告"
}
```

**字段要求:**
- `name`: 1-50个字符
- `color`: 十六进制颜色代码 (如 #ff0000)
- `description`: 可选

**响应 (201):**
```json
{
  "id": "cmr01wuv20000sbdqcezts1eg",
  "name": "bug",
  "color": "#ff0000",
  "description": "Bug报告"
}
```

### 更新标签
> `PATCH /api/labels/:id`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "name": "new-name",
  "color": "#00ff00",
  "description": "新描述"
}
```

**响应 (200):** 更新后的标签对象

### 删除标签
> `DELETE /api/labels/:id`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (204):** 空响应

## 附件接口

### 上传附件
> `POST /api/attachments/upload`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
Content-Type: multipart/form-data
```

**请求体:**
```
file: 文件
ticketId: 议题ID (可选)
commentId: 评论ID (可选)
```

**响应 (201):**
```json
{
  "id": "attachment-id",
  "filename": "image.png",
  "path": "uploaded-file-path",
  "mimeType": "image/png",
  "size": 12345,
  "uploadedBy": 1,
  "ticketId": 1,
  "commentId": null,
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 下载附件
> `GET /api/attachments/:id`

**响应:** 文件流

## 服务器接口

### 获取服务器列表
> `GET /api/servers`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (200):**
```json
[
  {
    "id": "server-id",
    "name": "服务器名称",
    "address": "play.example.com",
    "description": "服务器描述",
    "apiKey": "api-key",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### 创建服务器
> `POST /api/servers`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "name": "服务器名称",
  "address": "play.example.com",
  "description": "服务器描述"
}
```

**字段要求:**
- `name`: 1-50个字符
- `address`: 可选
- `description`: 可选

**响应 (201):**
```json
{
  "id": "cmr01wuw30001sbdqffjk0uxw",
  "name": "服务器名称",
  "apiKey": "lt_9fe4ea7eefe2866b70009a04ad3c5787d4f6acd476311556",
  "address": "play.example.com",
  "description": "服务器描述",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 重新生成服务器API密钥
> `POST /api/servers/:id/regenerate-key`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (200):**
```json
{
  "id": "server-id",
  "name": "服务器名称",
  "address": "play.example.com",
  "description": "服务器描述",
  "apiKey": "new-api-key",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 删除服务器
> `DELETE /api/servers/:id`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (204):** 空响应

## 认证接口

### 绑定Minecraft账号
> `POST /api/auth/link-minecraft`

需要认证。使用游戏中获取的绑定码，将当前平台账户与Minecraft账号绑定。

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "code": "ABC123"
}
```

**字段要求:**
- `code`: 6位绑定码

**响应 (200):**
```json
{
  "uuid": "minecraft-uuid",
  "name": "MinecraftName"
}
```

**错误响应:**
- `400`: 缺少绑定码
- `401`: 未认证
- `400`: 无效或已过期的绑定码

### 解绑Minecraft账号
> `DELETE /api/auth/link-minecraft`

需要认证。解除当前平台账户已绑定的Minecraft账号。

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (200):**
```json
{
  "id": 1,
  "email": "player@example.com",
  "username": "playername",
  "minecraftUuid": null,
  "minecraftName": null,
  "avatarUrl": null,
  "role": "player",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**错误响应:**
- `401`: 未认证
- `400`: 当前账户未绑定Minecraft账号

## Minecraft服务器接口

### 从Minecraft注册账户
> `POST /api/mc/register`

需要服务器API密钥

仅在平台设置「允许Minecraft注册」开启时可用（默认开启）。注册成功后，玩家将直接绑定到新建的账户，无需再走绑定码流程。

**请求头:**
```
X-Server-Key: server-api-key
```

**请求体:**
```json
{
  "email": "player@example.com",
  "password": "password123",
  "username": "playername",
  "minecraftUuid": "minecraft-uuid",
  "minecraftName": "MinecraftName"
}
```

**字段要求:**
- `email`: 有效邮箱
- `password`: 至少8位
- `username`: 2-32个字符
- `minecraftUuid`: Minecraft玩家UUID
- `minecraftName`: Minecraft玩家名称

**响应 (201):**
```json
{
  "user": {
    "id": 1,
    "email": "player@example.com",
    "username": "playername",
    "minecraftUuid": "minecraft-uuid",
    "minecraftName": "MinecraftName",
    "avatarUrl": null,
    "role": "player",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  },
  "accessToken": "jwt-access-token",
  "refreshToken": "jwt-refresh-token"
}
```

**错误响应:**
- `400`: 请求参数错误
- `401`: 缺少或无效的服务器密钥
- `403`: Minecraft注册已关闭
- `409`: 邮箱/用户名已被占用，或该Minecraft账号已绑定到其他账户

### 生成绑定码
> `POST /api/mc/link-code`

需要服务器API密钥

**请求头:**
```
X-Server-Key: server-api-key
```

**请求体:**
```json
{
  "minecraftUuid": "minecraft-uuid",
  "minecraftName": "MinecraftName"
}
```

**响应 (201):**
```json
{
  "code": "ABC123",
  "expiresAt": "2024-01-01T00:10:00.000Z"
}
```

### 从Minecraft解绑账号
> `POST /api/mc/unlink`

需要服务器API密钥。解除指定Minecraft账号与平台账户的绑定。

**请求头:**
```
X-Server-Key: server-api-key
```

**请求体:**
```json
{
  "minecraftUuid": "minecraft-uuid"
}
```

**字段要求:**
- `minecraftUuid`: Minecraft玩家UUID

**响应 (200):**
```json
{
  "id": 1,
  "email": "player@example.com",
  "username": "playername",
  "minecraftUuid": null,
  "minecraftName": null,
  "avatarUrl": null,
  "role": "player",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

**错误响应:**
- `400`: 缺少 `minecraftUuid`
- `401`: 缺少或无效的服务器密钥
- `404`: 该Minecraft账号未绑定任何账户

### 从Minecraft创建议题
> `POST /api/mc/tickets`

需要服务器API密钥

**请求头:**
```
X-Server-Key: server-api-key
```

**请求体:**
```json
{
  "minecraftUuid": "minecraft-uuid",
  "title": "议题标题",
  "body": "议题内容",
  "template": "bug-report",
  "formData": {},
  "context": {
    "world": "world",
    "x": 100,
    "y": 64,
    "z": 200,
    "gameMode": "survival"
  }
}
```

**响应 (201):** 创建的议题对象

### 获取玩家的议题列表
> `GET /api/mc/tickets/:uuid`

需要服务器API密钥

**请求头:**
```
X-Server-Key: server-api-key
```

**查询参数:**
- `page`: 页码 (默认1)

**响应 (200):**
```json
{
  "tickets": [
    {
      "id": 1,
      "title": "议题标题",
      "status": "open",
      "priority": "medium",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "author": {
        "id": 1,
        "username": "username",
        "minecraftName": null
      },
      "labels": [],
      "_count": {
        "comments": 5
      }
    }
  ],
  "total": 100,
  "page": 1,
  "pageSize": 10
}
```

### 获取Minecraft玩家绑定信息
> `GET /api/mc/user/:uuid`

需要服务器API密钥

**请求头:**
```
X-Server-Key: server-api-key
```

**响应 (200):**
```json
{
  "id": 1,
  "email": "player@example.com",
  "username": "playername",
  "minecraftUuid": "minecraft-uuid",
  "minecraftName": "MinecraftName",
  "avatarUrl": null,
  "role": "player",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 从Minecraft添加评论
> `POST /api/mc/comments`

需要服务器API密钥

**请求头:**
```
X-Server-Key: server-api-key
```

**请求体:**
```json
{
  "minecraftUuid": "minecraft-uuid",
  "ticketId": 1,
  "body": "评论内容"
}
```

**响应 (201):** 创建的评论对象

### 报告权限执行结果
> `POST /api/mc/permission-executed`

需要服务器API密钥

**请求头:**
```
X-Server-Key: server-api-key
```

**请求体:**
```json
{
  "ticketId": 1,
  "success": true,
  "errorMessage": null
}
```

**响应 (200):**
```json
{
  "ok": true
}
```

### 从Minecraft关闭议题
> `POST /api/mc/tickets/:id/close`

需要服务器API密钥

**请求头:**
```
X-Server-Key: server-api-key
```

**请求体:**
```json
{
  "minecraftUuid": "minecraft-uuid"
}
```

将议题状态设置为 `closed`，表示已关闭。

**响应 (200):** 更新后的议题对象

### 从Minecraft重新打开议题
> `POST /api/mc/tickets/:id/reopen`

需要服务器API密钥

**请求头:**
```
X-Server-Key: server-api-key
```

**请求体:**
```json
{
  "minecraftUuid": "minecraft-uuid"
}
```

**响应 (200):** 更新后的议题对象

### 从Minecraft更改议题状态
> `POST /api/mc/tickets/:id/status`

需要服务器API密钥

**请求头:**
```
X-Server-Key: server-api-key
```

**请求体:**
```json
{
  "minecraftUuid": "minecraft-uuid",
  "status": "closed"
}
```

**字段要求:**
- `minecraftUuid`: Minecraft玩家UUID
- `status`: `open` | `in_progress` | `closed` | `invalid`

**权限:**
- 议题作者可以更改自己的议题状态，但只能设置为 `open` 或 `closed`
- `staff` / `admin` 可以将状态设置为任意有效值
- 其他人不可以更改

**响应 (200):** 更新后的议题对象

**错误响应:**
- `400`: 缺少参数或无效状态
- `401`: 缺少或无效的服务器密钥
- `403`: 无权限更改此议题状态
- `404`: 议题不存在

## 用户接口

### 获取用户列表
> `GET /api/users`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**查询参数:**
- `page`: 页码 (默认1)
- `pageSize`: 每页数量 (默认20)

**响应 (200):**
```json
{
  "users": [
    {
      "id": 1,
      "email": "user@example.com",
      "username": "username",
      "minecraftUuid": null,
      "minecraftName": null,
      "avatarUrl": null,
      "role": "player",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

### 更新当前用户头像
> `PATCH /api/users/me/avatar`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "avatarUrl": "https://example.com/avatar.png"
}
```

**响应 (200):** 更新后的用户对象

### 更新当前用户名
> `PATCH /api/users/me/username`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "username": "newusername"
}
```

**字段要求:**
- `username`: 2-32个字符

**响应 (200):** 更新后的用户对象

### 修改当前用户密码
> `PATCH /api/users/me/password`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

**字段要求:**
- `currentPassword`: 当前密码
- `newPassword`: 至少8位

**响应 (200):**
```json
{
  "message": "密码已更新"
}
```

### 更新当前用户邮箱
> `PATCH /api/users/me/email`

需要认证

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "email": "newemail@example.com"
}
```

**响应 (200):** 更新后的用户对象

### 修改用户角色
> `PATCH /api/users/:id/role`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "role": "staff"
}
```

**字段要求:**
- `role`: `player` | `staff` | `admin`

**响应 (200):** 更新后的用户对象

### 删除用户
> `DELETE /api/users/:id`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (204):** 空响应

## 模板接口

### 获取模板列表
> `GET /api/templates`

**响应 (200):**
```json
[
  {
    "name": "bug_report",
    "name_i18n": "Bug 反馈",
    "description": "报告游戏中遇到的问题",
    "labels": []
  }
]
```

### 获取单个模板详情
> `GET /api/templates/:name`

**响应 (200):**
```json
{
  "name": "Bug 反馈",
  "description": "报告游戏中遇到的问题",
  "title_prefix": "[Bug] ",
  "labels": [],
  "body": [
    {
      "type": "markdown",
      "attributes": {
        "value": "感谢你反馈问题！请尽量提供**稳定复现的步骤**。\n"
      }
    },
    {
      "type": "textarea",
      "id": "description",
      "validations": {
        "required": true
      },
      "attributes": {
        "label": "问题描述",
        "placeholder": "清晰描述你遇到的问题..."
      }
    },
    {
      "type": "textarea",
      "id": "reproduce",
      "validations": {
        "required": true
      },
      "attributes": {
        "label": "复现步骤"
      }
    }
  ]
}
```

## 管理模板接口

### 获取管理模板列表
> `GET /api/admin/templates`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (200):**
```json
[
  {
    "id": 1,
    "name": "bug_report",
    "nameI18n": "Bug 反馈",
    "description": "报告游戏中遇到的问题",
    "titlePrefix": "[Bug] ",
    "labels": "[]",
    "body": "[{\"type\":\"markdown\",\"attributes\":{\"value\":\"感谢你反馈问题！请尽量提供**稳定复现的步骤**。\\n\"}},{\"type\":\"textarea\",\"id\":\"description\",\"validations\":{\"required\":true},\"attributes\":{\"label\":\"问题描述\",\"placeholder\":\"清晰描述你遇到的问题...\"}},{\"type\":\"textarea\",\"id\":\"reproduce\",\"validations\":{\"required\":true},\"attributes\":{\"label\":\"复现步骤\"}}]",
    "completionHooks": "[]",
    "enabled": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
]
```

### 获取管理模板详情
> `GET /api/admin/templates/:id`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (200):** 模板详情对象

### 创建模板
> `POST /api/admin/templates`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "name": "bug-report",
  "nameI18n": "Bug报告",
  "description": "报告游戏Bug",
  "titlePrefix": "[Bug] ",
  "labels": "bug",
  "body": "## 问题描述\n{{description}}\n\n## 重现步骤\n{{steps}}",
  "completionHooks": null,
  "enabled": true
}
```

**字段要求:**
- `name`: 1-50个字符
- `nameI18n`: 1-100个字符
- `description`: 1-500个字符
- `titlePrefix`: 可选, 最多50个字符
- `labels`: 可选
- `body`: 必填
- `completionHooks`: 可选
- `enabled`: 可选, 默认true

**响应 (201):** 创建的模板对象

### 更新模板
> `PATCH /api/admin/templates/:id`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "nameI18n": "新的名称",
  "description": "新的描述"
}
```

**响应 (200):** 更新后的模板对象

### 删除模板
> `DELETE /api/admin/templates/:id`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**响应 (204):** 空响应

## 设置接口

### 获取站点配置
> `GET /api/setup/site-config`

公开接口

**响应 (200):**
```json
{
  "isSetup": true,
  "requireLogin": false,
  "allowWebRegister": true,
  "allowMcRegister": true,
  "siteName": "LightTickets",
  "siteUrl": null,
  "footerContent": null
}
```

### 执行初始设置
> `POST /api/setup`

**请求体:**
```json
{
  "db": {
    "provider": "sqlite",
    "databaseUrl": "file:./data/lighttickets.db"
  },
  "admin": {
    "email": "admin@example.com",
    "password": "admin123",
    "username": "admin"
  },
  "site": {
    "siteName": "LightTickets",
    "siteUrl": "https://tickets.example.com"
  },
  "mc": {
    "defaultServerName": "主服务器"
  }
}
```

**字段要求:**
- `db.provider`: `sqlite` | `mysql`
- `db.databaseUrl`: 数据库连接字符串
- `admin.email`: 有效邮箱
- `admin.password`: 至少6位
- `admin.username`: 2-30个字符
- `site`: 可选
- `mc`: 可选

**响应 (201):**
```json
{
  "message": "设置完成"
}
```

### 更新站点设置
> `PATCH /api/setup/settings`

需要admin权限

**请求头:**
```
Authorization: Bearer <accessToken>
```

**请求体:**
```json
{
  "requireLogin": true,
  "allowWebRegister": false,
  "allowMcRegister": false,
  "siteName": "新站点名称",
  "siteUrl": "https://new.example.com",
  "footerContent": "新页脚内容"
}
```

**响应 (200):** 更新后的站点配置

## 健康检查

### 健康检查
> `GET /api/health`

**响应 (200):**
```json
{
  "status": "ok"
}
```

## 错误响应

所有错误响应格式:

```json
{
  "error": "错误信息"
}
```

常见HTTP状态码:
- `400`: 请求参数错误
- `401`: 未认证
- `403`: 权限不足
- `404`: 资源不存在
- `409`: 资源冲突
- `500`: 服务器内部错误

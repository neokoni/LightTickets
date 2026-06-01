# Markdown Textarea 拖入/粘贴图片插入设计

## 概述

在 textarea 字段（支持 Markdown 的区域）中，支持拖拽文件和粘贴图片，自动上传并以 `![](url)` 形式插入到光标位置，类似 GitHub Issue 的体验。

## 作用范围

- 创建议题第二步：模板表单中的 textarea 字段
- 议题详情页：评论 textarea

仅支持图片文件（png/jpg/gif/webp）。

## 方案：暂存后上传 + 先建后更新

### 流程

1. 用户拖入/粘贴图片 → 创建 object URL → 在 textarea 光标位置插入 `![](blob:...)`
2. 提交时：创建 ticket/comment（body 含 blob URL）→ 上传附件获取真实 URL → PATCH 更新 body 中的 URL

### 需要新增的后端接口

#### PATCH /api/tickets/:id/body

更新 ticket 的 body 字段。仅作者或 staff 可操作。

```typescript
// request
{ body: string }

// response
Ticket
```

#### PATCH /api/comments/:id/body

更新 comment 的 body 字段。仅作者可操作。

```typescript
// request
{ body: string }

// response
Comment
```

### 前端改动

#### 新增 composable: `useMarkdownUpload`

管理 textarea 中的待上传文件：

- `pendingFiles`: Map<string, File>（objectUrl → File）
- `handleDrop(event)`: 捕获拖入的图片文件，创建 object URL，插入 `![](url)`
- `handlePaste(event)`: 捕获粘贴的图片文件，创建 object URL，插入 `![](url)`
- `uploadAndReplace(text, ticketId)`: 上传所有待替换文件，返回替换后的文本
- `cleanup()`: 释放所有 object URL

#### 修改 BaseTextarea

新增 props：
- `uploadable?: boolean` — 启用拖入/粘贴图片功能
- `emit: 'file-drop'` / `emit: 'file-paste'` — 向父组件传递文件事件

或者：不修改 BaseTextarea，在父组件中通过 ref 监听 textarea DOM 事件。

#### 修改 TicketCreateView.vue submit 流程

```
1. 创建 ticket（body 含 blob URL）
2. 上传所有附件（step 3 的 files + 各 textarea 的 pendingFiles）
3. 如果 body 中有 blob URL，PATCH 更新 ticket body
4. 跳转
```

#### 修改 TicketDetailView.vue submitComment 流程

```
1. 创建 comment（body 含 blob URL）
2. 上传评论的 pendingFiles
3. 如果 body 中有 blob URL，PATCH 更新 comment body
4. 清空 textarea
```

### 文件结构

```
frontend/src/composables/useMarkdownUpload.ts  — 新增
frontend/src/components/base/BaseTextarea.vue  — 修改（添加 uploadable 支持）
frontend/src/views/TicketCreateView.vue        — 修改（集成图片上传）
frontend/src/views/TicketDetailView.vue        — 修改（评论图片上传）
frontend/src/api/tickets.ts                    — 新增 apiUpdateTicketBody
frontend/src/api/comments.ts                   — 新增 apiUpdateCommentBody
backend/src/routes/tickets.ts                  — 新增 PATCH /:id/body
backend/src/routes/comments.ts                 — 新增 PATCH /:id/body
backend/src/services/ticket.service.ts         — 新增 updateBody
backend/src/services/comment.service.ts        — 新增 updateBody
```

### 拖入/粘贴交互细节

- 拖入时：textarea 显示虚线边框高亮（dragover 状态）
- 粘贴时：仅拦截 `clipboardData` 中包含图片的情况
- 插入后：textarea 下方显示待上传文件列表（可删除）
- 支持同时拖入多张图片
- 非图片文件忽略

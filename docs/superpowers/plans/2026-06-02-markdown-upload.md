# Markdown Textarea 拖入/粘贴图片上传 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 textarea 字段中支持拖拽和粘贴图片，自动上传并以 `![](url)` 插入 markdown，类似 GitHub Issue。

**Architecture:** 前端通过 composable 管理待上传文件（object URL 暂存），提交时批量上传并替换为真实 URL。后端新增 PATCH 端点支持更新 ticket/comment 的 body。

**Tech Stack:** Vue 3 Composition API, Express, Prisma, Multer

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/services/ticket.service.ts` | Modify | 新增 `updateBody` 方法 |
| `backend/src/services/comment.service.ts` | Modify | 新增 `updateBody` 方法 |
| `backend/src/routes/tickets.ts` | Modify | 新增 `PATCH /:id/body` |
| `backend/src/routes/comments.ts` | Modify | 新增 `PATCH /:id/body` |
| `frontend/src/api/tickets.ts` | Modify | 新增 `apiUpdateTicketBody` |
| `frontend/src/api/comments.ts` | Modify | 新增 `apiUpdateCommentBody` |
| `frontend/src/api/attachments.ts` | Modify | 修复上传路径，新增 `apiUploadAttachmentDirect` |
| `frontend/src/composables/useMarkdownUpload.ts` | Create | 拖入/粘贴/上传核心逻辑 |
| `frontend/src/components/base/BaseTextarea.vue` | Modify | 新增 uploadable 支持 |
| `frontend/src/views/TicketCreateView.vue` | Modify | 集成图片上传到 textarea 字段 |
| `frontend/src/views/TicketDetailView.vue` | Modify | 评论 textarea 集成图片上传 |

---

### Task 1: Backend — ticket service updateBody

**Files:**
- Modify: `backend/src/services/ticket.service.ts:95-169`

- [ ] **Step 1: Add updateBody function**

在 `ticket.service.ts` 的 `update` 函数之后添加：

```typescript
export async function updateBody(id: number, userId: string, userRole: string, body: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';
  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  return prisma.ticket.update({
    where: { id },
    data: { body },
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
      permissionRequest: true,
    },
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/neokoni/projects/LightTickets/backend && npx tsc --noEmit 2>&1 | grep ticket.service`
Expected: no errors from ticket.service.ts

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/ticket.service.ts
git commit -m "feat: add ticket service updateBody method"
```

---

### Task 2: Backend — comment service updateBody

**Files:**
- Modify: `backend/src/services/comment.service.ts:1-22`

- [ ] **Step 1: Add updateBody function**

在 `comment.service.ts` 的 `listByTicket` 函数之后添加：

```typescript
export async function updateBody(id: number, userId: string, body: string) {
  const comment = await prisma.comment.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!comment) throw new NotFoundError('评论不存在');
  if (comment.authorId !== userId) throw new ForbiddenError('无权操作此评论');

  return prisma.comment.update({
    where: { id },
    data: { body },
    include: { author: { select: { id: true, username: true, minecraftName: true } } },
  });
}
```

需要在文件顶部导入 `ForbiddenError`：

```typescript
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/neokoni/projects/LightTickets/backend && npx tsc --noEmit 2>&1 | grep comment.service`
Expected: no errors from comment.service.ts

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/comment.service.ts
git commit -m "feat: add comment service updateBody method"
```

---

### Task 3: Backend — PATCH /:id/body routes

**Files:**
- Modify: `backend/src/routes/tickets.ts:70-73`
- Modify: `backend/src/routes/comments.ts:24-30`

- [ ] **Step 1: Add ticket body PATCH route**

在 `tickets.ts` 的 `PATCH /:id` 路由（第 70 行）之后添加：

```typescript
const updateBodySchema = z.object({
  body: z.string().min(1),
});

router.patch('/:id/body', authMiddleware, async (req: Request, res: Response) => {
  const parsed = updateBodySchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const ticket = await ticketService.updateBody(parseId(req.params.id), req.user!.userId, req.user!.role, parsed.data.body);
  res.json(ticket);
});
```

- [ ] **Step 2: Add comment body PATCH route**

在 `comments.ts` 的 `POST /` 路由（第 24 行）之后添加：

```typescript
import { ForbiddenError } from '../utils/errors.js';

const updateBodySchema = z.object({
  body: z.string().min(1),
});

router.patch('/:commentId/body', authMiddleware, async (req: Request, res: Response) => {
  const parsed = updateBodySchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const comment = await commentService.updateBody(
    Number(req.params.commentId),
    req.user!.userId,
    parsed.data.body,
  );
  res.json(comment);
});
```

注意：comments 路由挂载在 `/api/tickets/:id/comments`，所以 `req.params.commentId` 需要从路径中获取。但由于 `mergeParams: true`，实际参数名取决于路由定义。需要确认路由路径为 `/:commentId/body`。

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/neokoni/projects/LightTickets/backend && npx tsc --noEmit 2>&1 | grep -E "(tickets\.ts|comments\.ts)"`
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/tickets.ts backend/src/routes/comments.ts
git commit -m "feat: add PATCH body endpoints for tickets and comments"
```

---

### Task 4: Frontend — API functions

**Files:**
- Modify: `frontend/src/api/tickets.ts`
- Modify: `frontend/src/api/comments.ts`
- Modify: `frontend/src/api/attachments.ts`

- [ ] **Step 1: Add apiUpdateTicketBody**

在 `tickets.ts` 末尾添加：

```typescript
export function apiUpdateTicketBody(id: number, body: string) {
  return apiFetch<Ticket>(`/tickets/${id}/body`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  })
}
```

- [ ] **Step 2: Add apiUpdateCommentBody**

在 `comments.ts` 末尾添加：

```typescript
export function apiUpdateCommentBody(ticketId: number, commentId: number, body: string) {
  return apiFetch<Comment>(`/tickets/${ticketId}/comments/${commentId}/body`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  })
}
```

- [ ] **Step 3: Fix apiUploadAttachment path and add direct upload**

当前 `apiUploadAttachment` 的路径 `/tickets/${ticketId}/attachments` 与后端 `/attachments/upload` 不匹配。修复并新增一个不依赖 ticketId 的上传函数：

```typescript
export function apiUploadAttachment(file: File, opts?: { ticketId?: number; commentId?: string }) {
  const form = new FormData()
  form.append('file', file)
  if (opts?.ticketId) form.append('ticketId', String(opts.ticketId))
  if (opts?.commentId) form.append('commentId', opts.commentId)
  return apiFetch<Attachment>('/attachments/upload', {
    method: 'POST',
    body: form,
  })
}
```

注意：这会改变现有 `apiUploadAttachment` 的调用签名。需要同时更新 `TicketCreateView.vue` 中现有的调用（在 Task 6 中处理）。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/tickets.ts frontend/src/api/comments.ts frontend/src/api/attachments.ts
git commit -m "feat: add body update APIs and fix attachment upload path"
```

---

### Task 5: Frontend — useMarkdownUpload composable

**Files:**
- Create: `frontend/src/composables/useMarkdownUpload.ts`

- [ ] **Step 1: Create the composable**

```typescript
import { ref } from 'vue'
import { apiUploadAttachment } from '@/api/attachments'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export interface PendingFile {
  objectUrl: string
  file: File
}

export function useMarkdownUpload() {
  const pendingFiles = ref<Map<string, File>>(new Map())
  const isDragging = ref(false)

  function filterImageFiles(files: FileList | File[]): File[] {
    return Array.from(files).filter(f => IMAGE_TYPES.includes(f.type))
  }

  function insertAtCursor(textarea: HTMLTextAreaElement, text: string, modelValue: { value: string }) {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = modelValue.value.substring(0, start)
    const after = modelValue.value.substring(end)
    modelValue.value = before + text + after
    // Restore cursor position after the inserted text
    setTimeout(() => {
      textarea.focus()
      const newPos = start + text.length
      textarea.setSelectionRange(newPos, newPos)
    }, 0)
  }

  function handleDrop(e: DragEvent, textarea: HTMLTextAreaElement, modelValue: { value: string }) {
    e.preventDefault()
    isDragging.value = false
    if (!e.dataTransfer?.files) return

    const images = filterImageFiles(e.dataTransfer.files)
    if (images.length === 0) return

    const parts: string[] = []
    for (const file of images) {
      const url = URL.createObjectURL(file)
      pendingFiles.value.set(url, file)
      parts.push(`![](${url})`)
    }
    insertAtCursor(textarea, parts.join('\n'), modelValue)
  }

  function handlePaste(e: ClipboardEvent, textarea: HTMLTextAreaElement, modelValue: { value: string }) {
    if (!e.clipboardData?.files?.length) return

    const images = filterImageFiles(e.clipboardData.files)
    if (images.length === 0) return

    e.preventDefault()
    const parts: string[] = []
    for (const file of images) {
      const url = URL.createObjectURL(file)
      pendingFiles.value.set(url, file)
      parts.push(`![](${url})`)
    }
    insertAtCursor(textarea, parts.join('\n'), modelValue)
  }

  function removePending(objectUrl: string) {
    URL.revokeObjectURL(objectUrl)
    pendingFiles.value.delete(objectUrl)
  }

  async function uploadAndReplace(text: string, ticketId: number): Promise<string> {
    let result = text
    const entries = Array.from(pendingFiles.value.entries())

    const uploads = entries.map(async ([objectUrl, file]) => {
      const attachment = await apiUploadAttachment(file, { ticketId })
      result = result.replaceAll(objectUrl, `/api/attachments/${attachment.id}`)
      URL.revokeObjectURL(objectUrl)
    })

    await Promise.all(uploads)
    pendingFiles.value.clear()
    return result
  }

  async function uploadForComment(text: string, ticketId: number, commentId: number): Promise<string> {
    let result = text
    const entries = Array.from(pendingFiles.value.entries())

    const uploads = entries.map(async ([objectUrl, file]) => {
      const attachment = await apiUploadAttachment(file, { ticketId, commentId: String(commentId) })
      result = result.replaceAll(objectUrl, `/api/attachments/${attachment.id}`)
      URL.revokeObjectURL(objectUrl)
    })

    await Promise.all(uploads)
    pendingFiles.value.clear()
    return result
  }

  function cleanup() {
    for (const url of pendingFiles.value.keys()) {
      URL.revokeObjectURL(url)
    }
    pendingFiles.value.clear()
  }

  return {
    pendingFiles,
    isDragging,
    handleDrop,
    handlePaste,
    removePending,
    uploadAndReplace,
    uploadForComment,
    cleanup,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/neokoni/projects/LightTickets/frontend && npx vue-tsc --noEmit 2>&1 | grep useMarkdownUpload`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/composables/useMarkdownUpload.ts
git commit -m "feat: add useMarkdownUpload composable for drag-and-paste image upload"
```

---

### Task 6: Frontend — BaseTextarea uploadable support

**Files:**
- Modify: `frontend/src/components/base/BaseTextarea.vue`

- [ ] **Step 1: Add uploadable props and events**

```vue
<script setup lang="ts">
const model = defineModel<string>()

defineProps<{
  label?: string
  placeholder?: string
  rows?: number
  error?: string
  uploadable?: boolean
}>()

const emit = defineEmits<{
  'file-drop': [e: DragEvent]
  'file-paste': [e: ClipboardEvent]
}>()

function onDragover(e: DragEvent) {
  e.preventDefault()
}

function onDrop(e: DragEvent) {
  emit('file-drop', e)
}

function onPaste(e: ClipboardEvent) {
  emit('file-paste', e)
}
</script>

<template>
  <div class="space-y-1.5">
    <label v-if="label" class="block text-sm font-medium text-slate-700 dark:text-slate-300">{{ label }}</label>
    <textarea
      v-model="model"
      :placeholder="placeholder"
      :rows="rows || 4"
      class="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 dark:focus:ring-slate-100/20 dark:focus:border-slate-600 resize-y transition"
      :class="{ 'border-red-400 dark:border-red-500': error }"
      @dragover="uploadable ? onDragover($event) : undefined"
      @drop="uploadable ? onDrop($event) : undefined"
      @paste="uploadable ? onPaste($event) : undefined"
    />
    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/base/BaseTextarea.vue
git commit -m "feat: add uploadable support to BaseTextarea"
```

---

### Task 7: Frontend — TicketCreateView integration

**Files:**
- Modify: `frontend/src/views/TicketCreateView.vue`

- [ ] **Step 1: Import composable and wire up textarea fields**

在 `<script setup>` 中导入并初始化：

```typescript
import { useMarkdownUpload } from '@/composables/useMarkdownUpload'
```

移除现有的 `files` ref、`onFileChange`、`removeFile` 函数，以及模板中的附件上传 UI（step 3 中的文件上传部分）。

在 composable 解构之后添加：

```typescript
const mdUpload = useMarkdownUpload()
```

修改 textarea 渲染部分，添加 uploadable 支持：

```html
<!-- textarea -->
<BaseTextarea
  v-else-if="field.type === 'textarea'"
  :model-value="formValues[field.id || ''] || ''"
  @update:model-value="setFieldValue(field.id || '', $event || '')"
  :label="field.attributes.label || ''"
  :placeholder="field.attributes.placeholder"
  :rows="6"
  uploadable
  @file-drop="onTextareaFileDrop($event, field.id || '')"
  @file-paste="onTextareaFilePaste($event, field.id || '')"
/>
```

添加处理函数：

```typescript
function getActiveTextarea(): HTMLTextAreaElement | null {
  return document.activeElement as HTMLTextAreaElement | null
}

function onTextareaFileDrop(e: DragEvent, fieldId: string) {
  const textarea = getActiveTextarea()
  if (!textarea) return
  const modelValue = { get value() { return formValues.value[fieldId] || '' }, set value(v: string) { setFieldValue(fieldId, v) } }
  mdUpload.handleDrop(e, textarea, modelValue)
}

function onTextareaFilePaste(e: ClipboardEvent, fieldId: string) {
  const textarea = getActiveTextarea()
  if (!textarea) return
  const modelValue = { get value() { return formValues.value[fieldId] || '' }, set value(v: string) { setFieldValue(fieldId, v) } }
  mdUpload.handlePaste(e, textarea, modelValue)
}
```

在 textarea 渲染下方添加待上传文件列表：

```html
<div v-if="field.type === 'textarea' && mdUpload.pendingFiles.value.size > 0" class="mt-1 flex flex-wrap gap-2">
  <div
    v-for="[url, file] in mdUpload.pendingFiles.value"
    :key="url"
    class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
  >
    <Icon icon="lucide:image" class="w-3 h-3 text-slate-400" />
    <span class="text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{{ file.name }}</span>
    <button type="button" @click="mdUpload.removePending(url)" class="text-slate-400 hover:text-red-500">
      <Icon icon="lucide:x" class="w-3 h-3" />
    </button>
  </div>
</div>
```

- [ ] **Step 2: Update submit flow**

修改 `submit` 函数，在创建 ticket 后上传附件并更新 body：

```typescript
async function submit() {
  if (!selectedTemplateName.value || !title.value.trim()) return
  error.value = ''
  loading.value = true
  try {
    // Build body with blob URLs
    const rawBody = JSON.stringify(formValues.value)
    const ticket = await apiCreateTicket({
      title: title.value.trim(),
      template: selectedTemplateName.value,
      formData: formValues.value,
    })

    // Upload step 3 files
    // ... (existing file upload logic, using updated apiUploadAttachment signature)

    // Upload markdown-embedded images and update body
    if (mdUpload.pendingFiles.value.size > 0) {
      const updatedBody = await mdUpload.uploadAndReplace(ticket.body, ticket.id)
      await apiUpdateTicketBody(ticket.id, updatedBody)
    }

    ui.toast('议题已创建', 'success')
    router.push(`/tickets/${ticket.id}`)
  } catch (e: any) {
    error.value = e.message || '创建失败'
  } finally {
    loading.value = false
  }
}
```

注意：`apiCreateTicket` 返回的 ticket 对象需要包含 `body` 字段。需要确认后端 `create` 返回的 ticket 包含 body。

- [ ] **Step 3: Remove old file upload UI from step 3**

从 step 3 的模板中移除附件上传区域（文件输入、上传按钮、文件列表），因为图片现在通过 textarea 拖入/粘贴处理。保留 step 3 中的标题输入和提交按钮。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/TicketCreateView.vue
git commit -m "feat: integrate markdown image upload into ticket creation form"
```

---

### Task 8: Frontend — TicketDetailView comment integration

**Files:**
- Modify: `frontend/src/views/TicketDetailView.vue`

- [ ] **Step 1: Import composable and wire up comment textarea**

在 `<script setup>` 中导入：

```typescript
import { useMarkdownUpload } from '@/composables/useMarkdownUpload'
import { apiUpdateCommentBody } from '@/api/comments'

const mdUpload = useMarkdownUpload()
```

修改评论 textarea 模板：

```html
<BaseTextarea
  ref="commentTextareaRef"
  v-model="newComment"
  placeholder="添加评论... (支持 Markdown)"
  :rows="3"
  uploadable
  @file-drop="onCommentFileDrop"
  @file-paste="onCommentFilePaste"
/>
```

添加处理函数和 ref：

```typescript
const commentTextareaRef = ref<InstanceType<typeof BaseTextarea> | null>(null)

function onCommentFileDrop(e: DragEvent) {
  const textarea = commentTextareaRef.value?.$el?.querySelector('textarea') as HTMLTextAreaElement
  if (!textarea) return
  mdUpload.handleDrop(e, textarea, newComment)
}

function onCommentFilePaste(e: ClipboardEvent) {
  const textarea = commentTextareaRef.value?.$el?.querySelector('textarea') as HTMLTextAreaElement
  if (!textarea) return
  mdUpload.handlePaste(e, textarea, newComment)
}
```

- [ ] **Step 2: Update submitComment flow**

```typescript
async function submitComment() {
  if (!newComment.value.trim()) return
  submitting.value = true
  try {
    const comment = await apiCreateComment(id, newComment.value)

    if (mdUpload.pendingFiles.value.size > 0) {
      const updatedBody = await mdUpload.uploadForComment(comment.body, id, Number(comment.id))
      await apiUpdateCommentBody(id, Number(comment.id), updatedBody)
      comment.body = updatedBody
    }

    comments.value.push(comment)
    newComment.value = ''
  } catch (e: any) {
    ui.toast(e.message || '评论失败', 'error')
  } finally {
    submitting.value = false
  }
}
```

- [ ] **Step 3: Update closeTicket and reopenTicket**

`closeTicket` 和 `reopenTicket` 函数中也有创建评论的逻辑，需要同样处理图片上传。在 `await apiCreateComment(id, newComment.value)` 之后添加相同的上传和更新逻辑。

- [ ] **Step 4: Add pending files UI below textarea**

在评论表单的 textarea 下方添加待上传文件列表：

```html
<div v-if="mdUpload.pendingFiles.value.size > 0" class="flex flex-wrap gap-2">
  <div
    v-for="[url, file] in mdUpload.pendingFiles.value"
    :key="url"
    class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
  >
    <Icon icon="lucide:image" class="w-3 h-3 text-slate-400" />
    <span class="text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{{ file.name }}</span>
    <button type="button" @click="mdUpload.removePending(url)" class="text-slate-400 hover:text-red-500">
      <Icon icon="lucide:x" class="w-3 h-3" />
    </button>
  </div>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/TicketDetailView.vue
git commit -m "feat: integrate markdown image upload into comment form"
```

---

### Task 9: Cleanup and verification

- [ ] **Step 1: Verify TypeScript compiles**

```bash
cd /home/neokoni/projects/LightTickets/backend && npx tsc --noEmit 2>&1 | grep -v "node_modules"
cd /home/neokoni/projects/LightTickets/frontend && npx vue-tsc --noEmit 2>&1 | grep -v "node_modules"
```

- [ ] **Step 2: Verify dev server starts**

```bash
cd /home/neokoni/projects/LightTickets/frontend && npm run dev
cd /home/neokoni/projects/LightTickets/backend && npm run dev
```

- [ ] **Step 3: Manual test**

1. 创建议题 → 选择有 textarea 的模板
2. 在 textarea 中粘贴图片 → 验证 `![](blob:...)` 插入
3. 拖入图片 → 验证插入
4. 提交 → 验证图片 URL 被替换为真实 URL
5. 在议题详情页评论中重复上述测试

- [ ] **Step 4: Final commit if needed**

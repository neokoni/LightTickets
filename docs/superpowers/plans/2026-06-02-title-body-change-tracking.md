# Title & Body Change Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ticket title and body editing with full audit trail — title changes render inline (strikethrough → arrow → new), body changes show a click-to-expand unified diff modal.

**Architecture:** Two new backend endpoints (`PATCH /:id/title`, modify `PATCH /:id/body`), both creating audit log entries. Frontend adds inline edit UI for title and body, and two new timeline renderers for the audit actions. Client-side diff via the `diff` npm package.

**Tech Stack:** Express + Prisma (backend), Vue 3 + Pinia + TailwindCSS (frontend), `diff` npm package for unified diff rendering.

---

### Task 1: Add `updateTitle` to backend service and route

**Files:**
- Modify: `backend/src/services/ticket.service.ts`
- Modify: `backend/src/routes/tickets.ts`

- [ ] **Step 1: Add `updateTitle` function to ticket service**

In `backend/src/services/ticket.service.ts`, add after the `updateBody` function (after line 193):

```typescript
export async function updateTitle(id: number, userId: string, userRole: string, title: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: { author: { select: { id: true } } },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';
  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');

  const updated = await prisma.ticket.update({
    where: { id },
    data: { title },
    include: {
      author: { select: { id: true, username: true, minecraftName: true } },
      assignee: { select: { id: true, username: true } },
      labels: { include: { label: true } },
      server: { select: { id: true, name: true } },
      permissionRequest: true,
    },
  });

  await auditService.create(id, userId, 'title_change', ticket.title, title);

  return updated;
}
```

- [ ] **Step 2: Add title route to tickets router**

In `backend/src/routes/tickets.ts`, add after the body route (after line 85):

```typescript
const updateTitleSchema = z.object({
  title: z.string().min(1).max(200),
});

router.patch('/:id/title', authMiddleware, async (req: Request, res: Response) => {
  const parsed = updateTitleSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const ticket = await ticketService.updateTitle(parseId(req.params.id), req.user!.userId, req.user!.role, parsed.data.title);
  res.json(ticket);
});
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/ticket.service.ts backend/src/routes/tickets.ts
git commit -m "feat(backend): add title update endpoint with audit logging"
```

---

### Task 2: Add audit logging to existing `updateBody` backend

**Files:**
- Modify: `backend/src/services/ticket.service.ts`

- [ ] **Step 1: Add audit log creation to `updateBody`**

In `backend/src/services/ticket.service.ts`, replace the `updateBody` function (lines 171-193) with:

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

  const updated = await prisma.ticket.update({
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

  await auditService.create(id, userId, 'body_change', ticket.body, body);

  return updated;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/services/ticket.service.ts
git commit -m "feat(backend): add audit logging to body update"
```

---

### Task 3: Add frontend API functions and store actions

**Files:**
- Modify: `frontend/src/api/tickets.ts`
- Modify: `frontend/src/stores/tickets.ts`

- [ ] **Step 1: Add `apiUpdateTicketTitle` to API client**

In `frontend/src/api/tickets.ts`, add after `apiUpdateTicketBody` (after line 75):

```typescript
export function apiUpdateTicketTitle(id: number, title: string) {
  return apiFetch<Ticket>(`/tickets/${id}/title`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  })
}
```

- [ ] **Step 2: Add `updateTitle` action to tickets store**

In `frontend/src/stores/tickets.ts`, add import of `apiUpdateTicketTitle` and `apiUpdateTicketBody` at the top, then add the action after `reopenTicket` (after line 65):

```typescript
async function updateTitle(id: number, title: string) {
  const updated = await apiUpdateTicketTitle(id, title)
  if (currentTicket.value?.id === id) currentTicket.value = updated
  const idx = tickets.value.findIndex(t => t.id === id)
  if (idx !== -1) tickets.value[idx] = updated
}

async function updateBody(id: number, body: string) {
  const updated = await apiUpdateTicketBody(id, body)
  if (currentTicket.value?.id === id) currentTicket.value = updated
}
```

Update the import at the top of the file to include `apiUpdateTicketTitle` and `apiUpdateTicketBody`:

```typescript
import { apiGetTickets, apiGetTicket, apiUpdateTicket, apiApproveTicket, apiRejectTicket, apiCloseTicket, apiReopenTicket, apiUpdateTicketTitle, apiUpdateTicketBody, type TicketFilters } from '@/api/tickets'
```

Update the return statement to include `updateTitle` and `updateBody`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/tickets.ts frontend/src/stores/tickets.ts
git commit -m "feat(frontend): add title and body update API + store actions"
```

---

### Task 4: Install `diff` npm package

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install diff package**

```bash
cd frontend && npm install diff && npm install -D @types/diff
```

- [ ] **Step 2: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): add diff package for unified diff rendering"
```

---

### Task 5: Add title editing UI to TicketDetailView

**Files:**
- Modify: `frontend/src/views/TicketDetailView.vue`

- [ ] **Step 1: Add title editing state and logic**

In the `<script setup>` section, add after the existing refs (after line 54):

```typescript
const editingTitle = ref(false)
const editTitleValue = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)

function startEditTitle() {
  if (!ticket.value) return
  editTitleValue.value = ticket.value.title
  editingTitle.value = true
  nextTick(() => titleInputRef.value?.focus())
}

async function saveTitle() {
  if (!ticket.value || !editTitleValue.value.trim()) return
  try {
    await store.updateTitle(ticket.value.id, editTitleValue.value.trim())
    editingTitle.value = false
    await fetchAuditLogs()
    ui.toast('标题已更新', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  }
}

function cancelEditTitle() {
  editingTitle.value = false
}
```

Add `nextTick` to the import from `vue` on line 2.

- [ ] **Step 2: Replace title h1 with editable version**

Replace the h1 on line 273:

```html
<h1 class="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">{{ ticket.title }}</h1>
```

With:

```html
<div v-if="!editingTitle" class="group flex items-center gap-2">
  <h1 class="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">{{ ticket.title }}</h1>
  <button
    v-if="ticket.authorId === auth.user?.id || auth.isStaff"
    class="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition"
    @click="startEditTitle"
  >
    <Icon icon="lucide:pencil" class="w-4 h-4" />
  </button>
</div>
<div v-else class="flex items-center gap-2">
  <input
    ref="titleInputRef"
    v-model="editTitleValue"
    class="flex-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl bg-transparent border-b-2 border-slate-300 dark:border-slate-600 focus:border-slate-500 dark:focus:border-slate-400 outline-none pb-1"
    @keydown.enter="saveTitle"
    @keydown.escape="cancelEditTitle"
  />
  <BaseButton size="sm" @click="saveTitle">保存</BaseButton>
  <BaseButton size="sm" variant="secondary" @click="cancelEditTitle">取消</BaseButton>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/TicketDetailView.vue
git commit -m "feat(frontend): add inline title editing to ticket detail"
```

---

### Task 6: Add body editing UI to TicketDetailView

**Files:**
- Modify: `frontend/src/views/TicketDetailView.vue`

- [ ] **Step 1: Add body editing state and logic**

In the `<script setup>` section, add after the title editing refs:

```typescript
const editingBody = ref(false)
const editBodyValue = ref('')
const bodyUpload = useMarkdownUpload()

function startEditBody() {
  if (!ticket.value) return
  editBodyValue.value = ticket.value.body
  editingBody.value = true
}

watch(editBodyValue, (val) => {
  bodyUpload.syncPending(val)
})

async function saveBody() {
  if (!ticket.value) return
  try {
    let body = editBodyValue.value
    if (bodyUpload.pendingFiles.value.size > 0) {
      body = await bodyUpload.uploadForComment(body, ticket.value.id)
    }
    await store.updateBody(ticket.value.id, body)
    editingBody.value = false
    await fetchAuditLogs()
    ui.toast('内容已更新', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  }
}

function cancelEditBody() {
  editingBody.value = false
}
```

- [ ] **Step 2: Replace body section with editable version**

Replace the body div (lines 286-288):

```html
<div class="p-6 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur">
  <MarkdownRenderer :content="ticketBody" />
</div>
```

With:

```html
<div class="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur">
  <div v-if="!editingBody">
    <div v-if="ticket.authorId === auth.user?.id || auth.isStaff" class="flex justify-end px-6 pt-4">
      <button
        class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition flex items-center gap-1"
        @click="startEditBody"
      >
        <Icon icon="lucide:pencil" class="w-3 h-3" />
        编辑
      </button>
    </div>
    <div class="p-6">
      <MarkdownRenderer :content="ticketBody" />
    </div>
  </div>
  <div v-else class="p-6 space-y-3">
    <BaseTextarea
      v-model="editBodyValue"
      :rows="12"
      uploadable
      previewable
    />
    <div class="flex justify-end gap-2">
      <BaseButton size="sm" @click="saveBody">保存</BaseButton>
      <BaseButton size="sm" variant="secondary" @click="cancelEditBody">取消</BaseButton>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/TicketDetailView.vue
git commit -m "feat(frontend): add inline body editing to ticket detail"
```

---

### Task 7: Add title_change and body_change timeline rendering

**Files:**
- Modify: `frontend/src/views/TicketDetailView.vue`

- [ ] **Step 1: Add eventLabel entries for new actions**

In `eventLabel()` function, add to the `map` object (after `label_remove`):

```typescript
title_change: '更改了标题',
body_change: '编辑了内容',
```

- [ ] **Step 2: Add eventIcon entries for new actions**

In `eventIcon()` function, add to the `map` object:

```typescript
title_change: 'lucide:type',
body_change: 'lucide:file-text',
```

- [ ] **Step 3: Add diff modal state**

In the `<script setup>` section, add:

```typescript
import { diffLines } from 'diff'

const showDiffModal = ref(false)
const diffOld = ref('')
const diffNew = ref('')

function openDiffModal(item: AuditLog) {
  diffOld.value = item.oldValue || ''
  diffNew.value = item.newValue || ''
  showDiffModal.value = true
}

const diffResult = computed(() => {
  return diffLines(diffOld.value, diffNew.value)
})
```

- [ ] **Step 4: Update audit event template rendering**

Replace the audit event block (lines 312-327):

```html
<!-- Audit event -->
<div v-else class="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
  <Icon
    :icon="eventIcon(item)"
    class="w-3.5 h-3.5 shrink-0"
    :class="item.action === 'status_change' && item.newValue ? statusColor(item.newValue) : ''"
  />
  <span class="font-medium text-slate-600 dark:text-slate-300">{{ item.actor.username }}</span>
  <span>{{ eventLabel(item) }}</span>
  <span v-if="item.action !== 'status_change' && (item.oldValue || item.newValue)" class="flex items-center gap-1">
    <span v-if="item.oldValue" class="line-through opacity-60">{{ item.oldValue }}</span>
    <Icon v-if="item.oldValue && item.newValue" icon="lucide:arrow-right" class="w-3 h-3" />
    <span v-if="item.newValue">{{ item.newValue }}</span>
  </span>
  <span class="text-xs text-slate-400">{{ timeAgo(item.createdAt) }}</span>
</div>
```

With:

```html
<!-- Audit event -->
<div v-else class="py-2 text-sm text-slate-500 dark:text-slate-400">
  <div class="flex items-center gap-2">
    <Icon
      :icon="eventIcon(item)"
      class="w-3.5 h-3.5 shrink-0"
      :class="item.action === 'status_change' && item.newValue ? statusColor(item.newValue) : ''"
    />
    <span class="font-medium text-slate-600 dark:text-slate-300">{{ item.actor.username }}</span>
    <span>{{ eventLabel(item) }}</span>
    <span class="text-xs text-slate-400">{{ timeAgo(item.createdAt) }}</span>
  </div>
  <!-- Title change: inline strikethrough old → new -->
  <div v-if="item.action === 'title_change'" class="ml-5.5 mt-1 flex items-center gap-1.5 text-sm">
    <span class="line-through text-slate-400">{{ item.oldValue }}</span>
    <Icon icon="lucide:arrow-right" class="w-3 h-3 text-slate-400 shrink-0" />
    <span class="text-slate-700 dark:text-slate-200">{{ item.newValue }}</span>
  </div>
  <!-- Body change: clickable link to diff modal -->
  <div v-else-if="item.action === 'body_change'" class="ml-5.5 mt-1">
    <button
      class="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline transition"
      @click="openDiffModal(item)"
    >
      查看变更
    </button>
  </div>
  <!-- Other actions: old → new inline -->
  <div v-else-if="item.action !== 'status_change' && (item.oldValue || item.newValue)" class="ml-5.5 mt-1 flex items-center gap-1">
    <span v-if="item.oldValue" class="line-through opacity-60">{{ item.oldValue }}</span>
    <Icon v-if="item.oldValue && item.newValue" icon="lucide:arrow-right" class="w-3 h-3" />
    <span v-if="item.newValue">{{ item.newValue }}</span>
  </div>
</div>
```

- [ ] **Step 5: Add diff modal to template**

Add before the closing `</div>` of the root element (before the final `</div>`), after the sidebar section:

```html
<!-- Diff Modal -->
<BaseModal v-model="showDiffModal" title="内容变更详情">
  <div class="max-h-[60vh] overflow-y-auto rounded-lg bg-slate-50 dark:bg-slate-950 font-mono text-sm leading-relaxed">
    <div v-for="(part, i) in diffResult" :key="i">
      <div
        v-for="(line, j) in part.value.split('\n').filter((l, k, arr) => !(k === arr.length - 1 && l === ''))"
        :key="j"
        class="px-4 py-0.5"
        :class="{
          'bg-red-500/10 text-red-400': part.removed,
          'bg-green-500/10 text-green-400': part.added,
          'text-slate-500 dark:text-slate-400': !part.removed && !part.added,
        }"
      >
        <span class="inline-block w-4 text-right mr-3 select-none text-slate-400">
          {{ part.removed ? '-' : part.added ? '+' : ' ' }}
        </span>{{ line }}
      </div>
    </div>
  </div>
</BaseModal>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/views/TicketDetailView.vue
git commit -m "feat(frontend): render title_change and body_change in timeline with diff modal"
```

---

### Task 8: Verify end-to-end

- [ ] **Step 1: Start backend and frontend dev servers**

```bash
cd backend && npm run dev &
cd frontend && npm run dev &
```

- [ ] **Step 2: Test title editing**

1. Open a ticket detail page
2. Hover over the title — pencil icon appears
3. Click pencil — title becomes an input field
4. Change the title and press Enter or click "保存"
5. Verify: title updates, audit log shows "更改了标题" with ~~old~~ → new
6. Press Escape or click "取消" to cancel — title reverts

- [ ] **Step 3: Test body editing**

1. On the same ticket, click "编辑" button on the body section
2. Body switches to textarea
3. Modify content and click "保存"
4. Verify: body updates, audit log shows "编辑了内容" with "查看变更" link
5. Click "查看变更" — modal opens with red/green diff

- [ ] **Step 4: Test permissions**

1. Log in as a non-author, non-staff user
2. Verify: no pencil icon on title, no "编辑" button on body

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete title and body change tracking with audit trail"
```

# Ticket ID Refactor: Sequential Integer IDs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace CUID-based ticket IDs with sequential integers starting from 1 (like GitHub Issues), and support `#<number>` auto-linking in ticket body and comments.

**Architecture:** Single-shot refactor across all four layers — database (Prisma/SQLite AUTOINCREMENT), backend (Express routes/services use `number`), frontend (Vue types/stores use `number`, auto-link `#n`), and Minecraft plugin (Java `int`). Old migrations are deleted and regenerated. Only `Ticket.id` changes; other models keep CUID PKs but their FK columns auto-adapt from TEXT to INTEGER.

**Tech Stack:** Prisma + SQLite, Express + TypeScript, Vue 3 + TypeScript, Paper/Folia Java plugin

---

## File Structure

| Layer | Create | Modify |
|---|---|---|
| DB | — | `backend/prisma/schema.prisma` (line 84) |
| DB | — | Delete `backend/prisma/migrations/` dir, regenerate |
| Backend | — | `backend/src/services/ticket.service.ts` |
| Backend | — | `backend/src/services/comment.service.ts` |
| Backend | — | `backend/src/services/audit.service.ts` |
| Backend | — | `backend/src/services/permission.service.ts` |
| Backend | — | `backend/src/services/label.service.ts` |
| Backend | — | `backend/src/services/attachment.service.ts` |
| Backend | — | `backend/src/routes/tickets.ts` |
| Backend | — | `backend/src/routes/comments.ts` |
| Backend | — | `backend/src/routes/audit.ts` |
| Backend | — | `backend/src/routes/mc.ts` |
| Frontend | `frontend/src/composables/useTicketRef.ts` | `frontend/src/types/ticket.ts` |
| Frontend | — | `frontend/src/api/tickets.ts` |
| Frontend | — | `frontend/src/api/comments.ts` |
| Frontend | — | `frontend/src/api/attachments.ts` |
| Frontend | — | `frontend/src/api/labels.ts` |
| Frontend | — | `frontend/src/stores/tickets.ts` |
| Frontend | — | `frontend/src/views/TicketDetailView.vue` |
| Frontend | — | `frontend/src/views/TicketListView.vue` |
| Frontend | — | `frontend/src/components/tickets/TicketAuditLog.vue` |
| Plugin | — | `plugin/src/main/java/ink/neokoni/lighttickets/model/Ticket.java` |
| Plugin | — | `plugin/src/main/java/ink/neokoni/lighttickets/network/ApiClient.java` |
| Plugin | — | `plugin/src/main/java/ink/neokoni/lighttickets/network/WebSocketClient.java` |
| Plugin | — | `plugin/src/main/java/ink/neokoni/lighttickets/command/CommandRegistration.java` |
| Plugin | — | `plugin/src/main/java/ink/neokoni/lighttickets/handler/NotificationHandler.java` |

---

### Task 1: Database — Schema and Migration

**Files:**
- Modify: `backend/prisma/schema.prisma:84`
- Delete: `backend/prisma/migrations/` (whole directory)
- Delete: `backend/prisma/dev.db` (old database file, if exists)

- [ ] **Step 1: Delete old database and migrations**

```bash
rm -rf backend/prisma/migrations
rm -f backend/prisma/dev.db
```

- [ ] **Step 2: Change Ticket.id type in schema**

In `backend/prisma/schema.prisma`, line 84:

```prisma
model Ticket {
  id         Int          @id @default(autoincrement())
  title      String
  body       String
  type       TicketType
  status     TicketStatus @default(open)
  priority   Priority     @default(medium)
  authorId   String       @map("author_id")
  serverId   String?      @map("server_id")
  assigneeId String?      @map("assignee_id")
  createdAt  DateTime     @default(now()) @map("created_at")
  updatedAt  DateTime     @updatedAt @map("updated_at")
  closedAt   DateTime?    @map("closed_at")

  author     User         @relation("author", fields: [authorId], references: [id])
  server     Server?      @relation(fields: [serverId], references: [id])
  assignee   User?        @relation("assignee", fields: [assigneeId], references: [id])
  labels     TicketLabel[]
  comments   Comment[]
  attachments Attachment[]
  auditLogs  AuditLog[]
  permissionRequest PermissionRequest?

  @@map("tickets")
}
```

Only `id` changes from `String @id @default(cuid())` to `Int @id @default(autoincrement())`. All other fields remain identical.

- [ ] **Step 4: Regenerate Prisma migration and client**

```bash
cd backend && npx prisma migrate dev --name init
cd backend && npx prisma generate
```

Expected: creates fresh migration SQL with INTEGER AUTOINCREMENT for tickets.id, all FK columns auto-adapt to INTEGER.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): change ticket id from CUID to auto-increment integer"
```

---

### Task 2: Backend — Service Layer Types

**Files:**
- Modify: `backend/src/services/ticket.service.ts`
- Modify: `backend/src/services/comment.service.ts`
- Modify: `backend/src/services/audit.service.ts`
- Modify: `backend/src/services/permission.service.ts`
- Modify: `backend/src/services/label.service.ts`
- Modify: `backend/src/services/attachment.service.ts`

After `prisma generate`, the Prisma Client types change automatically. Update TypeScript parameter types from `string` to `number`.

- [ ] **Step 1: Fix ticket.service.ts — `getById` and `update` signatures**

In `backend/src/services/ticket.service.ts`:

```typescript
// Line 78: change parameter type
export async function getById(id: number) {
  // ... body unchanged (Prisma Client where: { id } now expects number)
}

// Line 93-98: change parameter types
export async function update(
  id: number,
  userId: string,
  userRole: string,
  data: { status?: TicketStatus; priority?: Priority; assigneeId?: string },
) {
  // ... body unchanged
}
```

No other changes needed in this file — the Prisma Client methods (`findUnique`, `update`, `create`) all accept `number` for `id` after regeneration.

- [ ] **Step 2: Fix comment.service.ts — `create` and `listByTicket` signatures**

In `backend/src/services/comment.service.ts`:

```typescript
// Line 6
export async function create(ticketId: number, authorId: string, body: string, source: CommentSource = 'web') {

// Line 16
export async function listByTicket(ticketId: number) {
```

- [ ] **Step 3: Fix audit.service.ts — `create` and `listByTicket` signatures**

In `backend/src/services/audit.service.ts`:

```typescript
// Line 6
export async function listByTicket(ticketId: number) {

// Line 19-25
export async function create(
  ticketId: number,
  actorId: string,
  action: string,
  oldValue?: string,
  newValue?: string,
) {
```

- [ ] **Step 4: Fix permission.service.ts — `approve`, `reject`, `reportExecution` signatures**

In `backend/src/services/permission.service.ts`:

```typescript
// Line 7
export async function approve(ticketId: number, actorId: string) {

// Line 39
export async function reject(ticketId: number, actorId: string, reason?: string) {

// Line 69
export async function reportExecution(ticketId: number, success: boolean, errorMessage?: string) {
```

- [ ] **Step 5: Fix label.service.ts — `addToTicket` and `removeFromTicket` signatures**

In `backend/src/services/label.service.ts`:

```typescript
// Line 27
export async function addToTicket(ticketId: number, labelId: string) {

// Line 31
export async function removeFromTicket(ticketId: number, labelId: string) {
```

- [ ] **Step 6: Fix attachment.service.ts — `CreateAttachmentInput.ticketId` type**

In `backend/src/services/attachment.service.ts`:

```typescript
interface CreateAttachmentInput {
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  ticketId?: number;   // was: string
  commentId?: string;
}
```

- [ ] **Step 8: Build check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/
git commit -m "feat(backend): change ticketId parameter types from string to number"
```

---

### Task 3: Backend — Route Layer Types

**Files:**
- Modify: `backend/src/routes/tickets.ts`
- Modify: `backend/src/routes/comments.ts`
- Modify: `backend/src/routes/audit.ts`
- Modify: `backend/src/routes/mc.ts`

Express route params are strings. Need to convert to number where ticket IDs are used.

- [ ] **Step 1: Fix tickets.ts — add Zod coerce for route params**

In `backend/src/routes/tickets.ts`:

```typescript
// Replace line 43
router.get('/:id', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (isNaN(ticketId)) throw new ValidationError('无效的议题ID');
  const ticket = await ticketService.getById(ticketId);
  res.json(ticket);
});

// Replace line 47-49
router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (isNaN(ticketId)) throw new ValidationError('无效的议题ID');
  const ticket = await ticketService.update(ticketId, req.user!.userId, req.user!.role, req.body);
  res.json(ticket);
});

// Replace line 52-54
router.post('/:id/approve', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (isNaN(ticketId)) throw new ValidationError('无效的议题ID');
  const ticket = await permissionService.approve(ticketId, req.user!.userId);
  res.json(ticket);
});

// Replace line 57-59
router.post('/:id/reject', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (isNaN(ticketId)) throw new ValidationError('无效的议题ID');
  const ticket = await permissionService.reject(ticketId, req.user!.userId, req.body.reason);
  res.json(ticket);
});

// Replace line 63-67
router.post('/:id/labels', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  const { labelId } = req.body;
  if (!labelId) throw new ValidationError('标签ID不能为空');
  if (isNaN(ticketId)) throw new ValidationError('无效的议题ID');
  await labelService.addToTicket(ticketId, labelId);
  res.status(201).end();
});

// Replace line 70-73
router.delete('/:id/labels/:labelId', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (isNaN(ticketId)) throw new ValidationError('无效的议题ID');
  await labelService.removeFromTicket(ticketId, req.params.labelId);
  res.status(204).end();
});
```

- [ ] **Step 2: Fix comments.ts — convert ticketId from params**

In `backend/src/routes/comments.ts`:

```typescript
// Replace line 13-15
router.get('/', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (isNaN(ticketId)) throw new ValidationError('无效的议题ID');
  const comments = await commentService.listByTicket(ticketId);
  res.json(comments);
});

// Replace line 18-24
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const ticketId = Number(req.params.id);
  if (isNaN(ticketId)) throw new ValidationError('无效的议题ID');
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const comment = await commentService.create(ticketId, req.user!.userId, parsed.data.body);
  res.status(201).json(comment);
});
```

Import `ValidationError` at top:
```typescript
import { ValidationError } from '../utils/errors.js';
```

- [ ] **Step 3: Fix audit.ts — convert ticketId from params**

In `backend/src/routes/audit.ts`:

```typescript
// Replace lines 9-12
router.get('/', async (req: Request, res: Response) => {
  const ticketId = Number(req.params.ticketId);
  if (isNaN(ticketId)) throw new ValidationError('无效的议题ID');
  const logs = await auditService.listByTicket(ticketId);
  res.json(logs);
});
```

Import `ValidationError`:
```typescript
import { ValidationError } from '../utils/errors.js';
```

- [ ] **Step 4: Fix mc.ts — convert ticketId in body and params**

In `backend/src/routes/mc.ts`:

```typescript
// Line 91-100: POST /comments — ticketId comes from body, not params
router.post('/comments', async (req: Request, res: Response) => {
  const { minecraftUuid, ticketId, body } = req.body;
  if (!minecraftUuid || ticketId == null || !body) throw new ValidationError('minecraftUuid, ticketId, and body required');
  const numericId = Number(ticketId);
  if (isNaN(numericId)) throw new ValidationError('无效的议题ID');

  const user = await prisma.user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const comment = await commentService.create(numericId, user.id, body, 'minecraft');
  res.status(201).json(comment);
});

// Line 102-108: POST /permission-executed — ticketId from body
router.post('/permission-executed', async (req: Request, res: Response) => {
  const { ticketId, success, errorMessage } = req.body;
  if (ticketId == null) throw new ValidationError('ticketId required');
  const numericId = Number(ticketId);
  if (isNaN(numericId)) throw new ValidationError('无效的议题ID');

  await permissionService.reportExecution(numericId, success, errorMessage);
  res.json({ ok: true });
});
```

- [ ] **Step 5: Build check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/
git commit -m "feat(backend): accept numeric ticket IDs in route handlers"
```

---

### Task 4: Frontend — Types and API Layer

**Files:**
- Modify: `frontend/src/types/ticket.ts`
- Modify: `frontend/src/api/tickets.ts`
- Modify: `frontend/src/api/comments.ts`
- Modify: `frontend/src/api/attachments.ts`
- Modify: `frontend/src/api/labels.ts`
- Modify: `frontend/src/stores/tickets.ts`

- [ ] **Step 1: Update TypeScript types — `Ticket.id` and all `ticketId` references to `number`**

In `frontend/src/types/ticket.ts`:

```typescript
export interface TicketLabel {
  ticketId: number    // was: string
  labelId: string
  label: Label
}

export interface Comment {
  id: string
  ticketId: number    // was: string
  authorId: string
  body: string
  source: CommentSource
  createdAt: string
  author: { id: string; username: string; minecraftName?: string }
}

export interface PermissionRequest {
  id: string
  ticketId: number    // was: string
  permissionNode?: string
  groupName?: string
  executionStatus: ExecutionStatus
  executedAt?: string
  errorMessage?: string
}

export interface Ticket {
  id: number           // was: string
  title: string
  body: string
  type: TicketType
  status: TicketStatus
  priority: Priority
  authorId: string
  serverId?: string
  assigneeId?: string
  createdAt: string
  updatedAt: string
  closedAt?: string
  author: { id: string; username: string; minecraftName?: string }
  assignee?: { id: string; username: string }
  labels: TicketLabel[]
  server?: { id: string; name: string }
  permissionRequest?: PermissionRequest
  _count?: { comments: number }
}

export interface AuditLog {
  id: string
  ticketId: number    // was: string
  actorId: string
  action: string
  oldValue?: string
  newValue?: string
  createdAt: string
  actor: { id: string; username: string; minecraftName?: string }
}
```

- [ ] **Step 2: Update API functions — change `id`/`ticketId` parameter types to `number`**

In `frontend/src/api/tickets.ts`:

```typescript
export function apiGetTicket(id: number) {
  return apiFetch<Ticket>(`/tickets/${id}`)
}

export function apiUpdateTicket(id: number, data: { status?: TicketStatus; priority?: string; assigneeId?: string }) {
  return apiFetch<Ticket>(`/tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export function apiApproveTicket(id: number) {
  return apiFetch<Ticket>(`/tickets/${id}/approve`, { method: 'POST' })
}

export function apiRejectTicket(id: number, reason?: string) {
  return apiFetch<Ticket>(`/tickets/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  })
}
```

In `frontend/src/api/comments.ts`:

```typescript
export function apiGetComments(ticketId: number) {
  return apiFetch<Comment[]>(`/tickets/${ticketId}/comments`)
}

export function apiCreateComment(ticketId: number, body: string) {
  return apiFetch<Comment>(`/tickets/${ticketId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}
```

In `frontend/src/api/attachments.ts`:

```typescript
export interface Attachment {
  id: string
  ticketId: number       // was: string
  filename: string
  url: string
  mimeType: string
  size: number
  createdAt: string
}

export function apiGetAttachments(ticketId: number) {
  return apiFetch<Attachment[]>(`/tickets/${ticketId}/attachments`)
}

export function apiUploadAttachment(ticketId: number, file: File) {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<Attachment>(`/tickets/${ticketId}/attachments`, {
    method: 'POST',
    body: form,
  })
}

export function apiDeleteAttachment(ticketId: number, attachmentId: string) {
  return apiFetch<void>(`/tickets/${ticketId}/attachments/${attachmentId}`, { method: 'DELETE' })
}
```

In `frontend/src/api/labels.ts`:

```typescript
export function apiAddTicketLabel(ticketId: number, labelId: string) {
  return apiFetch<void>(`/tickets/${ticketId}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labelId }),
  })
}

export function apiRemoveTicketLabel(ticketId: number, labelId: string) {
  return apiFetch<void>(`/tickets/${ticketId}/labels/${labelId}`, { method: 'DELETE' })
}
```

- [ ] **Step 3: Update store — change `id` parameter types to `number`**

In `frontend/src/stores/tickets.ts`:

```typescript
async function fetchDetail(id: number) {
  currentTicket.value = await apiGetTicket(id)
}

async function updateStatus(id: number, status: TicketStatus) {
  const updated = await apiUpdateTicket(id, { status })
  if (currentTicket.value?.id === id) currentTicket.value = updated
  const idx = tickets.value.findIndex(t => t.id === id)
  if (idx !== -1) tickets.value[idx] = updated
}

async function approve(id: number) {
  const updated = await apiApproveTicket(id)
  if (currentTicket.value?.id === id) currentTicket.value = updated
}

async function reject(id: number, reason?: string) {
  const updated = await apiRejectTicket(id, reason)
  if (currentTicket.value?.id === id) currentTicket.value = updated
}
```

The `findIndex` comparison changes from `t.id === id` (was `string === string`) to `t.id === id` (`number === number`). Correct since both are now `number`.

- [ ] **Step 4: Build check**

```bash
cd frontend && npx vue-tsc --noEmit
```

Expected: no type errors (or only pre-existing ones unrelated to ID change).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/ frontend/src/api/ frontend/src/stores/
git commit -m "feat(frontend): change ticket id types from string to number"
```

---

### Task 5: Frontend — View and Component Changes

**Files:**
- Create: `frontend/src/composables/useTicketRef.ts`
- Modify: `frontend/src/views/TicketDetailView.vue`
- Modify: `frontend/src/views/TicketListView.vue`
- Modify: `frontend/src/components/tickets/TicketAuditLog.vue`

- [ ] **Step 1: Create `useTicketRef` composable for auto-linking `#<number>`**

New file `frontend/src/composables/useTicketRef.ts`:

```typescript
const TICKET_REF_RE = /#(\d+)/g

export function renderTicketRefs(text: string): string {
  return text.replace(TICKET_REF_RE, '[$&](/tickets/$1)')
}
```

This converts `#5` to the Markdown link `[#5](/tickets/5)` before passing to the Markdown renderer. The `$&` is the full match (e.g., `#5`), and `$1` is the captured number.

- [ ] **Step 2: Update TicketDetailView.vue — use numeric id and render ticket refs**

In `frontend/src/views/TicketDetailView.vue`:

```typescript
// Line 3: import the composable
import { renderTicketRefs } from '@/composables/useTicketRef'

// Line 38: parse id as number
const id = Number(route.params.id)

// Add computed for processed body
const ticketBody = computed(() => ticket.value ? renderTicketRefs(ticket.value.body) : '')

// Add utility for comments
function commentBody(comment: Comment): string {
  return renderTicketRefs(comment.body)
}
```

Template changes — use the processed content:

```vue
<!-- Line 128: replace :content="ticket.body" with :content="ticketBody" -->
<MarkdownRenderer :content="ticketBody" />

<!-- Line 146: replace :content="comment.body" with :content="commentBody(comment)" -->
<MarkdownRenderer :content="commentBody(comment)" />
```

- [ ] **Step 3: Update TicketListView.vue — no code changes needed**

The list view uses `ticket.id` in template interpolation (`:to="`/tickets/${ticket.id}`"`). Since `ticket.id` is now `number`, this naturally produces `/tickets/1` style URLs. No code changes required.

- [ ] **Step 4: Update TicketAuditLog.vue — change prop type to number**

In `frontend/src/components/tickets/TicketAuditLog.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{
  ticketId: number   // was: string
}>()
```

- [ ] **Step 5: Build check**

```bash
cd frontend && npx vue-tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/composables/useTicketRef.ts frontend/src/views/ frontend/src/components/
git commit -m "feat(frontend): add #<number> auto-link and adapt views to numeric ticket IDs"
```

---

### Task 6: Plugin — Model and Network Layer

**Files:**
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/model/Ticket.java`
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/network/ApiClient.java`
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/network/WebSocketClient.java`
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/command/CommandRegistration.java`
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/handler/NotificationHandler.java`

- [ ] **Step 1: Change Ticket.java — `id` from `String` to `int`**

In `plugin/src/main/java/ink/neokoni/lighttickets/model/Ticket.java`:

```java
public class Ticket {
    private final int id;

    // ...

    public Ticket(int id, String title, String body, String type, String status, String priority, String createdAt) {
        this.id = id;
        // rest unchanged
    }

    public int getId() { return id; }
}
```

- [ ] **Step 2: Change ApiClient.java — JSON parsing from `getAsString()` to `getAsInt()` for ticket id**

In `plugin/src/main/java/ink/neokoni/lighttickets/network/ApiClient.java`:

**getMyTickets (line 67):**
```java
obj.get("id").getAsInt(),   // was: getAsString()
```

**createTicket (line 94):**
```java
obj.get("id").getAsInt(),   // was: getAsString()
```

**addComment (lines 105-116):** `ticketId` parameter changes from `String` to `int`:
```java
public CompletableFuture<Void> addComment(String playerUuid, int ticketId, String body) {
    JsonObject payload = new JsonObject();
    payload.addProperty("minecraftUuid", playerUuid);
    payload.addProperty("ticketId", ticketId);  // was: string, now int in JSON
    payload.addProperty("body", body);
    // ...
}
```

**reportPermissionExecution (lines 133-146):** `ticketId` parameter changes from `String` to `int`:
```java
public CompletableFuture<Void> reportPermissionExecution(int ticketId, boolean success, String errorMessage) {
    JsonObject payload = new JsonObject();
    payload.addProperty("ticketId", ticketId);  // was: string, now int
    payload.addProperty("success", success);
    if (errorMessage != null) {
        payload.addProperty("errorMessage", errorMessage);
    }
    // ...
}
```

- [ ] **Step 3: Change WebSocketClient.java — parse ticketId as int from JSON**

In `plugin/src/main/java/ink/neokoni/lighttickets/network/WebSocketClient.java`:

```java
// Line 57 (permission:approved)
int ticketId = data.getInt("ticketId");     // was: getString

// Line 68 (permission:rejected)
int ticketId = data.getInt("ticketId");     // was: getString

// Line 79 (ticket:status_changed)
int ticketId = data.getInt("ticketId");     // was: getString
```

- [ ] **Step 4: Change NotificationHandler.java — `ticketId` parameter type from `String` to `int`**

In `plugin/src/main/java/ink/neokoni/lighttickets/handler/NotificationHandler.java`:

```java
public void handlePermissionApproved(String playerUuid, int ticketId, String groupName) {
    var message = lang.format("notify-permission-approved",
        "{ticketId}", String.valueOf(ticketId),   // convert int to string for lang format
        "{groupName}", groupName != null ? groupName : "unknown");
    deliver(playerUuid, message);
}

public void handlePermissionRejected(String playerUuid, int ticketId, String reason) {
    var message = lang.format("notify-permission-rejected",
        "{ticketId}", String.valueOf(ticketId),
        "{reason}", reason != null ? reason : "无");
    deliver(playerUuid, message);
}

public void handleStatusChanged(String playerUuid, int ticketId, String newStatus) {
    // ... (same pattern, convert ticketId to String.valueOf(ticketId) in the format call)
    var message = lang.format("notify-ticket-status",
        "{ticketId}", String.valueOf(ticketId),
        "{status}", statusName);
    deliver(playerUuid, message);
}
```

- [ ] **Step 5: Commit**

```bash
git add plugin/
git commit -m "feat(plugin): change ticket id from String to int"
```

---

### Task 7: Plugin — Command Layer

**Files:**
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/command/CommandRegistration.java`

- [ ] **Step 1: Change command argument types and comparisons**

In `plugin/src/main/java/ink/neokoni/lighttickets/command/CommandRegistration.java`:

Import addition at the top:
```java
import com.mojang.brigadier.arguments.IntegerArgumentType;
```

**Command registration (lines 46-57):**
```java
root.then(Commands.literal("ticket")
    .then(Commands.argument("id", IntegerArgumentType.integer(1))  // was: StringArgumentType.word()
        .executes(this::ticketDetail)));

root.then(Commands.literal("comment")
    .then(Commands.argument("id", IntegerArgumentType.integer(1))  // was: StringArgumentType.word()
        .then(Commands.argument("text", StringArgumentType.greedyString())
            .executes(this::comment))));
```

**ticketDetail method (lines 142-178):**
```java
private int ticketDetail(CommandContext<CommandSourceStack> ctx) {
    // ...
    int ticketId = ctx.getArgument("id", Integer.class);  // was: String.class

    api.getMyTickets(uuid)
        .thenAccept(tickets -> {
            plugin.getServer().getGlobalRegionScheduler().run(plugin, t -> {
                Ticket found = tickets.stream()
                    .filter(tk -> tk.getId() == ticketId)  // was: .equals()
                    .findFirst().orElse(null);
                if (found == null) {
                    player.sendMessage(lang.prefixFormat("error-ticket-not-found", "{ticketId}", String.valueOf(ticketId)));
                    return;
                }
                player.sendMessage(lang.prefixFormat("cmd-ticket-header", "{id}", String.valueOf(found.getId())));
                // rest unchanged
            });
        })
    // ...
}
```

**comment method (line 204-226):**
```java
private int comment(CommandContext<CommandSourceStack> ctx) {
    // ...
    int ticketId = ctx.getArgument("id", Integer.class);  // was: String.class
    String text = ctx.getArgument("text", String.class);
    String uuid = player.getUniqueId().toString();

    api.addComment(uuid, ticketId, text)  // was: String, now int
        .thenRun(() -> { /* ... */ })
    // ...
}
```

**tickets method (lines 110-140):** No `ticketId` parsing needed — only `ticket.getId()` usage in template format which returns `int` now. The `lang.format` call at line 127-128 needs `String.valueOf(ticket.getId())` since `{id}` placeholder expects a string:
```java
player.sendMessage(lang.format("cmd-tickets-item",
    "{id}", String.valueOf(ticket.getId()),
    "{title}", ticket.getTitle(),
    "{status}", ticket.getStatusName()));
```

- [ ] **Step 2: Build check**

```bash
cd plugin && ./gradlew compileJava
```

Expected: no compilation errors.

- [ ] **Step 3: Commit**

```bash
git add plugin/
git commit -m "feat(plugin): use IntegerArgumentType for ticket id commands"
```

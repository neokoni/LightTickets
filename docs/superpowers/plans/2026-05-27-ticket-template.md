# Ticket Template System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded ticket types with a YAML-based template system supporting structured forms, Markdown body rendering, and completion hooks that execute Minecraft commands via WebSocket.

**Architecture:** Templates are YAML files on disk read at startup and cached in memory. The backend renders form data to Markdown bodies and emits `hook:execute` WebSocket events on status transitions. The frontend dynamically renders form fields from template definitions. The plugin dispatches hook commands as console.

**Tech Stack:** TypeScript/Express/Prisma (backend), Vue 3 (frontend), Java/Paper API (plugin), js-yaml (YAML parsing)

---

### Task 1: Default Template YAML Files

**Files:**
- Create: `backend/templates/bug_report.yml`
- Create: `backend/templates/permission_request.yml`
- Create: `backend/templates/suggestion.yml`
- Create: `backend/templates/report.yml`

- [ ] **Step 1: Create bug_report.yml**

```yaml
name: "Bug 反馈"
description: "报告游戏中遇到的问题"
title_prefix: "[Bug] "
labels: []
body:
  - type: markdown
    attributes:
      value: |
        感谢你反馈问题！请尽量提供**稳定复现的步骤**。
  - type: textarea
    id: description
    validations:
      required: true
    attributes:
      label: "问题描述"
      placeholder: "清晰描述你遇到的问题..."
  - type: textarea
    id: reproduce
    validations:
      required: true
    attributes:
      label: "复现步骤"
completion_hooks: []
```

- [ ] **Step 2: Create permission_request.yml**

```yaml
name: "权限申请"
description: "申请权限组或特殊节点"
title_prefix: "[权限] "
labels: []
body:
  - type: textarea
    id: reason
    validations:
      required: true
    attributes:
      label: "申请理由"
  - type: input
    id: permission
    validations:
      required: false
    attributes:
      label: "权限节点（选填）"
      placeholder: "如 essentials.fly"
completion_hooks:
  - event: resolved
    commands:
      - "tell {player_name} 你的权限申请 #{ticket_id} 已通过"
  - event: rejected
    commands:
      - "tell {player_name} 你的权限申请 #{ticket_id} 已被拒绝"
```

- [ ] **Step 3: Create suggestion.yml**

```yaml
name: "建议"
description: "提出改进建议"
title_prefix: "[建议] "
labels: []
body:
  - type: textarea
    id: description
    validations:
      required: true
    attributes:
      label: "建议内容"
      placeholder: "描述你的改进想法..."
completion_hooks:
  - event: resolved
    commands:
      - "tell {player_name} 你的建议 #{ticket_id} 已被采纳"
```

- [ ] **Step 4: Create report.yml**

```yaml
name: "举报"
description: "举报违规玩家"
title_prefix: "[举报] "
labels: []
body:
  - type: input
    id: target
    validations:
      required: true
    attributes:
      label: "被举报玩家名"
  - type: textarea
    id: description
    validations:
      required: true
    attributes:
      label: "举报详情"
      placeholder: "描述违规行为，尽量提供证据..."
completion_hooks: []
```

- [ ] **Step 5: Commit**

```bash
git add backend/templates/
git commit -m "feat: add default ticket templates (bug_report, permission_request, suggestion, report)"
```

---

### Task 2: Schema Migration — Remove TicketType, Add template & formData

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Remove TicketType enum and update Ticket model**

In `backend/prisma/schema.prisma`, delete the `TicketType` enum block (lines 16-21) and modify the `Ticket` model:

```diff
-enum TicketType {
-  bug_report
-  permission_request
-  suggestion
-  report
-}

 model Ticket {
   id         Int          @id @default(autoincrement())
   title      String
   body       String
-  type       TicketType
+  template   String
+  formData   String?      @map("form_data")
   status     TicketStatus @default(open)
   ...
 }
```

- [ ] **Step 2: Generate migration and regenerate Prisma client**

```bash
cd backend && npx prisma migrate dev --name remove_ticket_type_add_template
```
Expected: migration file created, Prisma client regenerated successfully.

- [ ] **Step 3: Verify type output**

Run: `cd backend && npx tsc --noEmit`
Expected: type errors will appear for all `type` → `template` references not yet updated. This is expected — they'll be fixed in Task 4.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/
git commit -m "feat: remove TicketType enum, add template and formData fields to Ticket"
```

---

### Task 3: Template Service — Load, Parse, Cache, Render

**Files:**
- Create: `backend/src/services/template.service.ts`
- Modify: `backend/package.json` (add js-yaml dependency)

- [ ] **Step 1: Install js-yaml**

```bash
cd backend && npm install js-yaml && npm install -D @types/js-yaml
```

- [ ] **Step 2: Implement template.service.ts**

```typescript
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface TemplateField {
  type: 'markdown' | 'input' | 'textarea' | 'checkboxes' | 'dropdown';
  id?: string;
  validations?: { required?: boolean };
  attributes: {
    label?: string;
    description?: string;
    placeholder?: string;
    value?: string;
    options?: string[] | { label: string; required?: boolean }[];
  };
}

export interface CompletionHook {
  event: 'resolved' | 'closed' | 'rejected';
  commands: string[];
}

export interface TemplateDefinition {
  name: string;
  description: string;
  title_prefix?: string;
  labels: string[];
  body: TemplateField[];
  completion_hooks: CompletionHook[];
}

export interface TemplateSummary {
  name: string;
  name_i18n: string;
  description: string;
  labels: string[];
}

const templatesDir = path.resolve('templates');
const cache = new Map<string, TemplateDefinition>();

export function loadTemplates(): void {
  cache.clear();
  if (!fs.existsSync(templatesDir)) {
    console.warn('[templates] templates/ directory not found, skipping');
    return;
  }
  const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(templatesDir, file), 'utf-8');
      const def = yaml.load(raw) as TemplateDefinition;
      const name = file.replace(/\.ya?ml$/, '');
      cache.set(name, def);
      console.log(`[templates] loaded: ${name} (${def.name})`);
    } catch (err) {
      console.warn(`[templates] skipping malformed template ${file}:`, (err as Error).message);
    }
  }
}

export function list(): TemplateSummary[] {
  return Array.from(cache.entries()).map(([name, def]) => ({
    name,
    name_i18n: def.name,
    description: def.description,
    labels: def.labels,
  }));
}

export function get(name: string): Omit<TemplateDefinition, 'completion_hooks'> | undefined {
  const def = cache.get(name);
  if (!def) return undefined;
  // Strip hooks — they are server-only config
  return {
    name: def.name,
    description: def.description,
    title_prefix: def.title_prefix,
    labels: def.labels,
    body: def.body,
  };
}

export function getDefinition(name: string): TemplateDefinition | undefined {
  return cache.get(name);
}

export function renderBody(def: TemplateDefinition, formData: Record<string, string>): string {
  const parts: string[] = [];
  for (const field of def.body) {
    if (field.type === 'markdown') {
      parts.push(field.attributes.value || '');
    } else if (field.type === 'checkboxes') {
      const checkedLabels = formData[field.id!]?.split(',').filter(Boolean) || [];
      for (const label of checkedLabels) {
        parts.push(`- [x] ${label.trim()}`);
      }
    } else {
      const label = field.attributes.label || field.id;
      const value = formData[field.id!] || '';
      if (field.type === 'input' || field.type === 'dropdown') {
        parts.push(`**${label}:** ${value}`);
      } else if (field.type === 'textarea') {
        parts.push(`**${label}:**\n\n${value}`);
      }
    }
    parts.push('');
  }

  // Append --- separators between fields
  const body = parts.join('\n---\n\n');
  return body || 'No content provided';
}

export function resolveHooks(def: TemplateDefinition, event: string): string[] {
  return def.completion_hooks
    .filter(h => h.event === event)
    .flatMap(h => h.commands);
}
```

- [ ] **Step 3: Load templates at startup in app.ts**

Modify `backend/src/app.ts`:

```diff
 import 'express-async-errors';
 import express from 'express';
 import cors from 'cors';
 import fs from 'fs';
 import { AppError } from './utils/errors.js';
 import { config } from './config.js';
+import { loadTemplates } from './services/template.service.js';
 import setupRoutes from './routes/setup.js';
 import authRoutes from './routes/auth.js';
 import ticketRoutes from './routes/tickets.js';
 import commentRoutes from './routes/comments.js';
 import labelRoutes from './routes/labels.js';
 import attachmentRoutes from './routes/attachments.js';
 import serverRoutes from './routes/servers.js';
 import mcRoutes from './routes/mc.js';
+import templateRoutes from './routes/templates.js';

 export function createApp() {
   const app = express();

+  loadTemplates();
+
   app.use(cors());
   app.use(express.json());
   ...
+  app.use('/api/templates', templateRoutes);
   app.use('/api/tickets', ticketRoutes);
   ...
```

- [ ] **Step 4: Verify type check**

```bash
cd backend && npx tsc --noEmit
```
Expected: template.service.ts compiles cleanly.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/template.service.ts backend/src/app.ts backend/package.json backend/package-lock.json
git commit -m "feat: add template service — YAML loading, caching, body rendering"
```

---

### Task 4: Template Routes

**Files:**
- Create: `backend/src/routes/templates.ts`

- [ ] **Step 1: Implement routes/templates.ts**

```typescript
import { Router, Request, Response } from 'express';
import { list, get } from '../services/template.service.js';
import { NotFoundError } from '../utils/errors.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(list());
});

router.get('/:name', (req: Request, res: Response) => {
  const template = get(req.params.name);
  if (!template) throw new NotFoundError('模板不存在');
  res.json(template);
});

export default router;
```

- [ ] **Step 2: Verify type check**

```bash
cd backend && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/templates.ts
git commit -m "feat: add template API routes — list and get by name"
```

---

### Task 5: Update Ticket Creation — Service, Routes, MC Route

**Files:**
- Modify: `backend/src/services/ticket.service.ts`
- Modify: `backend/src/routes/tickets.ts`
- Modify: `backend/src/routes/mc.ts`
- Modify: `backend/src/services/permission.service.ts`

- [ ] **Step 1: Update ticket.service.ts — replace type with template, add formData**

```diff
-import { PrismaClient, TicketStatus, TicketType, Priority } from '@prisma/client';
+import { PrismaClient, TicketStatus, Priority } from '@prisma/client';

 interface CreateTicketInput {
   title: string;
   body: string;
-  type: TicketType;
+  template: string;
+  formData?: Record<string, string>;
   priority?: Priority;
   serverId?: string;
   authorId: string;
 }

 export async function create(input: CreateTicketInput) {
   return prisma.ticket.create({
     data: {
       title: input.title,
       body: input.body,
-      type: input.type,
+      template: input.template,
+      formData: input.formData ? JSON.stringify(input.formData) : null,
       priority: input.priority || 'medium',
       authorId: input.authorId,
       serverId: input.serverId,
     },
     include: {
       author: { select: { id: true, username: true, minecraftName: true } },
       labels: { include: { label: true } },
     },
   });
 }
```

In `list()`, replace `if (input.type) where.type = input.type;` with:

```typescript
if (input.type) where.template = input.type; // keep filter param as 'type' for backward compat
```

Wait — in the list function, the input type is `ListTicketsInput` which has `type?: TicketType`. Replace with:

```diff
 interface ListTicketsInput {
   page?: number;
   pageSize?: number;
   status?: TicketStatus;
-  type?: TicketType;
+  type?: string;  // template filter kept as 'type' query param for API compat
   authorId?: string;
   serverId?: string;
   labelId?: string;
   search?: string;
 }
```

```diff
-  if (input.type) where.type = input.type;
+  if (input.type) where.template = input.type;
```

- [ ] **Step 2: Update routes/tickets.ts — create schema and import**

```diff
 import { z } from 'zod';
 import * as ticketService from '../services/ticket.service.js';
 import * as labelService from '../services/label.service.js';
 import * as permissionService from '../services/permission.service.js';
+import { getDefinition, renderBody } from '../services/template.service.js';
 import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
 import { requireRole } from '../middleware/role.js';
 import { ValidationError } from '../utils/errors.js';

 const createSchema = z.object({
   title: z.string().min(1).max(200),
-  body: z.string().min(1),
-  type: z.enum(['bug_report', 'permission_request', 'suggestion', 'report']),
+  template: z.string().min(1),
+  formData: z.record(z.string(), z.string()),
   priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
   serverId: z.string().optional(),
 });

 router.post('/', authMiddleware, async (req: Request, res: Response) => {
   const parsed = createSchema.safeParse(req.body);
   if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

-  const ticket = await ticketService.create({ ...parsed.data, authorId: req.user!.userId });
+  const { template, formData, title: userTitle, ...rest } = parsed.data;
+  const def = getDefinition(template);
+  if (!def) throw new ValidationError('无效的模板');
+
+  const body = renderBody(def, formData);
+  const title = def.title_prefix ? def.title_prefix + userTitle : userTitle;
+
+  const ticket = await ticketService.create({
+    ...rest,
+    title,
+    body,
+    template,
+    formData,
+    authorId: req.user!.userId,
+  });
   res.status(201).json(ticket);
 });
```

- [ ] **Step 3: Update routes/mc.ts — mcTicketSchema**

```diff
 const mcTicketSchema = z.object({
   minecraftUuid: z.string(),
   title: z.string().min(1).max(200),
   body: z.string().min(1),
-  type: z.enum(['bug_report', 'permission_request', 'suggestion', 'report']),
+  template: z.string().min(1),
+  formData: z.record(z.string(), z.string()).optional(),
   context: z.object({
     world: z.string().optional(),
     x: z.number().optional(),
     y: z.number().optional(),
     z: z.number().optional(),
     gameMode: z.string().optional(),
   }).optional(),
 });
```

In the handler, replace `type: parsed.data.type as any` with:

```typescript
const ticket = await ticketService.create({
  title: parsed.data.title,
  body,
  template: parsed.data.template,
  formData: parsed.data.formData || {},
  authorId: user.id,
  serverId: req.server!.id,
});
```

- [ ] **Step 4: Update permission.service.ts — change type check to template check**

```diff
   if (!ticket) throw new NotFoundError('议题不存在');
-  if (ticket.type !== 'permission_request') throw new ValidationError('该议题不是权限申请类型');
+  if (ticket.template !== 'permission_request') throw new ValidationError('该议题不是权限申请类型');
```

Apply in both `approve()` and `reject()`.

- [ ] **Step 5: Verify type check**

```bash
cd backend && npx tsc --noEmit
```
Expected: remaining errors should be from pre-existing Express v5 type issues only.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ticket.service.ts backend/src/routes/tickets.ts backend/src/routes/mc.ts backend/src/services/permission.service.ts
git commit -m "feat: update ticket creation to use templates — render body from formData, validate template existence"
```

---

### Task 6: WebSocket Hook Events on Status Transition

**Files:**
- Modify: `backend/src/socket/events.ts`
- Modify: `backend/src/services/ticket.service.ts`

- [ ] **Step 1: Add emitHookExecute to events.ts**

```diff
+import { getDefinition, resolveHooks } from '../services/template.service.js';
+
 export function emitTicketUpdate(serverId: string, event: string, data: any) {
   const io = getIO();
   if (!io) return;
   io.of('/mc').to(`server:${serverId}`).emit(event, data);
 }

+export function emitHookExecute(serverId: string, ticket: {
+  id: number;
+  title: string;
+  template: string;
+  formData: string | null;
+  author?: { minecraftUuid?: string | null; minecraftName?: string | null } | null;
+}, event: string) {
+  const def = getDefinition(ticket.template);
+  if (!def) return;
+  const commands = resolveHooks(def, event);
+  if (commands.length === 0) return;
+
+  const formData: Record<string, string> = ticket.formData ? JSON.parse(ticket.formData) : {};
+
+  const resolved = commands.map(cmd =>
+    cmd
+      .replace(/\{ticket_id\}/g, String(ticket.id))
+      .replace(/\{ticket_title\}/g, ticket.title)
+      .replace(/\{player_name\}/g, ticket.author?.minecraftName || 'unknown')
+      .replace(/\{player_uuid\}/g, ticket.author?.minecraftUuid || 'unknown')
+      .replace(/\{field\.(\w+)\}/g, (_, id) => formData[id] || '')
+  );
+
+  const io = getIO();
+  if (!io) return;
+  io.of('/mc').to(`server:${serverId}`).emit('hook:execute', {
+    ticketId: ticket.id,
+    event,
+    playerUuid: ticket.author?.minecraftUuid || null,
+    commands: resolved,
+  });
+}
```

- [ ] **Step 2: Call emitHookExecute in ticket.service.ts update()**

In the `update()` function, after the status change block where `emitTicketUpdate` is called, add:

```typescript
if (data.status && data.status !== ticket.status) {
  await auditService.create(id, userId, 'status_change', ticket.status, data.status);
  if (ticket.serverId && ticket.author?.minecraftUuid) {
    emitTicketUpdate(ticket.serverId, 'ticket:status_changed', {
      ticketId: ticket.id,
      playerUuid: ticket.author.minecraftUuid,
      oldStatus: ticket.status,
      newStatus: data.status,
    });
  }
  // Emit completion hooks if template has hooks for this status
  if (ticket.serverId) {
    const updatedTicket = await prisma.ticket.findUnique({
      where: { id },
      include: { author: { select: { minecraftUuid: true, minecraftName: true } } },
    });
    if (updatedTicket) {
      emitHookExecute(ticket.serverId, updatedTicket, data.status);
    }
  }
}
```

Note: add `emitHookExecute` to the import from `'../socket/events.js'`.

- [ ] **Step 3: Verify type check**

```bash
cd backend && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/socket/events.ts backend/src/services/ticket.service.ts
git commit -m "feat: emit hook:execute WebSocket event on ticket status transition"
```

---

### Task 7: Frontend Types, API Client, and Composable

**Files:**
- Modify: `frontend/src/types/ticket.ts`
- Modify: `frontend/src/api/tickets.ts`
- Create: `frontend/src/composables/useTicketForm.ts`

- [ ] **Step 1: Update types/ticket.ts**

Remove the `TicketType` union type and update the `Ticket` interface:

```diff
-export type TicketType = 'bug_report' | 'permission_request' | 'suggestion' | 'report'
 export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'rejected'
 export type Priority = 'low' | 'medium' | 'high' | 'critical'
 export type CommentSource = 'web' | 'minecraft'
 export type ExecutionStatus = 'pending' | 'executed' | 'failed'

 export interface Ticket {
   id: number
   title: string
   body: string
-  type: TicketType
+  template: string
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
```

Add template types:

```typescript
export interface TemplateField {
  type: 'markdown' | 'input' | 'textarea' | 'checkboxes' | 'dropdown'
  id?: string
  validations?: { required?: boolean }
  attributes: {
    label?: string
    description?: string
    placeholder?: string
    value?: string
    options?: (string | { label: string; required?: boolean })[]
  }
}

export interface TemplateDefinition {
  name: string
  name_i18n: string
  description: string
  title_prefix?: string
  labels: string[]
  body: TemplateField[]
}

export interface TemplateSummary {
  name: string
  name_i18n: string
  description: string
  labels: string[]
}
```

- [ ] **Step 2: Update api/tickets.ts**

```diff
-import type { Ticket, TicketStatus, TicketType } from '@/types/ticket'
+import type { Ticket, TicketStatus, TemplateSummary, TemplateDefinition } from '@/types/ticket'
 import type { PaginatedResponse } from '@/types/api'

 export interface TicketFilters {
   page?: number
   pageSize?: number
   status?: TicketStatus
-  type?: TicketType
+  type?: string
   authorId?: string
   serverId?: string
   labelId?: string
   search?: string
 }

-export function apiCreateTicket(data: { title: string; body: string; type: TicketType; priority?: string; serverId?: string }) {
+export function apiCreateTicket(data: { title: string; template: string; formData: Record<string, string>; priority?: string; serverId?: string }) {
   return apiFetch<Ticket>('/tickets', {
     method: 'POST',
     body: JSON.stringify(data),
   })
 }

+export function apiGetTemplates() {
+  return apiFetch<TemplateSummary[]>('/templates')
+}
+
+export function apiGetTemplate(name: string) {
+  return apiFetch<TemplateDefinition>(`/templates/${name}`)
+}
```

- [ ] **Step 3: Create composables/useTicketForm.ts**

```typescript
import { ref, computed } from 'vue'
import type { TemplateSummary, TemplateDefinition, TemplateField } from '@/types/ticket'
import { apiGetTemplates, apiGetTemplate } from '@/api/tickets'

export function useTicketForm() {
  const step = ref<1 | 2 | 3>(1)
  const templates = ref<TemplateSummary[]>([])
  const selectedTemplateName = ref<string | null>(null)
  const selectedTemplate = ref<TemplateDefinition | null>(null)
  const formValues = ref<Record<string, string>>({})
  const title = ref('')
  const loading = ref(false)

  const currentTemplateSummary = computed(() =>
    templates.value.find(t => t.name === selectedTemplateName.value)
  )

  async function fetchTemplates() {
    templates.value = await apiGetTemplates()
  }

  async function selectTemplate(name: string) {
    selectedTemplateName.value = name
    selectedTemplate.value = await apiGetTemplate(name)
    formValues.value = {}
    title.value = selectedTemplate.value.title_prefix || ''
    step.value = 2
  }

  function setFieldValue(fieldId: string, value: string) {
    formValues.value = { ...formValues.value, [fieldId]: value }
  }

  function setCheckboxValue(fieldId: string, label: string, checked: boolean) {
    const current = (formValues.value[fieldId] || '').split(',').filter(Boolean)
    if (checked) {
      current.push(label)
    } else {
      const idx = current.indexOf(label)
      if (idx >= 0) current.splice(idx, 1)
    }
    formValues.value[fieldId] = current.join(',')
  }

  function isFieldValid(field: TemplateField): boolean {
    if (field.type === 'markdown') return true
    if (!field.validations?.required) return true
    const val = formValues.value[field.id!] || ''
    return val.trim().length > 0
  }

  const allFieldsValid = computed(() => {
    if (!selectedTemplate.value) return false
    return selectedTemplate.value.body.every(isFieldValid)
  })

  function goToStep(n: 1 | 2 | 3) {
    step.value = n
  }

  function reset() {
    step.value = 1
    selectedTemplateName.value = null
    selectedTemplate.value = null
    formValues.value = {}
    title.value = ''
  }

  return {
    step,
    templates,
    selectedTemplateName,
    selectedTemplate,
    formValues,
    title,
    loading,
    currentTemplateSummary,
    fetchTemplates,
    selectTemplate,
    setFieldValue,
    setCheckboxValue,
    isFieldValid,
    allFieldsValid,
    goToStep,
    reset,
  }
}
```

- [ ] **Step 4: Verify type check**

```bash
cd frontend && npx vue-tsc --build
```
Expected: errors in TicketCreateView.vue and TicketDetailView.vue (from removed TicketType). These will be fixed in Tasks 8 and 9.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/ticket.ts frontend/src/api/tickets.ts frontend/src/composables/useTicketForm.ts
git commit -m "feat: add frontend types, API, and composable for ticket template system"
```

---

### Task 8: Frontend TicketCreateView Refactor

**Files:**
- Modify: `frontend/src/views/TicketCreateView.vue`

- [ ] **Step 1: Rewrite TicketCreateView.vue script section**

Replace the entire `<script setup>` block:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { apiCreateTicket } from '@/api/tickets'
import { apiUploadAttachment } from '@/api/attachments'
import { useUiStore } from '@/stores/ui'
import { useTicketForm } from '@/composables/useTicketForm'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue'

const router = useRouter()
const ui = useUiStore()
const {
  step,
  templates,
  selectedTemplate,
  selectedTemplateName,
  formValues,
  title,
  allFieldsValid,
  currentTemplateSummary,
  fetchTemplates,
  selectTemplate,
  setFieldValue,
  setCheckboxValue,
  goToStep,
} = useTicketForm()

const files = ref<File[]>([])
const loading = ref(false)
const error = ref('')

onMounted(fetchTemplates)

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    files.value.push(...Array.from(input.files))
  }
  input.value = ''
}

function removeFile(index: number) {
  files.value.splice(index, 1)
}

async function submit() {
  if (!selectedTemplateName.value || !title.value.trim()) return
  error.value = ''
  loading.value = true
  try {
    const ticket = await apiCreateTicket({
      title: title.value.trim(),
      template: selectedTemplateName.value,
      formData: formValues.value,
    })
    if (files.value.length > 0) {
      await Promise.all(files.value.map(file => apiUploadAttachment(ticket.id, file)))
    }
    ui.toast('议题已创建', 'success')
    router.push(`/tickets/${ticket.id}`)
  } catch (e: any) {
    error.value = e.message || '创建失败'
  } finally {
    loading.value = false
  }
}
</script>
```

Also add the `ref` import from 'vue' at the top.

- [ ] **Step 2: Rewrite the template**

```vue
<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <h1 class="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">新建议题</h1>

    <!-- Step 1: Template Picker -->
    <div v-if="step === 1" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <button
        v-for="t in templates"
        :key="t.name"
        @click="selectTemplate(t.name)"
        class="flex items-center gap-3 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/80 dark:hover:bg-slate-800/20 transition text-left"
      >
        <div>
          <div class="font-medium text-slate-900 dark:text-white text-sm">{{ t.name_i18n }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{{ t.description }}</div>
        </div>
      </button>
    </div>

    <!-- Step 2: Template Form -->
    <form v-else-if="step === 2 && selectedTemplate" @submit.prevent="goToStep(3)" class="space-y-4">
      <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <button type="button" @click="goToStep(1)" class="hover:text-slate-700 dark:hover:text-slate-300">
          <Icon icon="lucide:arrow-left" class="w-4 h-4" />
        </button>
        <span>{{ currentTemplateSummary?.name_i18n }}</span>
      </div>

      <div v-for="field in selectedTemplate.body" :key="field.id || field.attributes.label">
        <!-- markdown -->
        <div v-if="field.type === 'markdown'" class="prose prose-sm dark:prose-invert max-w-none text-slate-600 dark:text-slate-400">
          <MarkdownRenderer :source="field.attributes.value || ''" />
        </div>

        <!-- input -->
        <BaseInput
          v-else-if="field.type === 'input'"
          :model-value="formValues[field.id!] || ''"
          @update:model-value="setFieldValue(field.id!, $event)"
          :label="field.attributes.label || ''"
          :placeholder="field.attributes.placeholder"
        />

        <!-- textarea -->
        <BaseTextarea
          v-else-if="field.type === 'textarea'"
          :model-value="formValues[field.id!] || ''"
          @update:model-value="setFieldValue(field.id!, $event)"
          :label="field.attributes.label || ''"
          :placeholder="field.attributes.placeholder"
          :rows="6"
        />

        <!-- checkboxes -->
        <fieldset v-else-if="field.type === 'checkboxes'" class="space-y-2">
          <legend class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            {{ field.attributes.label }}
          </legend>
          <label
            v-for="option in field.attributes.options"
            :key="typeof option === 'string' ? option : option.label"
            class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer"
          >
            <input
              type="checkbox"
              class="rounded border-slate-300 dark:border-slate-600"
              :checked="(formValues[field.id!] || '').split(',').includes(typeof option === 'string' ? option : option.label)"
              @change="setCheckboxValue(field.id!, typeof option === 'string' ? option : option.label, ($event.target as HTMLInputElement).checked)"
            />
            {{ typeof option === 'string' ? option : option.label }}
          </label>
        </fieldset>

        <!-- dropdown -->
        <div v-else-if="field.type === 'dropdown'" class="space-y-1">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {{ field.attributes.label }}
          </label>
          <select
            :value="formValues[field.id!] || ''"
            @change="setFieldValue(field.id!, ($event.target as HTMLSelectElement).value)"
            class="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 transition"
          >
            <option value="" disabled>请选择...</option>
            <option
              v-for="opt in field.attributes.options"
              :key="typeof opt === 'string' ? opt : opt.toString()"
              :value="typeof opt === 'string' ? opt : opt.toString()"
            >
              {{ typeof opt === 'string' ? opt : opt.toString() }}
            </option>
          </select>
        </div>
      </div>

      <div class="flex justify-end">
        <BaseButton filled type="submit" :disabled="!allFieldsValid">下一步</BaseButton>
      </div>
    </form>

    <!-- Step 3: Title + Attachments -->
    <form v-else-if="step === 3" @submit.prevent="submit" class="space-y-4">
      <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <button type="button" @click="goToStep(2)" class="hover:text-slate-700 dark:hover:text-slate-300">
          <Icon icon="lucide:arrow-left" class="w-4 h-4" />
        </button>
        <span>{{ currentTemplateSummary?.name_i18n }}</span>
      </div>

      <BaseInput v-model="title" label="标题" placeholder="简要描述问题" />

      <!-- Attachment upload -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">附件</label>
        <div class="flex items-center gap-2">
          <input
            id="file-upload"
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.zip,.log"
            @change="onFileChange"
            class="hidden"
          />
          <label
            for="file-upload"
            class="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer transition"
          >
            <Icon icon="lucide:paperclip" class="w-4 h-4" />
            上传文件
          </label>
        </div>
        <div v-if="files.length > 0" class="space-y-1">
          <div
            v-for="(file, idx) in files"
            :key="idx"
            class="flex items-center justify-between px-3 py-2 rounded-md bg-slate-50 dark:bg-slate-900/50 border border-slate-200/80 dark:border-slate-800/80 text-sm"
          >
            <div class="flex items-center gap-2 min-w-0">
              <Icon icon="lucide:file" class="w-4 h-4 text-slate-400 shrink-0" />
              <span class="text-slate-700 dark:text-slate-300 truncate">{{ file.name }}</span>
              <span class="text-xs text-slate-400 shrink-0">{{ (file.size / 1024).toFixed(1) }} KB</span>
            </div>
            <button
              type="button"
              @click="removeFile(idx)"
              class="text-slate-400 hover:text-red-500 shrink-0"
            >
              <Icon icon="lucide:x" class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <p v-if="error" class="text-sm text-red-500 dark:text-red-400">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <BaseButton type="button" @click="router.back()">取消</BaseButton>
        <BaseButton filled type="submit" :loading="loading" :disabled="!title.trim()">提交议题</BaseButton>
      </div>
    </form>
  </div>
</template>
```

Note: Add missing imports for `files`, `onFileChange`, `removeFile`, `submit`, `error`, `loading` in the script. These refs already exist in the current file — the plan shows the complete new script section for clarity.

- [ ] **Step 2 (cont): Verify the full script setup block includes all needed refs**

The complete `<script setup>` must include:

```typescript
import { ref, onMounted } from 'vue'
const files = ref<File[]>([])
const loading = ref(false)
const error = ref('')
```

These already existed in the original file and are kept. The `useTicketForm()` composable returns the state management. The `types` array and `selectedType` ref are removed.

- [ ] **Step 3: Verify type check**

```bash
cd frontend && npx vue-tsc --build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/TicketCreateView.vue
git commit -m "feat: refactor ticket create view to use template-driven form"
```

---

### Task 9: Frontend TicketDetailView — Replace Type Label with Template Name

**Files:**
- Modify: `frontend/src/views/TicketDetailView.vue`

- [ ] **Step 1: Remove TicketType import and typeLabels map, add template name resolver**

```diff
-import type { Comment, TicketStatus, TicketType, Priority } from '@/types/ticket'
+import type { Comment, TicketStatus, Priority, TemplateSummary } from '@/types/ticket'
+import { apiGetTemplates } from '@/api/tickets'

-const typeLabels: Record<TicketType, string> = {
-  bug_report: 'Bug 报告',
-  permission_request: '权限申请',
-  suggestion: '建议',
-  report: '举报',
-}
+const templateMap = ref<Record<string, string>>({})

 const priorityLabels: Record<Priority, string> = {
   low: '低',
   medium: '中',
   high: '高',
   critical: '紧急',
 }

+onMounted(async () => {
+  try {
+    const list = await apiGetTemplates()
+    for (const t of list) {
+      templateMap.value[t.name] = t.name_i18n
+    }
+  } catch { /* ignore */ }
+})
+
+function templateName(template: string): string {
+  return templateMap.value[template] || template
+}
```

- [ ] **Step 2: Update template references where ticket.type was used**

In the template section, find where `typeLabels[ticket.type]` is used and replace with `templateName(ticket.template)`.

Find the existing usage (it's in the template displaying ticket info):

```diff
-{{ typeLabels[ticket.type] }}
+{{ templateName(ticket.template) }}
```

The exact line may vary. Search for `typeLabels` in the file and replace accordingly.

- [ ] **Step 3: Verify type check**

```bash
cd frontend && npx vue-tsc --build
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/views/TicketDetailView.vue
git commit -m "feat: replace hardcoded type labels with template name lookup in ticket detail"
```

---

### Task 10: Plugin Updates — Model, API, Commands, GUI, Hook Handler

**Files:**
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/model/Ticket.java`
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/network/ApiClient.java`
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/network/WebSocketClient.java`
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/command/CommandRegistration.java`
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/gui/CreateTicketMenu.java`
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/gui/TicketDetailMenu.java`

- [ ] **Step 1: Update Ticket.java — rename type field to template**

```diff
 public class Ticket {
     private final int id;
     private final String title;
     private final String body;
-    private final String type;
+    private final String template;
     private final String status;
     private final String priority;
     private final String createdAt;

-    public Ticket(int id, String title, String body, String type, String status, String priority, String createdAt) {
+    public Ticket(int id, String title, String body, String template, String status, String priority, String createdAt) {
         this.id = id;
         this.title = title;
         this.body = body;
-        this.type = type;
+        this.template = template;
         this.status = status;
         this.priority = priority;
         this.createdAt = createdAt;
     }

     public int getId() { return id; }
     public String getTitle() { return title; }
     public String getBody() { return body; }
-    public String getType() { return type; }
+    public String getTemplate() { return template; }

-    private static final Map<String, String> TYPE_NAMES = Map.of(
-        "bug_report", "Bug报告",
-        "permission_request", "权限申请",
-        "suggestion", "建议",
-        "report", "举报"
-    );

+    // No longer hardcoded — template names come from backend
     public String getTypeName() {
-        return TYPE_NAMES.getOrDefault(type, type);
+        return template; // fallback to template id; name_i18n resolved by backend
     }
```

- [ ] **Step 2: Update ApiClient.java — type to template in createTicket**

```diff
-public CompletableFuture<Ticket> createTicket(String playerUuid, String title, String body, String type) {
+public CompletableFuture<Ticket> createTicket(String playerUuid, String title, String body, String template) {
     JsonObject payload = new JsonObject();
     payload.addProperty("minecraftUuid", playerUuid);
     payload.addProperty("title", title);
     payload.addProperty("body", body);
-    payload.addProperty("type", type);
+    payload.addProperty("template", template);
```

Also update JSON parsing — `obj.get("type")` → `obj.get("template")`:

In `getMyTickets` and `createTicket` return parsing:

```diff
-obj.has("type") ? obj.get("type").getAsString() : "",
+obj.has("template") ? obj.get("template").getAsString() : "",
```

- [ ] **Step 3: Update CommandRegistration.java**

Change hardcoded `"bug_report"` to use the template name, and update `getTypeName()` call:

```diff
-api.createTicket(uuid, title, "Created via /lt create", "bug_report")
+api.createTicket(uuid, title, "Created via /lt create", "bug_report") // template name unchanged — bug_report still exists as a template
```

```diff
-player.sendMessage(lang.format("cmd-ticket-type", "{type}", found.getTypeName()));
+player.sendMessage(lang.format("cmd-ticket-type", "{type}", found.getTemplate()));
```

- [ ] **Step 4: Update CreateTicketMenu.java**

The hardcoded type buttons still use `"bug_report"`, `"permission_request"`, etc. — these remain valid as template names. No functional change needed, but rename the field from `selectedType` to `selectedTemplate` for clarity:

```diff
-public class CreateTicketMenu extends BaseMenu {
-    private String selectedType = "bug_report";
+public class CreateTicketMenu extends BaseMenu {
+    private String selectedTemplate = "bug_report";
     ...

-    boolean isSelected = selectedType.equals(type);
+    boolean isSelected = selectedTemplate.equals(type);
     ...
-    () -> { selectedType = type; refresh(owner); }
+    () -> { selectedTemplate = type; refresh(owner); }
     ...

-    String selectedType = "bug_report";
+    String selectedTemplate = "bug_report";
     ...
-    bodyBuilder.isEmpty() ? "Created via GUI" : bodyBuilder.toString(), selectedType)
+    bodyBuilder.isEmpty() ? "Created via GUI" : bodyBuilder.toString(), selectedTemplate)
```

- [ ] **Step 5: Update TicketDetailMenu.java**

Change `getTypeName()` call to `getTemplate()`:

```diff
-actions.put(12, new SlotAction(createItem(Material.PAPER, "§7类型: §f" + ticket.getTypeName())));
+actions.put(12, new SlotAction(createItem(Material.PAPER, "§7模板: §f" + ticket.getTemplate())));
```

- [ ] **Step 6: Add hook:execute handler to WebSocketClient.java**

Add a new event listener after the existing `permission:rejected` listener:

```java
socket.on("hook:execute", args -> {
    JsonObject data = (JsonObject) args[0];
    int ticketId = data.get("ticketId").getAsInt();
    JsonArray commands = data.getAsJsonArray("commands");

    plugin.getLogger().info("Executing hooks for ticket #" + ticketId + " (" + commands.size() + " commands)");

    for (JsonElement cmd : commands) {
        String command = cmd.getAsString();
        plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
            plugin.getServer().dispatchCommand(
                plugin.getServer().getConsoleSender(), command));
    }
});
```

Also add required imports at top:

```java
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
```

- [ ] **Step 7: Build the plugin**

```bash
cd plugin && ./gradlew compileJava
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 8: Commit**

```bash
git add plugin/src/main/java/ink/neokoni/lighttickets/model/Ticket.java \
        plugin/src/main/java/ink/neokoni/lighttickets/network/ApiClient.java \
        plugin/src/main/java/ink/neokoni/lighttickets/network/WebSocketClient.java \
        plugin/src/main/java/ink/neokoni/lighttickets/command/CommandRegistration.java \
        plugin/src/main/java/ink/neokoni/lighttickets/gui/CreateTicketMenu.java \
        plugin/src/main/java/ink/neokoni/lighttickets/gui/TicketDetailMenu.java
git commit -m "feat: update plugin for template system — type→template, add hook:execute handler"
```

---

### Validation

After all tasks, run full validation:

```bash
# Backend type check
cd backend && npx tsc --noEmit

# Frontend type check + build
cd frontend && npx vue-tsc --build

# Plugin compile
cd plugin && ./gradlew compileJava
```

All three must pass.

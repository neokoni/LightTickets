# Timeline Merge — Audit Log into Comment Stream

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge audit events from sidebar into the comment stream, creating a unified GitHub Issues-style timeline.

**Architecture:** Single-file change to `TicketDetailView.vue` — fetch both comments and audit logs, merge into one sorted `timeline` array, render comments as before and audit events as compact inline notifications. Remove the sidebar `TicketAuditLog` component usage.

**Tech Stack:** Vue 3 + TypeScript, Iconify icons

---

### Task 1: Merge audit log into comment timeline

**Files:**
- Modify: `frontend/src/views/TicketDetailView.vue`

- [ ] **Step 1: Add audit log fetch and helper functions to script**

Remove the `TicketAuditLog` import (line 17):
```typescript
import TicketAuditLog from '@/components/tickets/TicketAuditLog.vue'
```

Add import for `apiFetch` and `AuditLog` type:
```typescript
import { apiFetch } from '@/api/client'
import type { Comment, AuditLog, TicketStatus, Priority } from '@/types/ticket'
```

Note: `apiFetch` is already imported if the file uses it, check first. The `Comment` type is already imported; add `AuditLog` to the existing import.

Add reactive state and type guard:
```typescript
const auditLogs = ref<AuditLog[]>([])

function isComment(item: Comment | AuditLog): item is Comment {
  return 'body' in item
}
```

Add computed timeline:
```typescript
const timeline = computed<(Comment | AuditLog)[]>(() => {
  const items: (Comment | AuditLog)[] = [
    ...comments.value,
    ...auditLogs.value,
  ]
  items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return items
})
```

Add event rendering helpers:
```typescript
function eventLabel(action: string): string {
  const map: Record<string, string> = {
    status_change: '变更了状态',
    assign: '变更了负责人',
    priority_change: '变更了优先级',
    permission_approved: '审批通过了权限',
    permission_rejected: '审批拒绝了权限',
    label_add: '添加了标签',
    label_remove: '移除了标签',
  }
  return map[action] || action
}

function eventIcon(action: string): string {
  const map: Record<string, string> = {
    status_change: 'lucide:arrow-left-right',
    assign: 'lucide:user-plus',
    priority_change: 'lucide:signal',
    permission_approved: 'lucide:check-check',
    permission_rejected: 'lucide:x-circle',
    label_add: 'lucide:tag',
    label_remove: 'lucide:tag-off',
  }
  return map[action] || 'lucide:dot'
}
```

Add audit log fetch to `onMounted`:
```typescript
async function fetchAuditLogs() {
  try {
    auditLogs.value = await apiFetch<AuditLog[]>(`/tickets/${id}/audit`)
  } catch { /* ignore */ }
}
```

Update `onMounted`:
```typescript
onMounted(async () => {
  fetchTemplateNames()
  await Promise.all([store.fetchDetail(id), fetchComments(), fetchAuditLogs()])
})
```

Update `usePolling` to also refresh audit logs:
```typescript
usePolling(async () => {
  await Promise.all([store.fetchDetail(id), fetchComments(), fetchAuditLogs()])
}, 10000)
```

- [ ] **Step 2: Replace comment list with timeline in template**

Replace the existing comment `v-for` loop (lines 167-181 in current file) with timeline rendering:

```html
          <!-- Timeline -->
          <div v-for="item in timeline" :key="item.id + ('body' in item ? '-comment' : '-audit')">
            <!-- Comment -->
            <div v-if="isComment(item)" class="flex gap-3 mb-4">
              <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
                {{ item.author.username.charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 text-sm">
                  <span class="font-medium text-slate-900 dark:text-white">{{ item.author.username }}</span>
                  <span class="text-slate-400 text-xs">{{ timeAgo(item.createdAt) }}</span>
                  <BaseBadge v-if="item.source === 'minecraft'" color="#4ade80">MC</BaseBadge>
                </div>
                <div class="mt-1 text-sm text-slate-700 dark:text-slate-300">
                  <MarkdownRenderer :content="item.body" />
                </div>
              </div>
            </div>

            <!-- Audit event -->
            <div v-else class="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
              <Icon :icon="eventIcon(item.action)" class="w-3.5 h-3.5 shrink-0" />
              <span class="font-medium text-slate-600 dark:text-slate-300">{{ item.actor.username }}</span>
              <span>{{ eventLabel(item.action) }}</span>
              <span v-if="item.oldValue || item.newValue" class="flex items-center gap-1">
                <span v-if="item.oldValue" class="line-through opacity-60">{{ item.oldValue }}</span>
                <Icon v-if="item.oldValue && item.newValue" icon="lucide:arrow-right" class="w-3 h-3" />
                <span v-if="item.newValue">{{ item.newValue }}</span>
              </span>
              <span class="text-xs text-slate-400">{{ timeAgo(item.createdAt) }}</span>
            </div>
          </div>
```

- [ ] **Step 3: Remove sidebar TicketAuditLog**

Remove from the sidebar:
```html
        <!-- Audit Log -->
        <div class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-2">
          <TicketAuditLog :ticket-id="ticket.id" />
        </div>
```

- [ ] **Step 4: Type check**

Run: `cd /home/neokoni/projects/LightTickets/frontend && npx vue-tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/TicketDetailView.vue
git commit -m "feat: merge audit log into comment timeline"
```

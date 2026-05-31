# Merge Audit Log into Comment Timeline

## Summary

Move audit events from sidebar into the comment stream, creating a unified timeline like GitHub Issues. Comments and events (status changes, assignments, labels, etc.) are merged and sorted chronologically.

## Design

### Data merge

In `TicketDetailView.vue`, fetch both comments and audit logs, merge into a single `timeline` array:

```ts
type TimelineItem = Comment | AuditLog
```

Both types have `createdAt`, so sorting is straightforward:
```ts
timeline.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
```

### Rendering

- **Comments** render as before: avatar circle + author name + body
- **Audit events** render as compact inline notifications: smaller icon + "[actor] [action]" + timestamp, no body card

### Template structure

```
<div v-for="item in timeline" :key="item.id">
  <!-- Comment item -->
  <div v-if="isComment(item)" ...> existing comment markup </div>
  <!-- Audit event -->
  <div v-else class="flex items-center gap-2 text-sm text-slate-500">
    <Icon :icon="eventIcon(item)" class="w-3.5 h-3.5" />
    <span>{{ eventText(item) }}</span>
    <span class="text-xs">{{ timeAgo(item.createdAt) }}</span>
  </div>
</div>
```

### Removals

- Sidebar `TicketAuditLog` component removed
- `TicketAuditLog.vue` component file kept (may be used later), but unused import removed

### Files changed

- `frontend/src/views/TicketDetailView.vue` — merge timeline, add event rendering, remove sidebar audit log

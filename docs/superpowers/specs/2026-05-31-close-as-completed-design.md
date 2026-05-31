# Close as Completed / Re-open for Tickets

## Summary

Add GitHub Issues-style close and re-open functionality to LightTickets. The issue author can close their own issue, admins can "close as completed", and either can re-open. Closing maps to the existing `resolved` status (purple), which represents a completed state.

## Status Model

| Status | Label | Color | Icon | Notes |
|--------|-------|-------|------|-------|
| `open` | 开放 | green | circle-dot | Default on create |
| `in_progress` | 处理中 | yellow | loader | |
| `resolved` | 已解决 / 已完成 | purple | check-circle-2 | Target state for close-as-completed |
| `closed` | 无效 | slate/gray | ban | Unchanged, separate concept |
| `rejected` | 已拒绝 | - | - | Unchanged |

## Permission Rules

| Action | Who | From Status | Target Status |
|--------|-----|-------------|---------------|
| Self-close | Author | `open`, `in_progress` | `resolved` |
| Close as completed | Staff/Admin | `open`, `in_progress` | `resolved` |
| Re-open | Author | `resolved` | `open` |
| Re-open | Staff/Admin | `resolved`, `closed` | `open` |

## Backend Changes

### New endpoints (web API)

- `POST /tickets/:id/close` — auth, no role restriction. Author or staff can call. Sets status to `resolved`, records `closedAt`, audit log.
- `POST /tickets/:id/reopen` — auth. Author can reopen own `resolved` tickets; staff can reopen any `resolved`/`closed` tickets. Sets status to `open`, clears `closedAt`, audit log.

### New endpoints (MC API)

- `POST /api/mc/tickets/:id/close` — server-auth. Player closes own ticket via game.
- `POST /api/mc/tickets/:id/reopen` — server-auth. Player reopens own ticket via game.

### Service

- `ticket.service.ts`: Add `closeTicket()` and `reopenTicket()` methods, extracted from the existing `update()` with clear permission checks.
- Emit Socket.IO events (`ticket:status_changed`, `hook:execute`) on close/reopen, same as current status change flow.

## Frontend Changes

### API layer (`api/tickets.ts`)

- `apiCloseTicket(id)` → POST `/tickets/{id}/close`
- `apiReopenTicket(id)` → POST `/tickets/{id}/reopen`

### Store (`stores/tickets.ts`)

- `closeTicket(id)` → calls `apiCloseTicket`, updates local state
- `reopenTicket(id)` → calls `apiReopenTicket`, updates local state

### TicketDetailView.vue

Sidebar status section additions:
- **Author + `open`/`in_progress`**: "关闭议题" button
- **Staff + `open`/`in_progress`**: "已完成关闭" button (close as completed)
- **Author + `resolved`**: "重新打开" button
- **Staff + `resolved`/`closed`**: "重新打开" button

### Type changes

No new status values needed — reuses existing `TicketStatus` type.

## Plugin Changes

### ApiClient.java

- `closeTicket(String playerUuid, int ticketId)` → POST `/api/mc/tickets/{id}/close`
- `reopenTicket(String playerUuid, int ticketId)` → POST `/api/mc/tickets/{id}/reopen`

### TicketDetailMenu.java

- Add "关闭议题" slot button when ticket is `open`/`in_progress` (player is the author or has staff perms)
- Add "重新打开" slot button when ticket is `resolved`/`closed`
- Opens chat input for confirmation, then calls API

### lang.yml

- `cmd-close-success`: "议题 #{ticketId} 已关闭"
- `cmd-reopen-success`: "议题 #{ticketId} 已重新打开"
- `cmd-close-confirm`: "确认关闭议题 #{ticketId}？在聊天框输入 y 确认"
- `cmd-reopen-confirm`: "确认重新打开议题 #{ticketId}？在聊天框输入 y 确认"

### lang.yml translations

- Change `status-resolved` from "已解决" to "已解决" (keep, but also used for closed-as-completed display)
- `status-closed` stays "已关闭" (for "无效" state)

## Event Emission

Both close and reopen trigger the same Socket.IO events as existing status changes:
- `ticket:status_changed` → WebSocket notification to player
- `hook:execute` → template completion hooks (only on close, not reopen)

## Not Affected

- TicketListView.vue — `resolved` is already displayed, no changes needed
- MainMenu.java — `resolved` is already handled with ENCHANTED_BOOK material
- Audit log — already handles `status_change` actions
- Prisma schema — no schema changes needed, reuses existing `TicketStatus`

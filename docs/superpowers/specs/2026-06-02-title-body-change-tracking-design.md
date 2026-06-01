# Title & Body Change Tracking Design

## Overview

Add the ability to edit ticket title and body on the detail view, with all changes tracked in the audit log timeline. Title changes render inline (strikethrough old → arrow → new). Body changes show a summary line that opens a unified inline diff modal on click.

## Backend

### New Endpoint: `PATCH /api/tickets/:id/title`

- Accepts `{ title: string }`
- Permission: author or staff (same as body edit)
- Creates audit log: `action: "title_change"`, `oldValue`, `newValue`
- Returns updated ticket

### Modify: `PATCH /api/tickets/:id/body`

- Add audit log creation: `action: "body_change"`, `oldValue: oldBody`, `newValue: newBody`
- Permission unchanged: author or staff

### Audit Log Actions

| Action | oldValue | newValue |
|---|---|---|
| `title_change` | old title string | new title string |
| `body_change` | old body (full markdown) | new body (full markdown) |

## Frontend

### Title Editing

- Click title h1 → inline edit mode: input field + save/cancel buttons
- On save: call `PATCH /api/tickets/:id/title`, update local state, append audit log
- On cancel or Escape key: revert to display mode

### Body Editing

- "Edit" button on body section header (visible to author/staff)
- Click → textarea (markdown) replaces rendered body + save/cancel buttons
- On save: call `PATCH /api/tickets/:id/body`, update local state, append audit log
- Image upload support via existing `useMarkdownUpload` composable

### Timeline: `title_change`

Renders as a single inline line in the timeline:

```
<actor> 更改了标题  <time>
~~old title~~ → new title
```

- Old title: `line-through` decoration, `text-slate-400`
- Arrow: `→` with `text-slate-400`
- New title: `text-slate-200`

### Timeline: `body_change`

Renders as a clickable summary line:

```
<actor> 编辑了内容  <time>
[点击查看变更] (link)
```

Click opens a `BaseModal` with unified inline diff:

- Uses `diff` npm package (`diffLines`) to compute diff from old/new values stored in audit log
- Deletions: red background (`bg-red-500/10 text-red-400`) with `-` prefix
- Additions: green background (`bg-green-500/10 text-green-400`) with `+` prefix
- Unchanged lines: normal text, dimmed slightly
- Monospace font, scrollable container

### Dependencies

- `diff` npm package (frontend) for computing unified diffs client-side

## Files to Modify

### Backend
- `backend/src/routes/tickets.ts` — add title endpoint, modify body endpoint
- `backend/src/services/ticket.service.ts` — add `updateTitle()`, modify `updateBody()` to create audit log

### Frontend
- `frontend/src/api/tickets.ts` — add `apiUpdateTicketTitle()`
- `frontend/src/stores/tickets.ts` — add `updateTitle()` action
- `frontend/src/views/TicketDetailView.vue` — title edit UI, body edit UI, timeline rendering for new actions, diff modal
- `frontend/src/types/ticket.ts` — no changes needed (AuditLog type already generic)
- `frontend/package.json` — add `diff` dependency

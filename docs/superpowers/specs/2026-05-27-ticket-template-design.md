# Ticket Template System Design

## Overview

Replace hardcoded ticket types (`bug_report`, `permission_request`, `suggestion`, `report`) with a YAML-based template system inspired by GitHub Issue Templates. Templates define structured forms that render dynamically on the frontend and serialize to Markdown bodies. Completion hooks allow templates to define Minecraft commands that execute when a ticket reaches a certain status.

## Template File Format

Templates are YAML files stored in `backend/templates/`. Each file is one template. The filename (without `.yml`) is the template identifier.

```yaml
# backend/templates/bug_report.yml
name: "Bug 反馈"
description: "报告游戏中遇到的问题"
title_prefix: "[Bug] "
labels: []
body:
  - type: markdown
    attributes:
      value: |
        感谢你反馈问题！请尽量提供**稳定复现的步骤**。

  - type: input
    id: version
    validations:
      required: true
    attributes:
      label: "游戏版本"
      placeholder: "如 1.21.1"

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

  - type: checkboxes
    id: checklist
    attributes:
      label: "提交前确认"
      options:
        - label: "我确认此问题尚未被反馈"
          required: true

  - type: dropdown
    id: severity
    validations:
      required: true
    attributes:
      label: "严重程度"
      options:
        - "低 - 仅影响外观"
        - "中 - 功能受损但有替代方案"
        - "高 - 严重影响游戏体验"
        - "紧急 - 服务器崩溃/数据丢失"

completion_hooks:
  - event: resolved
    commands:
      - "tell {player_name} 你反馈的 #{ticket_id} 已解决"
      - "give {player_name} diamond 1"
  - event: closed
    commands:
      - "tell {player_name} 议题 #{ticket_id} 已关闭"
  - event: rejected
    commands:
      - "tell {player_name} 你的权限申请 #{ticket_id} 已被拒绝"
```

### Field Types

| Type | Description | Validation |
|------|-------------|------------|
| `markdown` | Display-only rendered Markdown | None |
| `input` | Single-line text input | `required` |
| `textarea` | Multi-line text input | `required` |
| `checkboxes` | Multiple checkbox options | `required` (min 1 checked) |
| `dropdown` | Single-select from options | `required` |

### Completion Hooks

Each hook has an `event` (one of `resolved`, `closed`, `rejected`) and a list of `commands`. Commands support placeholders:

| Placeholder | Source |
|-------------|--------|
| `{player_name}` | Ticket author's Minecraft name |
| `{player_uuid}` | Ticket author's Minecraft UUID |
| `{ticket_id}` | Ticket number |
| `{ticket_title}` | Ticket title |
| `{field.<id>}` | Value of a form field (e.g., `{field.version}`) |

Commands are executed as console (i.e., with full server privileges).

### Default Templates

The four current ticket types become default YAML templates shipped in the repo:

- `backend/templates/bug_report.yml`
- `backend/templates/permission_request.yml`
- `backend/templates/suggestion.yml`
- `backend/templates/report.yml`

## Schema Changes

Remove `TicketType` enum from Prisma schema. Add `template` and `formData` fields to `Ticket`:

```prisma
model Ticket {
  // ... existing fields ...
  type     TicketType   // REMOVED
  template String       // ADDED - template filename without .yml, e.g. "bug_report"
  formData String?      // ADDED - JSON string of form answers, for hook placeholder resolution
  // ... rest unchanged
}
```

`formData` stores the raw `Record<string, string>` as a JSON string so `{field.<id>}` placeholders in completion hooks can be resolved at any time.

All existing `type` references in services, routes, and API contracts are replaced by `template`.

## Backend

### Template Service (`backend/src/services/template.service.ts`)

- On startup, reads all `.yml` files from `backend/templates/` directory
- Malformed YAML files are skipped with a console warning; valid templates are cached in memory
- Templates are re-read only on server restart (hot-reload out of scope)
- `list()` — returns all templates (name, description, labels) for the creation picker UI
- `get(name)` — returns full template with all field definitions (completion_hooks stripped)
- `renderBody(templateDef, formData: Record<string, string>)` — converts form answers to Markdown

### Body Rendering

Each field type renders as:

```
**<label>**

<value>

---
```

- `markdown` fields: rendered as-is (no label, just the markdown content)
- `input` fields: `**Label:** value`
- `textarea` fields: `**Label:**\n\nvalue`
- `checkboxes`: `- [x] option labels` per checked option
- `dropdown`: `**Label:** selected option`

### API Endpoints

**`GET /api/templates`** — list all available templates (public)

Response: `[{ name: "bug_report", name_i18n: "Bug 反馈", description: "...", labels: [] }, ...]`

**`GET /api/templates/:name`** — get full template with fields (public)

Response: full YAML body + completion_hooks stripped (hooks are server-only config, not exposed to frontend)

**`POST /api/tickets`** — updated schema:

```ts
const createSchema = z.object({
  title: z.string().min(1).max(200),
  template: z.string().min(1),
  formData: z.record(z.string(), z.string()),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  serverId: z.string().optional(),
});
```

The route handler calls `templateService.renderBody(template, formData)` to generate `body`, and stores `formData` as JSON on the ticket. If `title_prefix` is set on the template, it's prepended to the user's title.

The plugin MC route `POST /api/mc/tickets` is also updated: the `mcTicketSchema` replaces `type` with `template`, and the handler passes `formData` (synthesized from `body` as a single-textarea-field equivalent for backward compatibility).

### WebSocket Hook Events

When `ticketService.update()` changes a ticket's status and the template defines hooks for that status, a `hook:execute` event is emitted. The backend resolves ALL placeholders before emitting, so the plugin only needs to dispatch the fully-resolved commands.

Backend placeholder resolution uses:
- `ticket.id` → `{ticket_id}`
- `ticket.title` → `{ticket_title}`
- `ticket.author.minecraftName` → `{player_name}`
- `ticket.author.minecraftUuid` → `{player_uuid}`
- `JSON.parse(ticket.formData)[fieldId]` → `{field.<id>}`

```ts
// Emitted to the ticket's server namespace
{
  ticketId: number,
  event: "resolved" | "closed" | "rejected",
  playerUuid: string,
  commands: string[]  // fully resolved, ready to dispatch
}
```

## Frontend

### TicketCreateView.vue Refactor

Three-step flow:

**Step 1 — Template Picker:** Card grid from `GET /api/templates`. Replaces the hardcoded `types` array.

**Step 2 — Form Fields:** Dynamic form rendering from template field definitions. Each field type maps to a Vue component:
- `markdown` → rendered Markdown block (using `marked` library)
- `input` → `BaseInput`
- `textarea` → `BaseTextarea`
- `checkboxes` → custom checkbox list
- `dropdown` → native `<select>`

Validation: required fields must be filled before proceeding.

**Step 3 — Title + Attachments:** Title input (pre-filled with `title_prefix`), file upload (existing functionality). The body is auto-generated from Step 2 form data. On submit:

```ts
await apiCreateTicket({
  title: title.value,
  template: selectedTemplate.value,
  formData: formState.value,  // { "version": "1.21.1", "description": "...", ... }
})
```

### New Composable: `useTicketForm.ts`

Handles form state across the multi-step flow: template selection, field values, validation state, serialization.

### API Client Changes

- `apiGetTemplates()` — GET /api/templates
- `apiGetTemplate(name)` — GET /api/templates/:name
- `apiCreateTicket()` — updated payload shape (adds `template` + `formData`)

## Plugin

### WebSocket Handler

New event listener for `hook:execute`. Commands arrive fully resolved, so the plugin only dispatches them:

```java
socket.on("hook:execute", args -> {
    JsonObject data = ...
    int ticketId = data.get("ticketId").getAsInt();
    JsonArray commands = data.getAsJsonArray("commands");

    for (JsonElement cmd : commands) {
        String command = cmd.getAsString();
        plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), command));
    }
});
```

## Key Design Decisions

1. **Templates as YAML files** — no admin UI needed, version-controlled, easy to seed defaults
2. **Flat Markdown body rendering** — predictable output, no template-specific body configuration needed
3. **WebSocket for hook execution** — reuses existing event channel, no polling
4. **Field placeholders resolved by backend** — backend has access to form data; player/ticket placeholders resolved by plugin since it has the live player context

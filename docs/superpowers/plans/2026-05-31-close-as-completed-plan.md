# Close as Completed / Re-open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GitHub Issues-style close (self-close for authors, close-as-completed for staff) and re-open functionality across backend, frontend, and plugin.

**Architecture:** Two new backend endpoints (`POST /tickets/:id/close`, `POST /tickets/:id/reopen`) with permission checks in `ticket.service.ts`. Frontend adds buttons in TicketDetailView sidebar. Plugin adds corresponding slots in TicketDetailMenu. Reuses existing `resolved` status for close-as-completed state.

**Tech Stack:** Express + Prisma/SQLite (backend), Vue 3 + TypeScript (frontend), Java Paper plugin with Gradle

---

### Task 1: Backend service — closeTicket() and reopenTicket()

**Files:**
- Modify: `backend/src/services/ticket.service.ts` (after line 168)

- [ ] **Step 1: Add closeTicket() method**

Append after the existing `update()` function:

```typescript
export async function closeTicket(id: number, userId: string, userRole: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, minecraftUuid: true, minecraftName: true } },
      server: { select: { id: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');
  if (ticket.status !== 'open' && ticket.status !== 'in_progress') {
    throw new ForbiddenError('只有开放或处理中的议题可以关闭');
  }

  await prisma.ticket.update({
    where: { id },
    data: { status: 'resolved', closedAt: new Date() },
  });

  await auditService.create(id, userId, 'status_change', ticket.status, 'resolved');

  if (ticket.serverId && ticket.author?.minecraftUuid) {
    emitTicketUpdate(ticket.serverId, 'ticket:status_changed', {
      ticketId: ticket.id,
      playerUuid: ticket.author.minecraftUuid,
      oldStatus: ticket.status,
      newStatus: 'resolved',
    });
  }

  if (ticket.serverId) {
    const updatedTicket = await prisma.ticket.findUnique({
      where: { id },
      include: { author: { select: { minecraftUuid: true, minecraftName: true } } },
    });
    if (updatedTicket) {
      emitHookExecute(ticket.serverId, updatedTicket, 'resolved');
    }
  }

  return getById(id);
}
```

- [ ] **Step 2: Add reopenTicket() method**

Append after `closeTicket()`:

```typescript
export async function reopenTicket(id: number, userId: string, userRole: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      author: { select: { id: true, minecraftUuid: true, minecraftName: true } },
      server: { select: { id: true } },
    },
  });
  if (!ticket) throw new NotFoundError('议题不存在');

  const isAuthor = ticket.authorId === userId;
  const isStaff = userRole === 'staff' || userRole === 'admin';

  if (!isAuthor && !isStaff) throw new ForbiddenError('无权操作此议题');
  if (ticket.status !== 'resolved' && !(ticket.status === 'closed' && isStaff)) {
    throw new ForbiddenError('只有已解决的议题可以重新打开');
  }

  await prisma.ticket.update({
    where: { id },
    data: { status: 'open', closedAt: null },
  });

  await auditService.create(id, userId, 'status_change', ticket.status, 'open');

  if (ticket.serverId && ticket.author?.minecraftUuid) {
    emitTicketUpdate(ticket.serverId, 'ticket:status_changed', {
      ticketId: ticket.id,
      playerUuid: ticket.author.minecraftUuid,
      oldStatus: ticket.status,
      newStatus: 'open',
    });
  }

  return getById(id);
}
```

- [ ] **Step 3: Verify imports include ForbiddenError**

At the top of `ticket.service.ts`, ensure `ForbiddenError` is imported:
```typescript
import { NotFoundError, ForbiddenError } from '../utils/errors.js';
```

- [ ] **Step 4: Run existing tests to confirm no regression**

```bash
cd backend && npx vitest run
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/ticket.service.ts
git commit -m "feat: add closeTicket and reopenTicket service methods"
```

---

### Task 2: Backend routes — close and reopen web API endpoints

**Files:**
- Modify: `backend/src/routes/tickets.ts` (after line 71)

- [ ] **Step 1: Add close route before the approve route**

```typescript
router.post('/:id/close', authMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.closeTicket(parseId(req.params.id), req.user!.userId, req.user!.role);
  res.json(ticket);
});
```

- [ ] **Step 2: Add reopen route**

```typescript
router.post('/:id/reopen', authMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.reopenTicket(parseId(req.params.id), req.user!.userId, req.user!.role);
  res.json(ticket);
});
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/tickets.ts
git commit -m "feat: add POST /tickets/:id/close and POST /tickets/:id/reopen routes"
```

---

### Task 3: Backend MC routes — close and reopen for Minecraft players

**Files:**
- Modify: `backend/src/routes/mc.ts` (after line 102)

- [ ] **Step 1: Add MC close endpoint**

```typescript
router.post('/tickets/:id/close', async (req: Request, res: Response) => {
  const { minecraftUuid } = req.body;
  if (!minecraftUuid) throw new ValidationError('minecraftUuid required');

  const user = await prisma.user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const ticket = await ticketService.closeTicket(Number(req.params.id), user.id, user.role);
  res.json(ticket);
});
```

- [ ] **Step 2: Add MC reopen endpoint**

```typescript
router.post('/tickets/:id/reopen', async (req: Request, res: Response) => {
  const { minecraftUuid } = req.body;
  if (!minecraftUuid) throw new ValidationError('minecraftUuid required');

  const user = await prisma.user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const ticket = await ticketService.reopenTicket(Number(req.params.id), user.id, user.role);
  res.json(ticket);
});
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/mc.ts
git commit -m "feat: add MC API close and reopen endpoints"
```

---

### Task 4: Frontend API and store — close/reopen functions

**Files:**
- Modify: `frontend/src/api/tickets.ts`
- Modify: `frontend/src/stores/tickets.ts`

- [ ] **Step 1: Add apiCloseTicket and apiReopenTicket to api/tickets.ts**

Append after `apiRejectTicket`:

```typescript
export function apiCloseTicket(id: number) {
  return apiFetch<Ticket>(`/tickets/${id}/close`, { method: 'POST' })
}

export function apiReopenTicket(id: number) {
  return apiFetch<Ticket>(`/tickets/${id}/reopen`, { method: 'POST' })
}
```

- [ ] **Step 2: Add closeTicket and reopenTicket to stores/tickets.ts**

Append after the `reject` method:

```typescript
async function closeTicket(id: number) {
  const updated = await apiCloseTicket(id)
  if (currentTicket.value?.id === id) currentTicket.value = updated
  const idx = tickets.value.findIndex(t => t.id === id)
  if (idx !== -1) tickets.value[idx] = updated
}

async function reopenTicket(id: number) {
  const updated = await apiReopenTicket(id)
  if (currentTicket.value?.id === id) currentTicket.value = updated
  const idx = tickets.value.findIndex(t => t.id === id)
  if (idx !== -1) tickets.value[idx] = updated
}
```

Update the return statement to include the new functions:
```typescript
return { tickets, total, currentTicket, loading, filters, fetchList, fetchDetail, updateStatus, approve, reject, closeTicket, reopenTicket, setFilter }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/tickets.ts frontend/src/stores/tickets.ts
git commit -m "feat: add frontend API and store methods for close/reopen"
```

---

### Task 5: Frontend UI — close/reopen buttons in TicketDetailView

**Files:**
- Modify: `frontend/src/views/TicketDetailView.vue`

- [ ] **Step 1: Add close/reopen buttons in the status sidebar section**

Replace the staff-only status action section (lines 197-207) with buttons for both staff and author:

```html
          <!-- Actions -->
          <div v-if="auth.isAuthenticated" class="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <!-- Author close (self-close) -->
            <BaseButton
              v-if="ticket.authorId === auth.user?.id && (ticket.status === 'open' || ticket.status === 'in_progress')"
              size="sm"
              icon="lucide:check-circle-2"
              @click="closeTicket"
            >
              关闭议题
            </BaseButton>
            <!-- Staff close as completed -->
            <BaseButton
              v-if="auth.isStaff && (ticket.status === 'open' || ticket.status === 'in_progress') && ticket.authorId !== auth.user?.id"
              size="sm"
              icon="lucide:check-circle-2"
              @click="closeTicket"
            >
              已完成关闭
            </BaseButton>
            <!-- Author reopen -->
            <BaseButton
              v-if="ticket.authorId === auth.user?.id && ticket.status === 'resolved'"
              size="sm"
              icon="lucide:rotate-ccw"
              @click="reopenTicket"
            >
              重新打开
            </BaseButton>
            <!-- Staff reopen (resolved or closed) -->
            <BaseButton
              v-if="auth.isStaff && (ticket.status === 'resolved' || ticket.status === 'closed')"
              size="sm"
              icon="lucide:rotate-ccw"
              @click="reopenTicket"
            >
              重新打开
            </BaseButton>
          </div>
```

- [ ] **Step 2: Add closeTicket and reopenTicket handler methods**

Add to the `<script>` section after the existing action methods (after line 108):

```typescript
async function closeTicket() {
  try {
    await store.closeTicket(id)
    ui.toast('议题已关闭', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  }
}

async function reopenTicket() {
  try {
    await store.reopenTicket(id)
    ui.toast('议题已重新打开', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/TicketDetailView.vue
git commit -m "feat: add close and reopen buttons to ticket detail view"
```

---

### Task 6: Plugin ApiClient — close/reopen HTTP methods

**Files:**
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/network/ApiClient.java`

- [ ] **Step 1: Add closeTicket and reopenTicket methods**

Append before the closing brace of the class:

```java
public CompletableFuture<Void> closeTicket(String playerUuid, int ticketId) {
    JsonObject payload = new JsonObject();
    payload.addProperty("minecraftUuid", playerUuid);

    Request request = request("/api/mc/tickets/" + ticketId + "/close")
        .post(RequestBody.create(payload.toString(), MediaType.parse("application/json")))
        .build();

    return executeAsync(request).thenApply(v -> null);
}

public CompletableFuture<Void> reopenTicket(String playerUuid, int ticketId) {
    JsonObject payload = new JsonObject();
    payload.addProperty("minecraftUuid", playerUuid);

    Request request = request("/api/mc/tickets/" + ticketId + "/reopen")
        .post(RequestBody.create(payload.toString(), MediaType.parse("application/json")))
        .build();

    return executeAsync(request).thenApply(v -> null);
}
```

- [ ] **Step 2: Commit**

```bash
git add plugin/src/main/java/ink/neokoni/lighttickets/network/ApiClient.java
git commit -m "feat: add closeTicket and reopenTicket methods to ApiClient"
```

---

### Task 7: Plugin TicketDetailMenu — close/reopen GUI buttons

**Files:**
- Modify: `plugin/src/main/java/ink/neokoni/lighttickets/gui/TicketDetailMenu.java`

- [ ] **Step 1: Add close and reopen slot buttons**

Add close action button (slot 14, first empty slot, shift other slots if needed — the current layout uses 10-13 and 19+ for body, 31 for comment, 35 for back). Let's use slot 15 for close and 24 for reopen. Add these after the comment button setup (after line 57):

```java
// Close ticket (slot 33)
boolean canClose = ticket.getStatus().equals("open") || ticket.getStatus().equals("in_progress");
if (canClose) {
    actions.put(33, new SlotAction(
        createItem(Material.LIME_DYE, "§a关闭议题"),
        () -> {
            player.closeInventory();
            player.sendMessage(lang.prefixRaw("§e确认关闭议题 #" + ticket.getId() + "？在聊天框输入 y 确认"));
            registerConfirmInput(player, ticket.getId(), "close", api);
        }));
}

// Reopen ticket (slot 33, same slot since mutually exclusive)
boolean canReopen = ticket.getStatus().equals("resolved") || ticket.getStatus().equals("closed");
if (canReopen) {
    actions.put(33, new SlotAction(
        createItem(Material.ORANGE_DYE, "§e重新打开"),
        () -> {
            player.closeInventory();
            player.sendMessage(lang.prefixRaw("§e确认重新打开议题 #" + ticket.getId() + "？在聊天框输入 y 确认"));
            registerConfirmInput(player, ticket.getId(), "reopen", api);
        }));
}
```

- [ ] **Step 2: Add confirm input handler**

Add a static confirmation handler method:

```java
private void registerConfirmInput(Player player, int ticketId, String action, ApiClient api) {
    org.bukkit.plugin.PluginManager pm = org.bukkit.Bukkit.getPluginManager();

    pm.registerEvents(new org.bukkit.event.Listener() {
        @org.bukkit.event.EventHandler
        public void onChat(AsyncPlayerChatEvent event) {
            if (!event.getPlayer().getUniqueId().equals(player.getUniqueId())) return;
            event.setCancelled(true);

            String message = event.getMessage().trim();
            if (!message.equalsIgnoreCase("y") && !message.equalsIgnoreCase("yes")) {
                player.sendMessage(lang.prefixRaw("§c操作已取消"));
                org.bukkit.event.HandlerList.unregisterAll(this);
                return;
            }

            CompletableFuture<Void> future = action.equals("close")
                ? api.closeTicket(player.getUniqueId().toString(), ticketId)
                : api.reopenTicket(player.getUniqueId().toString(), ticketId);

            future.thenRun(() -> plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                    player.sendMessage(lang.prefix(action.equals("close") ? "cmd-close-success" : "cmd-reopen-success"))))
                .exceptionally(ex -> {
                    plugin.getServer().getGlobalRegionScheduler().run(plugin, t ->
                        player.sendMessage(lang.prefix("error-api-failed")));
                    return null;
                });

            org.bukkit.event.HandlerList.unregisterAll(this);
        }
    }, plugin);
}
```

- [ ] **Step 3: Add required import for CompletableFuture at top of file**

The file already imports `java.util.HashMap` and `java.util.Map`. Add:
```java
import java.util.concurrent.CompletableFuture;
```

(The file may not have this import yet.)

- [ ] **Step 4: Commit**

```bash
git add plugin/src/main/java/ink/neokoni/lighttickets/gui/TicketDetailMenu.java
git commit -m "feat: add close and reopen buttons to ticket detail menu"
```

---

### Task 8: Plugin lang.yml — new strings for close/reopen

**Files:**
- Modify: `plugin/src/main/resources/lang.yml`

- [ ] **Step 1: Add close/reopen lang entries**

Add to lang.yml:

```yaml
cmd-close-success: "议题 #{ticketId} 已关闭"
cmd-reopen-success: "议题 #{ticketId} 已重新打开"
```

- [ ] **Step 2: Commit**

```bash
git add plugin/src/main/resources/lang.yml
git commit -m "feat: add close/reopen language strings"
```

---

### Task 9: Build verification

- [ ] **Step 1: Type check frontend**

```bash
cd frontend && npx vue-tsc --noEmit
```
Expected: No type errors.

- [ ] **Step 2: Run backend tests**

```bash
cd backend && npx vitest run
```
Expected: All tests pass.

- [ ] **Step 3: Verify plugin compiles**

```bash
cd plugin && ./gradlew build
```
Expected: BUILD SUCCESSFUL.

- [ ] **Step 4: Final commit**

```bash
git commit -m "chore: finalize close-as-completed feature"
```

(Only if there are remaining uncommitted changes from build fixes.)

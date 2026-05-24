# UI Polish: Sidebar Alignment, Navbar Cleanup, Status Rename

## Overview

Three related UI adjustments: align the ticket detail sidebar top with the left content area, remove the "new ticket" button from the navbar, and rename the "closed" status to "invalid" (无效) with a dedicated list tab.

All changes must work on both desktop (lg+) and mobile (stacked layout).

---

## 1. Sidebar Top Alignment

**Problem:** The right sidebar (status, info, audit log) starts higher than the left content (title + author). The sidebar top should be flush with the title block height — regardless of how many lines the title wraps to.

**Solution:** Use CSS grid sub-row alignment instead of hardcoded pixel offsets. Restructure the layout so the title+author row and the sidebar sit in the same grid row, letting `items-start` naturally align their tops.

Current structure:
```
grid [1fr | 280px]
  ├── left:  space-y-6 (title block, body, comments)
  └── right: aside space-y-4 (status, info, labels, audit)
```

New structure:
```
grid [1fr | 280px] rows: auto 1fr
  ├── row 1, col 1: title+author block
  ├── row 1, col 2: aside top (status card)   ← aligned with title via same row
  ├── row 2, col 1: body + comments            ← col spans rows if needed
  └── row 2, col 2: aside remainder (info, labels, audit)
```

The key insight: the `<aside>` is split so its first card (status) shares the grid row with the title block. This way, regardless of title length or line wrapping, the status card top edge always aligns with the title top edge — zero magic numbers.

Alternative simpler approach: keep the two-column grid but make the left column a `flex-col` grid itself, with the title row and content row as direct grid participants. The `<aside>` spans both rows via `grid-row: 1 / -1`, and internal sidebar spacing pushes the first card to visually start at the title's top via the natural row alignment.

However, the cleanest approach is to restructure the grid into named rows:
```html
<div class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
  <!-- Title block: spans col 1 only -->
  <div>h1 + author</div>

  <!-- Below title: body + comments in col 1, entire sidebar in col 2 -->
  <div class="space-y-6 min-w-0">body + comments</div>
  <aside class="space-y-4 lg:row-start-1 lg:row-span-2 lg:col-start-2">...</aside>
</div>
```

Wait — `row-span-2` with implicit grid rows won't work cleanly. The pragmatic approach: use a **flex layout for the outer container** on lg+ instead of grid, with `items-start`:

```
lg:flex lg:items-start lg:gap-6
  ├── div.flex-1.min-w-0 (left: title + body + comments)
  └── aside.w-[280px].shrink-0.space-y-4 (right: sidebar)
```

On mobile, falls back to `flex-col` stacking via `space-y-6` — no alignment offset needed.

This guarantees: title top = sidebar top, always. No magic numbers. Title wraps 5 lines? Still aligned.

**Mobile consideration:** Mobile uses vertical stacking (the default before `lg:flex-row`). No alignment hack needed — content flows naturally.

**File:** `frontend/src/views/TicketDetailView.vue` — change the outer grid to flex layout

---

## 2. Remove Navbar "New Ticket" Button

**Problem:** The navbar has a sticky "新建议题" button visible on desktop and in the mobile menu. This duplicates the list page's "新建" button and adds clutter.

**Solution:** Remove both instances from `AppHeader.vue`:
- Desktop button: line 45 — `<BaseButton as="router-link" to="/tickets/new" ...>新建议题</BaseButton>` — delete entirely
- Mobile menu link: lines 90–93 — `<RouterLink to="/tickets/new" ...>新建议题</RouterLink>` — delete entirely

**Mobile consideration:** After removal, the mobile menu still has "议题", "管理" (if admin), "个人资料", and "退出登录" — all functional links remain. No new entry needed; the "议题" link already goes to the list page where the "新建" button exists.

**File:** `frontend/src/components/layout/AppHeader.vue`

---

## 3. Rename "关闭" → "无效" + Add "无效" Tab

### Context

The current status flow mirrors GitHub issues:
- **resolved** = closed as completed (已解决)
- **closed** = closed as not planned / invalid (无效)

The English enum value `closed` stays unchanged in the database, API, and TypeScript types. Only the **Chinese display label** changes from "关闭" to "无效".

`rejected` remains a separate status for denied permission requests — not merged.

### Changes

**A. Display labels — all instances of `"关闭"` → `"无效"`:**

- `TicketDetailView.vue` line 49: `statusOptions` `{ key: 'closed', label: '关闭', icon: 'lucide:circle' }` → `{ key: 'closed', label: '无效', icon: 'lucide:ban' }`
- Any other frontend label mappings referencing "关闭"

**B. Icon update:** `closed` status icon changes from `lucide:circle` to `lucide:ban` (ban/blocked symbol fits "invalid" semantics better than a plain circle).

**C. List page "无效" tab:** Add to `statusTabs` array in `TicketListView.vue` (line 22–27), positioned between 已解决 and 全部:

```typescript
const statusTabs = [
  { key: 'open', label: '开放', icon: 'lucide:circle-dot' },
  { key: 'in_progress', label: '处理中', icon: 'lucide:loader' },
  { key: 'resolved', label: '已解决', icon: 'lucide:check-circle-2' },
  { key: 'closed', label: '无效', icon: 'lucide:ban' },
  { key: 'all', label: '全部', icon: 'lucide:list' },
]
```

**D. Consistency updates across views:**
- `TicketListView.vue` status icon mapping (lines 129–137): update `closed` icon to `lucide:ban`
- `TicketDetailView.vue` sidebar status icon (line 166): update `closed` icon to `lucide:ban`
- `TicketDetailView.vue` status color: `closed` stays `text-slate-400` (gray — fits "invalid/voided" tone)

**Mobile consideration:**
- On mobile, status tabs wrap or scroll horizontally — adding one more tab is fine, the tab bar already uses `flex items-center gap-1` which wraps naturally at smaller widths.
- The `lucide:ban` icon renders at `w-4 h-4` in tabs and `w-5 h-5` in the list — both are standard sizes and work on mobile.
- Detail page sidebar on mobile stacks below content; the `无效` label and icon appear identically to desktop — no special mobile handling needed.

---

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/views/TicketDetailView.vue` | Flex layout for alignment, closed label → 无效, icon → ban |
| `frontend/src/views/TicketListView.vue` | Add closed/无效 tab, update icon mapping |
| `frontend/src/components/layout/AppHeader.vue` | Remove 新建议题 button (desktop + mobile) |
| `frontend/src/types/ticket.ts` | No change (enum value stays `closed`) |
| `backend/prisma/schema.prisma` | No change (enum stays `closed`) |

---

## Out of Scope

- Merging `rejected` into `closed` — rejected stays separate
- Changing the `closed` enum value in database/backend API
- Adding status transition validation (e.g., preventing re-open from 无效)
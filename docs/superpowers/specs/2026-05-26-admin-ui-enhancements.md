# Admin UI Enhancements Design Spec

**Date:** 2026-05-26
**Status:** Approved (brainstorm 2026-05-26)

## Goal

Add three independent admin/UI improvements to the badminton tournament app:

1. **Delete tournament** — give the admin a way to remove a tournament + all its data from the listing page.
2. **CSV bulk player import** — let the admin paste a `name,level` list and create many players at once.
3. **Global top bar** — add a sticky site header with brand badge and contextual login/logout button, replacing the per-page header on the home page.

These are bundled into one spec because they're small, share no implementation surface, and ship together.

## Architecture

| Feature | Backend touch | Frontend touch |
|---|---|---|
| Delete tournament | **None** — `DELETE /api/tournaments/[id]` already exists (`src/app/api/tournaments/[id]/route.ts:29-38`) | `tournament-list-admin.tsx` (add `⋯` menu + AlertDialog) |
| CSV bulk import | New `POST /api/tournaments/[id]/players/bulk` | `section-players.tsx` (add 「批次匯入」button + dialog) |
| Top bar | None | New `src/components/site-header.tsx`; mount in `src/app/layout.tsx`; trim duplicate header from `src/app/page.tsx` |

No schema change. No new dependencies (uses existing shadcn `Button`, `AlertDialog`, `Dialog`, `DropdownMenu`, `Textarea`, plus Tailwind).

---

## Feature 1: Delete tournament

### UX
- On `/admin` each tournament card gets a `⋯` icon button (shadcn `DropdownMenu`, `MoreHorizontal` icon, top-right of the card).
- The dropdown contains **one** item: `刪除賽事` (red destructive styling).
- Clicking opens shadcn `AlertDialog`:
  - Title: `刪除「{tournament.name}」？`
  - Description: `此操作會同時刪除該賽事下所有球員、分組、配對、比賽紀錄，且無法復原。`
  - Buttons: `取消` (default) / `刪除` (destructive)
- On `刪除` click: call `DELETE /api/tournaments/[id]`. On 200, remove the card from local state and toast `已刪除`. On error, toast the error message.

### Status restrictions
**None.** Admin can delete any status (draft / grouping / in_progress / finished). Simple model — if the admin opened the menu and confirmed twice, they meant it.

### Card click conflict
The card itself is a `<Link>`. The `⋯` button uses `e.stopPropagation()` + `e.preventDefault()` so opening the menu doesn't navigate.

### Realtime
The DELETE handler already emits `tournament.deleted`. List page is server-rendered with `dynamic = 'force-dynamic'`, so a `router.refresh()` after a successful delete is sufficient — no socket subscription needed on the list page itself.

---

## Feature 2: CSV bulk player import

### UX
- `SectionPlayers` adds a `批次匯入` button next to the existing `新增` button (only visible when `!locked`).
- Clicking opens shadcn `Dialog`:
  - Title: `批次匯入球員`
  - Help text: `一行一個球員，格式：姓名,等級（等級可留空）`
  - `Textarea` (rows=10, `font-mono`), placeholder showing two example lines: `張三,A` / `李四,B`
  - Optional collapsible: `失敗的行` section — only shown after a submission, lists `行號: 原始內容 — 原因`
  - Buttons: `取消` / `匯入`
- On `匯入`:
  - Parse client-side: split by `\n`, trim each line, skip empty lines, split each line by first `,`. `name` is required (trimmed, non-empty, max 50). `level` is optional (trimmed, max 10, or empty → `null`).
  - POST the parsed array to `/api/tournaments/[id]/players/bulk`. Server validates each row again and creates them.
  - On response, toast `已匯入 N 人` and if `failed.length > 0` also toast `N 行失敗`.
  - If `failed.length === 0` and `created > 0`: clear the textarea and close the dialog.
  - If `failed.length > 0`: keep the dialog open, expand the `失敗的行` collapsible.

### API: `POST /api/tournaments/[id]/players/bulk`

**Request body** (validated via new zod schema `BulkCreatePlayers`):
```ts
{
  players: Array<{ name: string; level?: string | null }>  // length 1..500
}
```

**Behavior:**
- `requireAdmin`. Verify tournament exists.
- Use `prisma.$transaction([...])` to batch-insert. If any single row fails the DB constraints (shouldn't happen given zod pre-validation), the whole transaction aborts and the API responds 409. **Note:** because we batch the entire request in one transaction, "partial success" only refers to client-side parse failures (rows we never sent to the server). Server-side this is all-or-nothing.
- Emit one `player.added` event per created row (loop after the transaction commits).

**Response shape:**
```ts
{ created: number; failed: Array<{ line: number; raw: string; reason: string }> }
```
Note: `failed` here are **client-side parse failures only**, passed back to the dialog so it can display them. The dialog merges its own parse-failed array with the server response.

### Error scenarios
- Empty textarea → button stays disabled (no POST).
- All lines invalid → no POST, just expand failed-rows collapsible with the parse errors.
- Network/server error → toast the message, keep textarea content.

---

## Feature 3: Global Top Bar

### Component: `src/components/site-header.tsx`
Server component (no client interactivity beyond a Link).

```tsx
<header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
  <div className="container mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
    <Link href="/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
        🏸
      </span>
      <span className="text-lg font-semibold tracking-tight">羽球友誼賽</span>
    </Link>
    <HeaderAction />
  </div>
</header>
```

### Component: `<HeaderAction>` (client)
Reads the pathname via `usePathname()` and renders a contextual button:
- `pathname === '/'` → `<Link href="/admin"><Button variant="outline">主辦登入</Button></Link>`
- `pathname.startsWith('/admin')` (and not on `/admin/login`) → `登出` button which POSTs to `/api/admin/logout` then `router.push('/')`
- `pathname.startsWith('/admin/login')` → no button (avoid noise on login page)
- `pathname.startsWith('/t/')` → `<Link href="/admin"><Button variant="ghost" size="sm">主辦登入</Button></Link>`
- Fallback (any other route) → no button

### Layout mount
`src/app/layout.tsx`:
```tsx
<body className="... flex min-h-screen flex-col">
  <SiteHeader />
  <main className="flex-1">{children}</main>
  <Toaster />
</body>
```

### Page-level cleanup
- `src/app/page.tsx`: remove the `<div className="mb-6 flex items-center justify-between">` block containing the H1 + 主辦登入 button. The page becomes just `<main>` wrapping `<TournamentList>` with a smaller heading or no heading (header already shows the brand).
- Admin and viewer pages: no change — they keep their own sub-headings.

### Why server component for the wrapper
The header is shared chrome and doesn't need state. Only the action button needs the pathname, so we isolate that in `<HeaderAction>` as a small client component.

---

## Out of scope

- Theme switcher / dark mode (mentioned in brainstorm option 2; deferred).
- Color palette overhaul (option 3; deferred).
- Re-export / CSV download of players.
- Soft delete / recycle bin for tournaments.
- Validation of duplicate player names (current model allows same name twice; same-tournament uniqueness is not enforced and not added here).

---

## File touch summary

| Path | Action |
|---|---|
| `src/components/admin/tournament-list-admin.tsx` | Modify — add ⋯ menu + AlertDialog |
| `src/components/admin/section-players.tsx` | Modify — add 批次匯入 button + dialog |
| `src/components/admin/bulk-import-dialog.tsx` | Create — extracted dialog component (kept out of section-players.tsx to keep that file focused) |
| `src/app/api/tournaments/[id]/players/bulk/route.ts` | Create |
| `src/lib/schemas.ts` | Modify — add `BulkCreatePlayers` zod schema |
| `src/components/site-header.tsx` | Create |
| `src/components/header-action.tsx` | Create — client component with `usePathname` |
| `src/app/layout.tsx` | Modify — mount `<SiteHeader>` |
| `src/app/page.tsx` | Modify — remove duplicate H1/login row |

No test files (per the project decision to verify on the test machine after deploy).

---

## Open questions

None — all major decisions made during brainstorm 2026-05-26.

# Viewer Redesign + Admin Configuration Spec

**Date:** 2026-05-26
**Status:** Approved (brainstorm 2026-05-26)

## Goal

Five tightly-related improvements bundled into one spec:

1. **Level required everywhere** — players must have a level (was optional).
2. **CSV bulk import accepts whitespace/comma/fullwidth-comma as separator** — `選手 A`, `選手,A`, `選手，A`, `選手\tA` all work.
3. **Viewer page visual redesign** — dark banner with brand icon + tournament name, yellow ribbon group cards, pairs inline inside group, 4 tabs (drop standalone "配對").
4. **Per-tournament banner customization** — admin sets `bannerIcon` (emoji) and `bannerColor` (preset palette) per tournament.
5. **Admin password reset (DB-backed)** — password stored as scrypt hash in new `AdminConfig` table, changeable via UI without container restart.

Bundled because they share one schema migration and one redeploy window, and the redesign isn't useful without per-tournament branding.

## Architecture

| Feature | Backend | Frontend |
|---|---|---|
| Level required | `schemas.ts` — `CreatePlayer.level` / `BulkCreatePlayers.players[].level` no longer optional | `section-players.tsx` form validation; `bulk-import-dialog.tsx` parser rejects no-level rows |
| CSV separator | n/a | `bulk-import-dialog.tsx` parser splits on first `/[,，\s]/` |
| Viewer redesign | `tournaments/[id]/groups/route.ts` already returns players+pairs (no change) | New `<TournamentBanner>`, hide `<SiteHeader>` on `/t/*`, redesign `<GroupsTab>`, delete `<PairsTab>`, drop pairs tab from `<ViewerClient>` |
| Banner config | Schema adds `bannerIcon` / `bannerColor` on Tournament; `schemas.ts` `UpdateTournament` accepts them | `section-settings.tsx` adds emoji input + 6-color swatch picker; `<TournamentBanner>` reads them |
| Password reset | New `AdminConfig` model; `auth.ts` adds scrypt hash/verify; `login/route.ts` reads DB with env-bootstrap; new `POST /api/admin/password` | New `<PasswordChangeCard>` mounted on `/admin` |

One Prisma migration covers schema additions:
- `Tournament.bannerIcon String @default("🏸")`
- `Tournament.bannerColor String @default("red")`
- `AdminConfig { id Int @id @default(0); passwordHash String; updatedAt DateTime @updatedAt }`

The `AdminConfig.id` is fixed to `0` so we can `upsert(where: {id: 0})` for the singleton.

---

## Feature 1: Level required

### Validation
```ts
// schemas.ts
export const CreatePlayer = z.object({
  name: z.string().trim().min(1).max(50),
  level: z.string().trim().min(1).max(10),   // was optional
});

export const UpdatePlayer = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  level: z.string().trim().min(1).max(10).optional(),   // optional for partial updates, but non-empty when given
  groupId: z.string().nullable().optional(),
});

export const BulkCreatePlayers = z.object({
  players: z.array(z.object({
    name: z.string().trim().min(1).max(50),
    level: z.string().trim().min(1).max(10),   // was optional+nullable
  })).min(1).max(500),
});
```

### UX
- `SectionPlayers`: the 「等級」 input gets a `*` suffix in the label; the 「新增」 button is `disabled` when `!name.trim() || !level.trim()`.
- Existing players with `level === null` (legacy data) remain visible and editable. `PATCH` requires a valid level on next save.

### Migration impact
`Player.level` stays `String?` in the database. Required-ness is enforced at the API layer only. This avoids a backfill problem for existing legacy rows.

---

## Feature 2: CSV separator flexibility

### Parser change
```ts
const trimmed = rawLine.trim();
if (trimmed === '') return; // skip empty
const sepIdx = trimmed.search(/[,，\s]/);
let name: string;
let level: string;
if (sepIdx === -1) {
  return failures.push({ line: lineNo, raw: rawLine, reason: '缺等級' });
}
name = trimmed.slice(0, sepIdx).trim();
level = trimmed.slice(sepIdx + 1).trim();
if (name === '') return failures.push({ line: lineNo, raw: rawLine, reason: 'name 空白' });
if (level === '') return failures.push({ line: lineNo, raw: rawLine, reason: '缺等級' });
if (name.length > 50) return failures.push({ line: lineNo, raw: rawLine, reason: 'name 超過 50 字' });
if (level.length > 10) return failures.push({ line: lineNo, raw: rawLine, reason: 'level 超過 10 字' });
rows.push({ name, level });
```

### Examples
| Input line | Result |
|---|---|
| `小熊 9` | OK — name `小熊`, level `9` |
| `小熊,9` | OK |
| `小熊，9` | OK (fullwidth comma) |
| `小熊\t9` | OK (tab) |
| `小熊` | Fail — 缺等級 |
| `小熊 ` (trailing space only) | Fail — 缺等級 (level slice is empty) |
| (blank line) | Silent skip |

### Dialog copy
Update the help text in `<BulkImportDialog>` to: `一行一個球員，姓名 + 等級之間用逗號或空格分隔`. Update placeholder to `小熊 9\n山哥 9\n小傑,7`.

---

## Feature 3: Viewer page visual redesign

### Layout structure
```
┌─────────────────────────────────────┐
│ <TournamentBanner>                  │   sticky top, banner bg
│  ┌──┐                               │
│  │🏸│  FRIENDLY MATCH ★ 友誼賽       │
│  └──┘  {tournament.name}            │
│        雙打分組循環賽                  │
├─────────────────────────────────────┤
│ Tabs: 報名 / 分組 / 賽程計分 / 排名     │   sticky just below banner
├─────────────────────────────────────┤
│  Tab content (米白底)                │
└─────────────────────────────────────┘
```

### `<TournamentBanner>` (new client component)
- Read `tournament` prop (already passed in via `<ViewerClient>`)
- Map `bannerColor` key to a Tailwind bg class:
  ```ts
  const COLOR_BG: Record<string, string> = {
    red:    'bg-red-700',
    blue:   'bg-blue-700',
    green:  'bg-emerald-700',
    purple: 'bg-purple-700',
    orange: 'bg-orange-600',
    slate:  'bg-slate-700',
  };
  const COLOR_RING: Record<string, string> = {
    red:    'bg-amber-400 text-red-900',
    blue:   'bg-amber-400 text-blue-900',
    green:  'bg-amber-400 text-emerald-900',
    purple: 'bg-amber-400 text-purple-900',
    orange: 'bg-amber-400 text-orange-900',
    slate:  'bg-amber-400 text-slate-900',
  };
  ```
- Layout: sticky top, white text, h-20, container max-w-5xl
- Icon badge: 56×56 rounded-full, `COLOR_RING` palette, big emoji centered
- Right of icon: gold label `FRIENDLY MATCH ★ 友誼賽` (small) + `{tournament.name}` (xl bold white) + `雙打分組循環賽` (xs amber-200)

### Hide global header on viewer routes
Modify `<HeaderAction>` is not enough — the whole `<SiteHeader>` should disappear on `/t/*`. Simplest: convert `<SiteHeader>` to a client wrapper that checks `usePathname()` and returns `null` for `/t/*`. (Or: move the pathname check into a new client `<SiteHeaderGate>` component.)

Chosen approach: rename current `site-header.tsx` to `site-header-inner.tsx`, create a new client `site-header.tsx` that does:
```tsx
'use client';
import { usePathname } from 'next/navigation';
import { SiteHeaderInner } from './site-header-inner';
export function SiteHeader() {
  const pathname = usePathname();
  if (pathname.startsWith('/t/')) return null;
  return <SiteHeaderInner />;
}
```

This keeps the server-rendered chrome on admin/home and removes it on viewer.

### Tabs simplification
`<ViewerClient>` goes from 5 tabs to 4:
- `球員名單` → renamed to `報名`
- `分組` stays (pairs now nested inside)
- `配對` — **removed** (moved inline into 分組)
- `賽程` → renamed to `賽程計分` (viewer-side it's read-only matches+scores, but the heading matches the screenshot's tab label)
- `即時排名` → renamed to `排名`

Tab style: yellow underline on active (Tailwind: `data-[state=active]:border-b-2 data-[state=active]:border-amber-400`). Keep shadcn `Tabs` primitive.

### `<GroupsTab>` redesign
```tsx
<Card className="overflow-hidden">
  <div className="bg-amber-400 px-3 py-1.5 text-sm font-semibold text-amber-950">
    分組 {g.displayOrder}
  </div>
  <div className="space-y-2 p-3">
    <div className="text-sm">
      <span className="font-medium text-muted-foreground">成員：</span>
      {g.players.map((p, i) => (
        <span key={p.id}>
          {i > 0 && '、'}
          {p.name}{p.level && `(${p.level})`}
        </span>
      ))}
    </div>
    {g.pairs.length > 0 && (
      <div className="space-y-1 border-t pt-2">
        {g.pairs.sort((a,b) => a.displayOrder - b.displayOrder).map((pair, i) => {
          const p1 = g.players.find((x) => x.id === pair.player1Id);
          const p2 = g.players.find((x) => x.id === pair.player2Id);
          return (
            <div key={pair.id} className="rounded bg-amber-50 px-2 py-1 text-sm">
              <span className="font-medium">配對 {i + 1}：</span>
              {p1?.name} & {p2?.name}
            </div>
          );
        })}
      </div>
    )}
  </div>
</Card>
```

### Delete `pairs-tab.tsx`
Functionality merged into `<GroupsTab>`. Remove the file. Remove the import + tab from `<ViewerClient>`.

### Background tone
The viewer page wrapper gets `bg-amber-50/40` (very light cream). Other pages unchanged.

---

## Feature 4: Per-tournament banner customization

### Schema additions on `Tournament`
```prisma
bannerIcon  String @default("🏸")
bannerColor String @default("red")
```

### zod updates
```ts
// schemas.ts
const COLOR_KEYS = ['red','blue','green','purple','orange','slate'] as const;
export const BannerColor = z.enum(COLOR_KEYS);

export const UpdateTournament = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: TournamentStatusEnum.optional(),
  groupCount: z.number().int().min(1).max(26).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
  bannerIcon: z.string().trim().min(1).max(4).optional(),
  bannerColor: BannerColor.optional(),
});
```

(CreateTournament doesn't need these — new tournaments use defaults; admin can change later in SectionSettings.)

### `<SectionSettings>` UI additions
Inside the existing grid, add two new rows:
1. **banner icon**: small Input (max 4), label `主視覺 icon`, placeholder `🏸`
2. **banner color**: 6 round swatch buttons (`bg-red-700`, `bg-blue-700`, etc.), selected one has `ring-2 ring-offset-2`

Both editable in any tournament status (organizer can rebrand even during in_progress).

---

## Feature 5: Admin password reset

### Schema: `AdminConfig` model
```prisma
model AdminConfig {
  id           Int      @id @default(0)
  passwordHash String
  updatedAt    DateTime @updatedAt
}
```

### `auth.ts` additions
```ts
import { scryptSync, randomBytes } from 'node:crypto';

// Format: "scrypt$N$r$p$saltHex$hashHex". Stored as one string. N=16384 r=8 p=1 defaults.
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, 64);
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, , , , saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(plain, salt, expected.length);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
```

### Login route rewrite (bootstrap-from-env)
```ts
// pseudo
const config = await prisma.adminConfig.findUnique({ where: { id: 0 } });
if (config) {
  // DB has hash — verify against hash; env is no longer consulted
  if (!verifyPassword(parsed.data.password, config.passwordHash)) return invalidCreds;
} else {
  // First boot — accept env password and seed the DB row
  const envPw = process.env.ADMIN_PASSWORD;
  if (!envPw) return server_not_configured;
  if (!passwordMatches(parsed.data.password, envPw)) return invalidCreds;
  await prisma.adminConfig.create({
    data: { id: 0, passwordHash: hashPassword(parsed.data.password) },
  });
}
```

The env `ADMIN_PASSWORD` becomes a **bootstrap secret**, not a permanent credential. After first successful login the DB row owns the password and env is ignored.

### `POST /api/admin/password`
```ts
// requireAdmin first
// body: { oldPassword: string, newPassword: string }
// newPassword: z.string().min(6).max(100)
//
// fetch AdminConfig — if missing, return 500 (shouldn't happen post-bootstrap)
// verifyPassword(oldPassword, config.passwordHash) — if wrong, 401
// upsert AdminConfig with hashPassword(newPassword)
// return ok
```

### `<PasswordChangeCard>` (new) — admin home
- Lives at top of `/admin` (above tournament list)
- 3 fields: 舊密碼 / 新密碼 / 確認新密碼
- Button `更新密碼` — disabled unless all fields filled, `new === confirm`, `new.length >= 6`
- On success: toast `密碼已更新` + clear fields. **No logout** (current session still valid because the JWT signature uses `SESSION_SECRET`, unrelated to password).

### Security note
- `SESSION_SECRET` is separate from the admin password and stays in env. No change.
- Password DB hash means even DB dump leakage doesn't reveal the plain password.
- Migration adds the table empty; no manual seed needed.

---

## File touch summary

| Path | Action |
|---|---|
| `prisma/schema.prisma` | Modify — add bannerIcon/bannerColor, add AdminConfig model |
| `prisma/migrations/<ts>_viewer_redesign_admin_config/migration.sql` | Create (offline-generated, no DB needed) |
| `src/lib/schemas.ts` | Modify — level required, add BannerColor + bannerIcon/bannerColor in UpdateTournament, add ChangePassword |
| `src/lib/auth.ts` | Modify — add hashPassword/verifyPassword (scrypt) |
| `src/app/api/admin/login/route.ts` | Modify — DB check + env bootstrap |
| `src/app/api/admin/password/route.ts` | Create |
| `src/components/admin/section-players.tsx` | Modify — level required UI |
| `src/components/admin/bulk-import-dialog.tsx` | Modify — parser change, level required |
| `src/components/admin/section-settings.tsx` | Modify — add icon input + color swatches |
| `src/components/admin/password-change-card.tsx` | Create |
| `src/app/admin/page.tsx` | Modify — mount PasswordChangeCard |
| `src/components/site-header.tsx` | Modify — pathname gate to hide on `/t/*` |
| `src/components/site-header-inner.tsx` | Create — extract current SiteHeader body |
| `src/components/viewer/tournament-banner.tsx` | Create |
| `src/components/viewer/groups-tab.tsx` | Rewrite — yellow ribbon card + pairs inline |
| `src/components/viewer/pairs-tab.tsx` | Delete |
| `src/app/t/[id]/viewer-client.tsx` | Rewrite — banner, 4 tabs, drop pairs tab |
| `src/app/t/[id]/page.tsx` | Modify — pass tournament + add cream bg wrapper |

No tests (per project decision).

---

## Migration recovery note for test machine

The new migration adds 2 columns with defaults (safe) and 1 new table (safe). No data clearing needed. **However**, the existing test machine may still have the previous `roster_grouping_rewrite` migration in a successful state, in which case the new migration applies cleanly.

If the test machine still has the previous migration stuck (P3009), follow recovery procedure from prior session before deploying this batch.

---

## Out of scope

- Color picker (only 6 preset colors).
- Per-tournament organizer name / "OOO主辦" subtitle (subtitle is fixed "雙打分組循環賽").
- Multi-admin accounts (single shared admin password).
- Password reset via email / recovery code.
- Theme switcher (dark mode).
- Admin workspace visual rebrand (admin keeps current style for fast operation).

---

## Open questions

None — all decisions made in brainstorm 2026-05-26.

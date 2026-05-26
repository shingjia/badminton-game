# Admin Site Config + Standings Ranking Spec

**Date:** 2026-05-26
**Status:** Approved (brainstorm 2026-05-26)

## Goal

1. Header（admin 登入後）加齒輪 icon + 頭像 dropdown menu
2. 新增 `/admin/settings` 集中放品牌設定 + 密碼修改
3. 全站品牌名稱與 icon 可由管理者編輯（取代 hardcoded「羽球友誼賽」+「🏸」）
4. 排名 ORDER BY 改為「勝場 → 負場 → 總得分 → 總失分」（新增 losses 與 points_against 欄位）

## Architecture

| Feature | Backend | Frontend |
|---|---|---|
| Site config | `AdminConfig` 加 `siteName` + `siteIcon`；`getSiteConfig()` helper | `<SiteHeaderInner>` 改 async server 讀 helper |
| `/admin/settings` page | — | 新 page = `<BrandSettingsCard>` + `<PasswordChangeCard>` |
| Update site config API | `PATCH /api/admin/site-config` | `BrandSettingsCard` POST |
| Header gear + avatar | — | `header-action.tsx` 加 Settings + User dropdown |
| Standings rank | `pair_standings` view 重建（+losses, +points_against）；`standings-sql.ts` ORDER BY 改 | `standings-tab.tsx` 表格 +「負」「總失分」欄位 |

One Prisma migration:
- `ALTER TABLE "AdminConfig" ADD COLUMN siteName/siteIcon (defaults)`
- `DROP VIEW pair_standings; CREATE VIEW pair_standings ...` (with losses + points_against)

---

## Feature 1: Header gear + avatar dropdown

`header-action.tsx` 在 admin 登入狀態下渲染：
```
[齒輪 (Settings icon, 連結到 /admin/settings)] [頭像 (User icon, DropdownMenu)] [登出按鈕]
```

未登入狀態（home / viewer）：維持目前的「主辦登入」連結。

Dropdown menu items:
- `個人資料` → 跳 `/admin/settings`
- `登出` → POST `/api/admin/logout` → router.push('/')

Both items use shadcn `DropdownMenu`.

---

## Feature 2: `/admin/settings` page

New file `src/app/admin/settings/page.tsx` (server component):
```tsx
import { BrandSettingsCard } from '@/components/admin/brand-settings-card';
import { PasswordChangeCard } from '@/components/admin/password-change-card';
import { getSiteConfig } from '@/lib/site-config';

export default async function AdminSettingsPage() {
  const config = await getSiteConfig();
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold">管理者設定</h1>
      <BrandSettingsCard initial={config} />
      <PasswordChangeCard />
    </div>
  );
}
```

Remove `<PasswordChangeCard>` from `/admin` (admin home returns to clean list view).

---

## Feature 3: Editable site name + icon

### Schema (additions to existing `AdminConfig`)
```prisma
model AdminConfig {
  id           Int      @id @default(0)
  passwordHash String
  siteName     String   @default("羽球友誼賽")
  siteIcon     String   @default("🏸")
  updatedAt    DateTime @updatedAt
}
```

### zod
```ts
export const UpdateSiteConfig = z.object({
  siteName: z.string().trim().min(1).max(30),
  siteIcon: z.string().trim().min(1).max(4),
});
```

### `getSiteConfig()` helper
```ts
// src/lib/site-config.ts
export type SiteConfig = { siteName: string; siteIcon: string };

const DEFAULTS: SiteConfig = { siteName: '羽球友誼賽', siteIcon: '🏸' };

export async function getSiteConfig(): Promise<SiteConfig> {
  const row = await prisma.adminConfig.findUnique({
    where: { id: 0 },
    select: { siteName: true, siteIcon: true },
  });
  return row ?? DEFAULTS;
}
```

### `PATCH /api/admin/site-config`
- `requireAdmin`
- Parse `UpdateSiteConfig`
- If `AdminConfig` row missing → 500 `not_bootstrapped` (means admin hasn't logged in yet, which shouldn't be possible since the route requires admin session)
- Update row

### `<BrandSettingsCard>` (client component)
- Inputs: 網站名稱, 網站 icon
- Pre-populated from `initial` prop
- Save button → PATCH

### SiteHeader refactor
- `site-header.tsx` → 改名為 Gate 模式：accept `children`, hide on `/t/*`
- `site-header-inner.tsx` → async server, fetches `getSiteConfig()`, renders the header with config.siteName / config.siteIcon
- `layout.tsx`: render `<SiteHeader><SiteHeaderInner /></SiteHeader>` (children pattern lets server component live inside client gate)

---

## Feature 4: Standings ranking

### View migration
```sql
DROP VIEW IF EXISTS pair_standings;
CREATE VIEW pair_standings AS
SELECT
  p.id                              AS pair_id,
  p."groupId"                       AS group_id,
  p."tournamentId"                  AS tournament_id,
  COUNT(*) FILTER (
    WHERE (m."pairAId" = p.id AND m."scoreA" > m."scoreB")
       OR (m."pairBId" = p.id AND m."scoreB" > m."scoreA")
  )                                 AS wins,
  COUNT(*) FILTER (
    WHERE (m."pairAId" = p.id AND m."scoreA" < m."scoreB")
       OR (m."pairBId" = p.id AND m."scoreB" < m."scoreA")
  )                                 AS losses,
  COUNT(*) FILTER (WHERE m.status = 'completed') AS played,
  COALESCE(SUM(
    CASE WHEN m."pairAId" = p.id THEN m."scoreA" - m."scoreB"
         WHEN m."pairBId" = p.id THEN m."scoreB" - m."scoreA"
         ELSE 0 END
  ), 0)                             AS point_diff,
  COALESCE(SUM(
    CASE WHEN m."pairAId" = p.id THEN m."scoreA"
         WHEN m."pairBId" = p.id THEN m."scoreB"
         ELSE 0 END
  ), 0)                             AS points_for,
  COALESCE(SUM(
    CASE WHEN m."pairAId" = p.id THEN m."scoreB"
         WHEN m."pairBId" = p.id THEN m."scoreA"
         ELSE 0 END
  ), 0)                             AS points_against
FROM "Pair" p
LEFT JOIN "Match" m
  ON (m."pairAId" = p.id OR m."pairBId" = p.id)
 AND m.status = 'completed'
GROUP BY p.id, p."groupId", p."tournamentId";
```

### Runtime SQL change
`standings-sql.ts` ORDER BY 改成：
```sql
ORDER BY wins DESC, losses ASC, points_for DESC, points_against ASC
```

Plus add `losses` and `points_against` to select list (cast to int).

### UI: `standings-tab.tsx` columns
```
| # | 配對 | 勝 | 負 | 場次 | 得分差 | 總得分 | 總失分 |
```

---

## File touch summary

| Path | Action |
|---|---|
| `prisma/schema.prisma` | Modify — AdminConfig +2 cols |
| `prisma/migrations/<ts>_admin_site_config_and_standings/migration.sql` | Create |
| `src/lib/schemas.ts` | Modify — `UpdateSiteConfig` |
| `src/lib/site-config.ts` | Create |
| `src/lib/standings-sql.ts` | Modify — +losses/points_against, ORDER BY |
| `src/app/api/admin/site-config/route.ts` | Create — PATCH |
| `src/app/admin/settings/page.tsx` | Create |
| `src/components/admin/brand-settings-card.tsx` | Create |
| `src/app/admin/page.tsx` | Modify — drop PasswordChangeCard import + render |
| `src/components/site-header.tsx` | Rewrite — Gate (children pattern) |
| `src/components/site-header-inner.tsx` | Rewrite — async server, fetch siteConfig |
| `src/app/layout.tsx` | Modify — render Gate + Inner |
| `src/components/header-action.tsx` | Rewrite — gear + avatar dropdown for admin |
| `src/components/viewer/standings-tab.tsx` | Modify — +勝/負/總失分 columns |

No tests (per project decision).

---

## Out of scope

- Multiple admin accounts
- Avatar upload (just static User icon)
- Personalized profile fields beyond password (no name/email)
- Standings tiebreaker beyond the 4-level chain (if all 4 are tied, RANK assigns same rank — no further breaker)

---

## Open questions

None.

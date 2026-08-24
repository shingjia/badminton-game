# 觀眾頁「顯示球員程度」開關 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `Tournament.showPlayerLevel` 開關（預設開啟），後台「賽事設定」可以關閉，關閉後觀眾頁「報名」「分組」不顯示球員程度；後台自己的管理畫面不受影響。

**Architecture:** Prisma schema 加一個布林欄位 + migration，`UpdateTournament` zod schema 跟著加，`section-settings.tsx` 加一個 checkbox 存到既有的儲存流程（PATCH 已經會透過 socket 廣播 `tournament.updated`，觀眾頁本來就在監聽）。`viewer-client.tsx` 把這個值往下傳給 `PlayersTab`/`GroupsTab` 兩個既有元件，各自加一個 `showLevel` prop 決定要不要 render 程度。

**Tech Stack:** Next.js (App Router)、Prisma + PostgreSQL、React client components、Zod。

**Design doc:** `docs/superpowers/specs/2026-08-24-viewer-hide-player-level-design.md`

---

## Task 1: Prisma schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260824120000_add_show_player_level/migration.sql`

- [ ] **Step 1: 加欄位**

Find（`prisma/schema.prisma`）：

```prisma
  pointsPerGame Int              @default(21)
  bannerIcon    String           @default("🏸")
```

Replace：

```prisma
  pointsPerGame Int              @default(21)
  showPlayerLevel Boolean        @default(true)
  bannerIcon    String           @default("🏸")
```

- [ ] **Step 2: 產生並套用 migration**

先試：

```bash
cd "C:\Private\badminton-game"
npx prisma migrate dev --name add_show_player_level
```

如果本地有連得到開發用資料庫，這一步會自動建立 migration 資料夾、套用、並重新產生 Prisma Client——完成後跳到 Step 4。

如果連不到資料庫（`Error: P1001` 之類），改成手動建立：

Create `prisma/migrations/20260824120000_add_show_player_level/migration.sql`：

```sql
-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "showPlayerLevel" BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 3: 重新產生 Prisma Client（手動建立 migration 時需要，讓 TypeScript 看得到新欄位）**

只有走 Step 2 手動路徑才需要這一步（`prisma migrate dev` 已經包含這一步）：

```bash
cd "C:\Private\badminton-game"
npx prisma generate
```

- [ ] **Step 4: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: 至少 1 個錯誤，在 `src/app/api/tournaments/[id]/route.ts` 之外的地方不應該出現新錯誤（這個 Task 只加欄位，還沒有任何程式碼讀寫它，理論上 typecheck 應該完全乾淨，不會因為新欄位本身產生錯誤）。如果看到跟這個新欄位無關的錯誤，先確認是不是既有問題，不要嘗試修正。

- [ ] **Step 5: Commit**

```bash
cd "C:\Private\badminton-game"
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add Tournament.showPlayerLevel toggle"
```

---

## Task 2: `UpdateTournament` zod schema

**Files:**
- Modify: `src/lib/schemas.ts`

- [ ] **Step 1: 加欄位驗證**

Find：

```typescript
export const UpdateTournament = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: TournamentStatusEnum.optional(),
  groupCount: z.number().int().min(1).max(26).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
  bannerIcon: z.string().trim().min(1).max(4).optional(),
  bannerColor: BannerColor.optional(),
  bannerIconImage: z.string().nullable().optional(),
  bannerTagline: z.string().trim().max(80).optional(),
  bannerSubtitle: z.string().trim().max(80).optional(),
});
```

Replace：

```typescript
export const UpdateTournament = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: TournamentStatusEnum.optional(),
  groupCount: z.number().int().min(1).max(26).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
  showPlayerLevel: z.boolean().optional(),
  bannerIcon: z.string().trim().min(1).max(4).optional(),
  bannerColor: BannerColor.optional(),
  bannerIconImage: z.string().nullable().optional(),
  bannerTagline: z.string().trim().max(80).optional(),
  bannerSubtitle: z.string().trim().max(80).optional(),
});
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors (Task 1 already regenerated the Prisma Client with the new field, so `Tournament.showPlayerLevel` exists on the type by now).

- [ ] **Step 3: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/lib/schemas.ts
git commit -m "feat(db): validate showPlayerLevel in UpdateTournament schema"
```

---

## Task 3: 後台「賽事設定」加開關

**Files:**
- Modify: `src/components/admin/section-settings.tsx`

- [ ] **Step 1: 加 state**

Find：

```typescript
  const [name, setName] = useState(tournament.name);
  const [groupCount, setGroupCount] = useState(tournament.groupCount);
  const [pointsPerGame, setPointsPerGame] = useState(tournament.pointsPerGame);
```

Replace：

```typescript
  const [name, setName] = useState(tournament.name);
  const [groupCount, setGroupCount] = useState(tournament.groupCount);
  const [pointsPerGame, setPointsPerGame] = useState(tournament.pointsPerGame);
  const [showPlayerLevel, setShowPlayerLevel] = useState(tournament.showPlayerLevel);
```

- [ ] **Step 2: 存檔時一起送出**

Find：

```typescript
      await api(`/api/tournaments/${tournament.id}`, {
        method: 'PATCH',
        body: {
          name,
          groupCount,
          pointsPerGame,
          bannerIcon,
          bannerColor,
          bannerIconImage,
          bannerTagline,
          bannerSubtitle,
        },
      });
```

Replace：

```typescript
      await api(`/api/tournaments/${tournament.id}`, {
        method: 'PATCH',
        body: {
          name,
          groupCount,
          pointsPerGame,
          showPlayerLevel,
          bannerIcon,
          bannerColor,
          bannerIconImage,
          bannerTagline,
          bannerSubtitle,
        },
      });
```

- [ ] **Step 3: 加 checkbox UI**

Find（「基本資訊」卡片內，`grid gap-4 md:grid-cols-3` 結束的地方）：

```tsx
          <div className="space-y-2">
            <Label htmlFor="s-ppg">每局分數</Label>
            <Input
              id="s-ppg"
              type="number"
              min={11}
              max={31}
              value={pointsPerGame}
              onChange={(e) => setPointsPerGame(Number(e.target.value))}
            />
          </div>
        </div>
      </Card>
```

Replace：

```tsx
          <div className="space-y-2">
            <Label htmlFor="s-ppg">每局分數</Label>
            <Input
              id="s-ppg"
              type="number"
              min={11}
              max={31}
              value={pointsPerGame}
              onChange={(e) => setPointsPerGame(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="s-show-level"
            type="checkbox"
            checked={showPlayerLevel}
            onChange={(e) => setShowPlayerLevel(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label htmlFor="s-show-level" className="cursor-pointer font-normal">
            觀眾頁顯示球員程度
          </Label>
        </div>
      </Card>
```

- [ ] **Step 4: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/admin/section-settings.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/admin/section-settings.tsx
git commit -m "feat(admin): toggle to hide player level from the viewer"
```

---

## Task 4: 觀眾頁依開關顯示/隱藏程度

**Files:**
- Modify: `src/components/viewer/players-tab.tsx`
- Modify: `src/components/viewer/groups-tab.tsx`
- Modify: `src/app/t/[id]/viewer-client.tsx`

- [ ] **Step 1: `players-tab.tsx` 加 `showLevel` prop**

Find：

```typescript
export function PlayersTab({
  tournamentId,
  revision,
}: {
  tournamentId: string;
  revision: number;
}) {
```

Replace：

```typescript
export function PlayersTab({
  tournamentId,
  revision,
  showLevel,
}: {
  tournamentId: string;
  revision: number;
  showLevel: boolean;
}) {
```

Find：

```tsx
            {p.level && <Badge variant="outline">{p.level}</Badge>}
```

Replace：

```tsx
            {showLevel && p.level && <Badge variant="outline">{p.level}</Badge>}
```

- [ ] **Step 2: `groups-tab.tsx` 加 `showLevel` prop**

Find：

```typescript
export function GroupsTab({
  tournamentId,
  revision,
  format,
}: {
  tournamentId: string;
  revision: number;
  format: 'friendly' | 'club';
}) {
```

Replace：

```typescript
export function GroupsTab({
  tournamentId,
  revision,
  format,
  showLevel,
}: {
  tournamentId: string;
  revision: number;
  format: 'friendly' | 'club';
  showLevel: boolean;
}) {
```

Find：

```tsx
                      {p.level && (
                        <span className="text-muted-foreground">({p.level})</span>
                      )}
```

Replace：

```tsx
                      {showLevel && p.level && (
                        <span className="text-muted-foreground">({p.level})</span>
                      )}
```

- [ ] **Step 3: `viewer-client.tsx` 傳入開關值**

Find：

```tsx
          <TabsContent value="players">
            <PlayersTab tournamentId={tournamentId} revision={revision} />
          </TabsContent>
          <TabsContent value="groups">
            <GroupsTab tournamentId={tournamentId} revision={revision} format={tournament.format} />
          </TabsContent>
```

Replace：

```tsx
          <TabsContent value="players">
            <PlayersTab tournamentId={tournamentId} revision={revision} showLevel={tournament.showPlayerLevel} />
          </TabsContent>
          <TabsContent value="groups">
            <GroupsTab
              tournamentId={tournamentId}
              revision={revision}
              format={tournament.format}
              showLevel={tournament.showPlayerLevel}
            />
          </TabsContent>
```

- [ ] **Step 4: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/viewer/players-tab.tsx src/components/viewer/groups-tab.tsx src/app/t/[id]/viewer-client.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/viewer/players-tab.tsx src/components/viewer/groups-tab.tsx "src/app/t/[id]/viewer-client.tsx"
git commit -m "feat(viewer): hide player level on 報名/分組 tabs when the toggle is off"
```

---

## Task 5: Full verification, push, manual walkthrough handoff

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite + typecheck one more time**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx vitest run tests/unit`
Expected: no type errors; all 44 tests pass (this plan doesn't touch any unit-tested pure-logic module).

- [ ] **Step 2: Push**

```bash
cd "C:\Private\badminton-game"
git push
```

- [ ] **Step 3: Manual walkthrough**

1. 部署到測試機（`git pull && docker build && docker compose up -d`）——如果 Task 1 是手動建立 migration（沒有本地資料庫可以跑 `prisma migrate dev`），確認部署流程會執行 `prisma migrate deploy` 套用這個新 migration。
2. 後台「賽事設定」：確認看到「觀眾頁顯示球員程度」開關，預設是勾選的（既有賽事、新建立的賽事都一樣）。
3. 取消勾選、按「儲存設定」，切到觀眾頁「報名」「分組」分頁，確認程度不見了；後台自己的「球員管理」「分組與配對」頁，程度還在。
4. 再勾選回去存檔，確認觀眾頁程度又出現了。

- [ ] **Step 4: If the walkthrough passes, this feature is done**

No further step — this is the final task in the plan.

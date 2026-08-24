# 三項小改動 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) 會內賽「各組等級均分」加入隨機打散，讓重複按能分出不同組合；(2) 賽程頁／計分頁／觀眾頁的組別、場地標籤加上固定顏色辨識；(3) 觀眾頁的進行中比賽可以點擊全螢幕放大。

**Architecture:** (1) 純前端一個函式內加一個 shuffle 步驟。(2) 新增 `lib/badge-colors.ts` 提供 `colorForIndex(index)`，三個畫面各自加上小型 `GroupBadge`/`CourtBadge`/`PairingHeader` 元件（沿用這個專案既有的「每個檔案各自重複定義小工具」慣例），呼叫這個共用色盤函式。(3) 新增 `viewer/fullscreen-match.tsx`，用瀏覽器原生 Fullscreen API，掛到 `matches-tab.tsx` 的比賽卡片上。

**Tech Stack:** Next.js (App Router)、React client components、Tailwind CSS、瀏覽器原生 Fullscreen API。

**Design doc:** `docs/superpowers/specs/2026-08-24-three-ui-improvements-design.md`

---

## Task 1: 「各組等級均分」加入隨機打散

**Files:**
- Modify: `src/components/admin/section-groups.tsx`

- [ ] **Step 1: 加一個 shuffle 工具函式**

Find（檔案最上面，import 區塊之後）：

```typescript
type GroupWithData = Group & { players: Player[]; pairs: Pair[] };
```

Replace：

```typescript
type GroupWithData = Group & { players: Player[]; pairs: Pair[] };

// Fisher–Yates — 讓「各組等級均分」重複按時分出不同的組合，不是每次都
// 一樣的固定結果。
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

- [ ] **Step 2: `generateMixed` 分配前先打散桶內順序**

Find：

```typescript
  // 各組等級均分：把每個等級的球員 round-robin 分散到 groupCount 組，
  // 讓每一組都混到各等級的人，而不是一個等級一組。
  async function generateMixed() {
    const byLevel = byLevelBuckets();
    const n = tournament.groupCount;
    const buckets: string[][] = Array.from({ length: n }, () => []);
    let cursor = 0;
    for (const lvl of [...byLevel.keys()].sort()) {
      for (const pid of byLevel.get(lvl)!) {
        buckets[cursor % n].push(pid);
        cursor++;
      }
    }
```

Replace：

```typescript
  // 各組等級均分：把每個等級的球員 round-robin 分散到 groupCount 組，
  // 讓每一組都混到各等級的人，而不是一個等級一組。桶內順序先隨機打散，
  // 這樣「不滿意再按一次」才會分出不同的組合，等級分佈規則不變（規則
  // 本身沒變，只是同一等級內誰先進哪一組是隨機的）。
  async function generateMixed() {
    const byLevel = byLevelBuckets();
    const n = tournament.groupCount;
    const buckets: string[][] = Array.from({ length: n }, () => []);
    let cursor = 0;
    for (const lvl of [...byLevel.keys()].sort()) {
      const ids = shuffleArray(byLevel.get(lvl)!);
      for (const pid of ids) {
        buckets[cursor % n].push(pid);
        cursor++;
      }
    }
```

- [ ] **Step 3: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/admin/section-groups.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/admin/section-groups.tsx
git commit -m "feat(groups): randomize 各組等級均分 so re-clicking gives a different grouping"
```

---

## Task 2: `lib/badge-colors.ts` + 套用到賽程頁

**Files:**
- Create: `src/lib/badge-colors.ts`
- Test: `tests/unit/badge-colors.test.ts`
- Modify: `src/components/admin/section-matches.tsx`

- [ ] **Step 1: 寫測試**

Create `tests/unit/badge-colors.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { colorForIndex } from '@/lib/badge-colors';

describe('colorForIndex', () => {
  it('returns the same color for the same index every time', () => {
    expect(colorForIndex(0)).toBe(colorForIndex(0));
    expect(colorForIndex(3)).toBe(colorForIndex(3));
  });

  it('cycles (wraps around) once the index exceeds the palette length, without going out of range', () => {
    // Palette has 8 colors — index 8 must wrap back to whatever index 0 is,
    // not return undefined.
    expect(colorForIndex(8)).toBe(colorForIndex(0));
    expect(colorForIndex(9)).toBe(colorForIndex(1));
    expect(colorForIndex(8)).not.toBeUndefined();
  });

  it('gives different indices different colors within one palette cycle', () => {
    expect(colorForIndex(0)).not.toBe(colorForIndex(1));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/badge-colors.test.ts`
Expected: FAIL — `Cannot find module '@/lib/badge-colors'`.

- [ ] **Step 3: 建立共用色盤工具**

Create `src/lib/badge-colors.ts`:

```typescript
// 固定色盤，讓同一組／同一場地在賽程頁、計分頁、觀眾頁三個畫面顏色都
// 一樣。用 0-based index（displayOrder - 1）挑色，超過色盤數量就循環
// 取模——現實賽事的組數/場地數不會超過，循環情況很少見。
const PALETTE = [
  'bg-rose-100 text-rose-800 border-rose-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-lime-100 text-lime-800 border-lime-200',
  'bg-teal-100 text-teal-800 border-teal-200',
  'bg-sky-100 text-sky-800 border-sky-200',
  'bg-indigo-100 text-indigo-800 border-indigo-200',
  'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200',
];

export function colorForIndex(index: number): string {
  return PALETTE[index % PALETTE.length];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/badge-colors.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: `section-matches.tsx` — import 色盤，加上 `GroupBadge`/`CourtBadge`/`PairingHeader`**

Find：

```typescript
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Court, Group, Match, Pair, Player, Tournament } from '@prisma/client';

type PairWithPlayers = Pair & { player1: Player; player2: Player; group: Group };
type MatchFull = Match & {
  pairA: PairWithPlayers;
  pairB: PairWithPlayers;
  court: Court | null;
  group: Group;
};

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}
```

Replace：

```typescript
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { colorForIndex } from '@/lib/badge-colors';
import type { Court, Group, Match, Pair, Player, Tournament } from '@prisma/client';

type PairWithPlayers = Pair & { player1: Player; player2: Player; group: Group };
type MatchFull = Match & {
  pairA: PairWithPlayers;
  pairB: PairWithPlayers;
  court: Court | null;
  group: Group;
};

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}

function GroupBadge({ name, order }: { name: string; order: number }) {
  return <Badge variant="outline" className={colorForIndex(order - 1)}>{name}</Badge>;
}

function CourtBadge({ name, order }: { name: string; order: number }) {
  return <Badge variant="outline" className={colorForIndex(order - 1)}>{name}</Badge>;
}

// 會內賽一場比賽橫跨兩組，兩組各自用自己的顏色，不是整條標題單一顏色。
function PairingHeader({ matches, format }: { matches: MatchFull[]; format: 'friendly' | 'club' }) {
  const m = matches[0];
  if (format === 'friendly') {
    return <GroupBadge name={`${m.group.name} 組`} order={m.group.displayOrder ?? 1} />;
  }
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <span className="inline-flex items-center gap-1.5">
      <GroupBadge name={`${first.name} 組`} order={first.displayOrder ?? 1} />
      <span className="text-xs text-muted-foreground">vs</span>
      <GroupBadge name={`${second.name} 組`} order={second.displayOrder ?? 1} />
    </span>
  );
}
```

- [ ] **Step 6: `PairingBlocks` 的標題跟場地徽章改用有顏色的版本**

Find：

```typescript
function PairingBlocks({ matches, format }: { matches: MatchFull[]; format: 'friendly' | 'club' }) {
  return (
    <div className="space-y-4">
      {groupByPairing(matches, format).map(([key, block]) => (
        <Card key={key} className="p-3">
          <div className="mb-2 font-semibold">{block.label}</div>
          <div className="grid gap-2 md:grid-cols-2">
            {block.matches.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
                  {pairLabel(m.pairA)} <span className="mx-1">vs</span> {pairLabel(m.pairB)}
                </div>
                {m.court && <Badge variant="outline" className="text-xs">{m.court.name}</Badge>}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
```

Replace：

```typescript
function PairingBlocks({ matches, format }: { matches: MatchFull[]; format: 'friendly' | 'club' }) {
  return (
    <div className="space-y-4">
      {groupByPairing(matches, format).map(([key, block]) => (
        <Card key={key} className="p-3">
          <div className="mb-2">
            <PairingHeader matches={block.matches} format={format} />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {block.matches.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
                  {pairLabel(m.pairA)} <span className="mx-1">vs</span> {pairLabel(m.pairB)}
                </div>
                {m.court && <CourtBadge name={m.court.name} order={m.court.displayOrder ?? 1} />}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 8: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/lib/badge-colors.ts src/components/admin/section-matches.tsx`
Expected: no errors.

- [ ] **Step 9: Run the full unit suite**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit`
Expected: all tests pass (44 total: 41 pre-existing + 3 new `badge-colors.test.ts` tests).

- [ ] **Step 10: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/lib/badge-colors.ts tests/unit/badge-colors.test.ts src/components/admin/section-matches.tsx
git commit -m "feat(matches): color-code group/court badges on the schedule page"
```

---

## Task 3: 套用顏色到計分頁

**Files:**
- Modify: `src/components/admin/section-scoring.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/admin/section-scoring.tsx` in full before editing — match every edit below against the exact current text.

- [ ] **Step 2: import 色盤，加上 `GroupBadge`/`CourtBadge`/`PairingHeader`**

Find：

```typescript
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Court, Group, Match, Pair, Player, Tournament } from '@prisma/client';

type PairWithPlayers = Pair & { player1: Player; player2: Player; group: Group };
type MatchFull = Match & {
  pairA: PairWithPlayers;
  pairB: PairWithPlayers;
  court: Court | null;
  group: Group;
};

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}

type Block = { key: string; title: string; order: number; matches: MatchFull[] };
```

Replace：

```typescript
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { colorForIndex } from '@/lib/badge-colors';
import type { Court, Group, Match, Pair, Player, Tournament } from '@prisma/client';

type PairWithPlayers = Pair & { player1: Player; player2: Player; group: Group };
type MatchFull = Match & {
  pairA: PairWithPlayers;
  pairB: PairWithPlayers;
  court: Court | null;
  group: Group;
};

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}

function GroupBadge({ name, order }: { name: string; order: number }) {
  return <Badge variant="outline" className={colorForIndex(order - 1)}>{name}</Badge>;
}

function CourtBadge({ name, order }: { name: string; order: number }) {
  return <Badge variant="outline" className={colorForIndex(order - 1)}>{name}</Badge>;
}

// 會內賽一場比賽橫跨兩組，兩組各自用自己的顏色，不是整條標題單一顏色。
function PairingHeader({ matches, format }: { matches: MatchFull[]; format: 'friendly' | 'club' }) {
  const m = matches[0];
  if (format === 'friendly') {
    return <GroupBadge name={`${m.group.name} 組`} order={m.group.displayOrder ?? 1} />;
  }
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <span className="inline-flex items-center gap-1.5">
      <GroupBadge name={`${first.name} 組`} order={first.displayOrder ?? 1} />
      <span className="text-xs text-muted-foreground">vs</span>
      <GroupBadge name={`${second.name} 組`} order={second.displayOrder ?? 1} />
    </span>
  );
}

type Block = { key: string; title: string; order: number; matches: MatchFull[] };
```

- [ ] **Step 3: `BlockSection` 依 `mode` 顯示分組或場地的彩色標題，`ScoreRow` 內的徽章也換成彩色版**

Find：

```typescript
function BlockSection({
  block,
  revision,
  format,
}: {
  block: Block;
  revision: number;
  format: 'friendly' | 'club';
}) {
  const completed = block.matches.filter((m) => m.status === 'completed').length;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-base font-semibold">{block.title}</div>
        <div className="text-xs text-muted-foreground">
          {completed} / {block.matches.length} 場已完成
        </div>
      </div>
      <div className="grid gap-2">
        {block.matches.map((m) => (
          <ScoreRow key={m.id} match={m} revision={revision} format={format} />
        ))}
      </div>
    </div>
  );
}

type GroupingMode = 'group' | 'court';
```

Replace：

```typescript
function BlockSection({
  block,
  revision,
  format,
  mode,
}: {
  block: Block;
  revision: number;
  format: 'friendly' | 'club';
  mode: GroupingMode;
}) {
  const completed = block.matches.filter((m) => m.status === 'completed').length;
  const first = block.matches[0];
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-base font-semibold">
          {mode === 'court' ? (
            first.court ? (
              <CourtBadge name={first.court.name} order={first.court.displayOrder ?? 1} />
            ) : (
              block.title
            )
          ) : (
            <PairingHeader matches={block.matches} format={format} />
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {completed} / {block.matches.length} 場已完成
        </div>
      </div>
      <div className="grid gap-2">
        {block.matches.map((m) => (
          <ScoreRow key={m.id} match={m} revision={revision} format={format} />
        ))}
      </div>
    </div>
  );
}

type GroupingMode = 'group' | 'court';
```

- [ ] **Step 4: 每個 `BlockSection` 呼叫都加上 `mode` prop**

Find：

```tsx
      <div className="space-y-4 border-l-4 border-l-red-500 pl-4">
        {mode === 'group' && tournament.format === 'club'
          ? waveBlocks.map((wb) => (
              <div key={wb.wave}>
                <div className="mb-2 text-lg font-semibold">{wb.title}</div>
                <div className="space-y-4 pl-3">
                  {wb.blocks.map((b) => (
                    <BlockSection key={b.key} block={b} revision={revision} format={tournament.format} />
                  ))}
                </div>
              </div>
            ))
          : blocks.map((b) => (
              <BlockSection key={b.key} block={b} revision={revision} format={tournament.format} />
            ))}
      </div>
```

Replace：

```tsx
      <div className="space-y-4 border-l-4 border-l-red-500 pl-4">
        {mode === 'group' && tournament.format === 'club'
          ? waveBlocks.map((wb) => (
              <div key={wb.wave}>
                <div className="mb-2 text-lg font-semibold">{wb.title}</div>
                <div className="space-y-4 pl-3">
                  {wb.blocks.map((b) => (
                    <BlockSection key={b.key} block={b} revision={revision} format={tournament.format} mode={mode} />
                  ))}
                </div>
              </div>
            ))
          : blocks.map((b) => (
              <BlockSection key={b.key} block={b} revision={revision} format={tournament.format} mode={mode} />
            ))}
      </div>
```

- [ ] **Step 5: `ScoreRow` 內的分組／場地徽章換成彩色版**

Find：

```tsx
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{format === 'club' ? pairingOf(match).label : match.group.name}#{match.matchOrder}</Badge>
        {match.court && <Badge variant="outline">{match.court.name}</Badge>}
```

Replace：

```tsx
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1">
          <PairingHeader matches={[match]} format={format} />
          <span className="text-muted-foreground">#{match.matchOrder}</span>
        </span>
        {match.court && <CourtBadge name={match.court.name} order={match.court.displayOrder ?? 1} />}
```

- [ ] **Step 6: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/admin/section-scoring.tsx`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/admin/section-scoring.tsx
git commit -m "feat(scoring): color-code group/court badges on the scoring page"
```

---

## Task 4: 套用顏色到觀眾頁

**Files:**
- Modify: `src/components/viewer/matches-tab.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/viewer/matches-tab.tsx` in full before editing — match every edit below against the exact current text.

- [ ] **Step 2: import 色盤，加上 `GroupBadge`/`CourtBadge`/`PairingHeader`，`PairingCard` 改用彩色標題**

Find：

```typescript
import { api } from '@/lib/api-client';
import type { Match, Pair, Player, Court, Group } from '@prisma/client';
import { MatchGraph } from '@/components/viewer/match-graph';

type PairWithPlayers = Pair & { player1: Player; player2: Player; group: Group };
type MatchFull = Match & {
  pairA: PairWithPlayers;
  pairB: PairWithPlayers;
  court: Court | null;
  group: Group;
};

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}

function PairingCard({
  block,
  format,
}: {
  block: { label: string; matches: MatchFull[] };
  format: 'friendly' | 'club';
}) {
  const completed = block.matches.filter((m) => m.status === 'completed').length;
  const total = block.matches.length;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <div className="text-lg font-semibold">{block.label}</div>
        <div className="text-xs text-muted-foreground">
          {completed} / {total} 場已完成
        </div>
      </div>
      <MatchList matches={block.matches} showGroup={false} format={format} />
    </Card>
  );
}
```

Replace：

```typescript
import { api } from '@/lib/api-client';
import { colorForIndex } from '@/lib/badge-colors';
import type { Match, Pair, Player, Court, Group } from '@prisma/client';
import { MatchGraph } from '@/components/viewer/match-graph';

type PairWithPlayers = Pair & { player1: Player; player2: Player; group: Group };
type MatchFull = Match & {
  pairA: PairWithPlayers;
  pairB: PairWithPlayers;
  court: Court | null;
  group: Group;
};

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}

function GroupBadge({ name, order }: { name: string; order: number }) {
  return <Badge variant="outline" className={colorForIndex(order - 1)}>{name}</Badge>;
}

function CourtBadge({ name, order }: { name: string; order: number }) {
  return <Badge variant="outline" className={colorForIndex(order - 1)}>{name}</Badge>;
}

// 會內賽一場比賽橫跨兩組，兩組各自用自己的顏色，不是整條標題單一顏色。
function PairingHeader({ matches, format }: { matches: MatchFull[]; format: 'friendly' | 'club' }) {
  const m = matches[0];
  if (format === 'friendly') {
    return <GroupBadge name={`${m.group.name} 組`} order={m.group.displayOrder ?? 1} />;
  }
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <span className="inline-flex items-center gap-1.5">
      <GroupBadge name={`${first.name} 組`} order={first.displayOrder ?? 1} />
      <span className="text-xs text-muted-foreground">vs</span>
      <GroupBadge name={`${second.name} 組`} order={second.displayOrder ?? 1} />
    </span>
  );
}

function PairingCard({
  block,
  format,
}: {
  block: { label: string; matches: MatchFull[] };
  format: 'friendly' | 'club';
}) {
  const completed = block.matches.filter((m) => m.status === 'completed').length;
  const total = block.matches.length;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <PairingHeader matches={block.matches} format={format} />
        <div className="text-xs text-muted-foreground">
          {completed} / {total} 場已完成
        </div>
      </div>
      <MatchList matches={block.matches} showGroup={false} format={format} />
    </Card>
  );
}
```

- [ ] **Step 3: 場地列表視圖的標題換成彩色場地徽章**

Find：

```tsx
      {view === 'court' &&
        byCourt.map((c) => {
          const completed = c.matches.filter((m) => m.status === 'completed').length;
          const total = c.matches.length;
          return (
            <Card key={c.key} className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-lg font-semibold">{c.courtName}</div>
                <div className="text-xs text-muted-foreground">
                  {completed} / {total} 場已完成
                </div>
              </div>
              <MatchList matches={c.matches} showGroup format={format} />
            </Card>
          );
        })}
```

Replace：

```tsx
      {view === 'court' &&
        byCourt.map((c) => {
          const completed = c.matches.filter((m) => m.status === 'completed').length;
          const total = c.matches.length;
          return (
            <Card key={c.key} className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-lg font-semibold">
                  {c.courtOrder !== 9999 ? (
                    <CourtBadge name={c.courtName} order={c.courtOrder} />
                  ) : (
                    c.courtName
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {completed} / {total} 場已完成
                </div>
              </div>
              <MatchList matches={c.matches} showGroup format={format} />
            </Card>
          );
        })}
```

- [ ] **Step 4: `MatchList` 內每場比賽的分組／場地徽章換成彩色版**

Find：

```tsx
            <div className="text-sm">
              <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
              {showGroup && (
                <Badge variant="outline" className="mr-1 text-xs">
                  {format === 'club' ? pairingOf(m).label : m.group.name}
                </Badge>
              )}
              <span className="font-medium">{pairLabel(m.pairA)}</span>
              <span className="mx-2">vs</span>
              <span className="font-medium">{pairLabel(m.pairB)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!showGroup && m.court && (
                <Badge variant="outline" className="text-xs">
                  {m.court.name}
                </Badge>
              )}
```

Replace：

```tsx
            <div className="text-sm">
              <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
              {showGroup && (
                <span className="mr-1 inline-flex items-center">
                  <PairingHeader matches={[m]} format={format} />
                </span>
              )}
              <span className="font-medium">{pairLabel(m.pairA)}</span>
              <span className="mx-2">vs</span>
              <span className="font-medium">{pairLabel(m.pairB)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!showGroup && m.court && (
                <CourtBadge name={m.court.name} order={m.court.displayOrder ?? 1} />
              )}
```

- [ ] **Step 5: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/viewer/matches-tab.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/viewer/matches-tab.tsx
git commit -m "feat(viewer): color-code group/court badges on the viewer schedule page"
```

---

## Task 5: 觀眾頁進行中比賽全螢幕放大

**Files:**
- Create: `src/components/viewer/fullscreen-match.tsx`
- Modify: `src/components/viewer/matches-tab.tsx`

- [ ] **Step 1: 建立全螢幕元件**

Create `src/components/viewer/fullscreen-match.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { Match, Pair, Player } from '@prisma/client';

type PairWithPlayers = Pair & { player1: Player; player2: Player };
type MatchLike = Match & { pairA: PairWithPlayers; pairB: PairWithPlayers };

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

/**
 * A button that puts a dedicated big-score overlay into the browser's
 * native fullscreen — for showing one in-progress match on a TV/projector.
 * Esc (browser-native) exits fullscreen without going through the close
 * button, so this listens for `fullscreenchange` rather than tracking
 * state purely from click handlers.
 */
export function FullscreenMatchButton({ match }: { match: MatchLike }) {
  const [active, setActive] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onChange() {
      setActive(document.fullscreenElement === overlayRef.current);
    }
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  function open() {
    // ponytail: 不支援 Fullscreen API 的瀏覽器（極少數）— promise 會
    // reject，直接忽略即可，這是漸進增強，不是必要功能。
    overlayRef.current?.requestFullscreen().catch(() => {});
  }

  function close() {
    if (document.fullscreenElement) document.exitFullscreen();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        title="全螢幕放大"
        aria-label="全螢幕放大"
        className="flex h-6 w-6 items-center justify-center rounded border text-xs hover:bg-muted"
      >
        ⛶
      </button>
      <div
        ref={overlayRef}
        className={`flex-col items-center justify-center gap-8 bg-slate-900 p-8 text-white ${
          active ? 'fixed inset-0 z-50 flex' : 'hidden'
        }`}
      >
        <div className="grid w-full max-w-5xl grid-cols-2 gap-8 text-center">
          <div>
            <div className="mb-4 text-3xl font-semibold">{pairLabel(match.pairA)}</div>
            <div className="font-mono text-8xl font-bold tabular-nums">{match.scoreA}</div>
          </div>
          <div>
            <div className="mb-4 text-3xl font-semibold">{pairLabel(match.pairB)}</div>
            <div className="font-mono text-8xl font-bold tabular-nums">{match.scoreB}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          className="rounded border border-white/30 px-4 py-2 text-sm hover:bg-white/10"
        >
          離開全螢幕
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Read `matches-tab.tsx`, wire the button into `MatchList`'s in-progress branch**

Read `src/components/viewer/matches-tab.tsx` in full before editing.

Find：

```typescript
import { api } from '@/lib/api-client';
import { colorForIndex } from '@/lib/badge-colors';
import type { Match, Pair, Player, Court, Group } from '@prisma/client';
import { MatchGraph } from '@/components/viewer/match-graph';
```

Replace：

```typescript
import { api } from '@/lib/api-client';
import { colorForIndex } from '@/lib/badge-colors';
import type { Match, Pair, Player, Court, Group } from '@prisma/client';
import { MatchGraph } from '@/components/viewer/match-graph';
import { FullscreenMatchButton } from '@/components/viewer/fullscreen-match';
```

Find：

```tsx
              {done ? (
                <span className="whitespace-nowrap rounded bg-emerald-600 px-2 py-0.5 font-mono text-sm font-bold text-white">
                  {m.scoreA} - {m.scoreB}
                </span>
              ) : playing ? (
                <span className="whitespace-nowrap rounded bg-amber-500 px-2 py-0.5 font-mono text-sm font-bold text-white">
                  {m.scoreA} - {m.scoreB}
                </span>
              ) : (
```

Replace：

```tsx
              {done ? (
                <span className="whitespace-nowrap rounded bg-emerald-600 px-2 py-0.5 font-mono text-sm font-bold text-white">
                  {m.scoreA} - {m.scoreB}
                </span>
              ) : playing ? (
                <>
                  <FullscreenMatchButton match={m} />
                  <span className="whitespace-nowrap rounded bg-amber-500 px-2 py-0.5 font-mono text-sm font-bold text-white">
                    {m.scoreA} - {m.scoreB}
                  </span>
                </>
              ) : (
```

- [ ] **Step 3: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors. (`MatchFull`'s `pairA`/`pairB` are a structural superset of `FullscreenMatchButton`'s `MatchLike` — no cast needed.)

- [ ] **Step 4: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/viewer/fullscreen-match.tsx src/components/viewer/matches-tab.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/viewer/fullscreen-match.tsx src/components/viewer/matches-tab.tsx
git commit -m "feat(viewer): fullscreen an in-progress match's score for TV/projector display"
```

---

## Task 6: Full verification, push, manual walkthrough handoff

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite + typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx vitest run tests/unit`
Expected: no type errors; all 44 tests pass (41 pre-existing + 3 new `badge-colors.test.ts` tests from Task 2 — nothing else in this plan touches unit-tested pure-logic modules).

- [ ] **Step 2: Push**

```bash
cd "C:\Private\badminton-game"
git push
```

- [ ] **Step 3: Manual walkthrough**

1. 分組頁（會內賽）：按「各組等級均分」兩次，確認兩次分出的組別成員不完全一樣（等級分佈仍然均勻）。
2. 賽程頁／計分頁／觀眾頁：確認同一組（例如 A 組）在三個畫面顯示的顏色一致；場地也是同一個場地在三個畫面顏色一致；會內賽的「A組 vs D組」配對標籤，A、D 各自顯示自己的顏色。
3. 觀眾頁：找一場已經在計分（有比分但未完成）的比賽，點擊放大按鈕，確認進入全螢幕、大字體顯示雙方隊伍跟比分；按 Esc 或畫面上的關閉鈕，確認正確退出全螢幕回到列表；計分中比分更新時，全螢幕畫面（若還開著）分數也要跟著更新。

- [ ] **Step 4: If the walkthrough passes, this feature is done**

No further step — this is the final task in the plan.

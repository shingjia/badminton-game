# 會內賽輪轉搭檔賽制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second tournament format (`club`，會內賽) alongside the existing fixed-pair round-robin (`friendly`，友誼賽): players rotate partners within a group instead of keeping one fixed doubles partner for the whole round robin.

**Architecture:** Reuse the existing Group/Pair/Match tables and admin/viewer UI wholesale. Add a `Tournament.format` enum column set once at creation. New pure-function algorithm module (`lib/rotation.ts`) computes the A/B level-balanced split and the circular-partner match schedule; the existing `/api/tournaments/:id/matches/generate` route branches on `format` to either read pre-built Pairs (friendly, unchanged) or create fresh one-off Pair rows per match (club, new). A second pure-function module (`lib/player-standings.ts`) aggregates completed matches into per-player win/loss records for club tournaments, computed in TypeScript from Prisma-fetched match rows rather than a SQL view, so it's unit-testable (unlike the existing `pair_standings` SQL view, which has no test coverage in this codebase). Viewer components hide the pieces that don't make sense for a rotating-partner format (pair list on the groups tab, round-robin graph on the matches tab).

**Tech Stack:** Next.js (App Router) API routes, Prisma + PostgreSQL, Vitest for unit tests, React client components.

**Design doc:** `docs/superpowers/specs/2026-08-19-club-format-rotation-design.md`

---

## Task 1: Add `Tournament.format` column

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260819110000_add_tournament_format/migration.sql`

- [ ] **Step 1: Add the enum and column to the schema**

In `prisma/schema.prisma`, find the `enum MatchStatus { ... }` block (near the top) and add a new enum right after it:

```prisma
enum TournamentFormat {
  friendly
  club
}
```

In the `model Tournament { ... }` block, add the field right after `groupCount`:

```prisma
model Tournament {
  id            String           @id @default(cuid())
  name          String
  status        TournamentStatus @default(draft)
  groupCount    Int              @default(4)
  format        TournamentFormat @default(friendly)
  pointsPerGame Int              @default(21)
  ...
```

- [ ] **Step 2: Write the migration SQL by hand**

Create `prisma/migrations/20260819110000_add_tournament_format/migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "TournamentFormat" AS ENUM ('friendly', 'club');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "format" "TournamentFormat" NOT NULL DEFAULT 'friendly';
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `cd "C:\Private\badminton-game" && npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors.

- [ ] **Step 4: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors (nothing references `format` yet, this just confirms the client still compiles).

- [ ] **Step 5: Commit**

```bash
cd "C:\Private\badminton-game"
git add prisma/schema.prisma prisma/migrations/20260819110000_add_tournament_format
git commit -m "feat(db): add Tournament.format (friendly/club)"
```

---

## Task 2: `lib/player-standings.ts` — pure per-player standings aggregation

The existing friendly-format ranking (`pair_standings`) is a raw SQL view queried via `$queryRaw`, with no test coverage anywhere in this codebase (`tests/integration/` is empty — there's no DB-backed test infra to test a SQL view against). The design doc requires at least one unit test for the per-player ranking calculation, so this is computed in plain TypeScript instead of a second SQL view: fetch match rows via Prisma (already how the rest of the app reads data) and aggregate in JS, which is directly unit-testable.

**Files:**
- Create: `src/lib/player-standings.ts`
- Test: `tests/unit/player-standings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/player-standings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computePlayerStandings, type MatchResult } from '@/lib/player-standings';

describe('computePlayerStandings', () => {
  it('two players each play two matches, one win one loss', () => {
    // Alice partners Bob in match 1 (win), partners Carol in match 2 (loss).
    const matches: MatchResult[] = [
      {
        groupId: 'g1',
        status: 'completed',
        scoreA: 21,
        scoreB: 15,
        pairAPlayerIds: ['alice', 'bob'],
        pairBPlayerIds: ['dave', 'erin'],
      },
      {
        groupId: 'g1',
        status: 'completed',
        scoreA: 10,
        scoreB: 21,
        pairAPlayerIds: ['alice', 'carol'],
        pairBPlayerIds: ['dave', 'erin'],
      },
    ];
    const rows = computePlayerStandings(matches);
    const alice = rows.find((r) => r.playerId === 'alice')!;
    expect(alice.played).toBe(2);
    expect(alice.wins).toBe(1);
    expect(alice.losses).toBe(1);
    expect(alice.pointsFor).toBe(21 + 10);
    expect(alice.pointsAgainst).toBe(15 + 21);
    expect(alice.pointDiff).toBe((21 - 15) + (10 - 21));
  });

  it('ignores matches that are not completed', () => {
    const matches: MatchResult[] = [
      {
        groupId: 'g1',
        status: 'pending',
        scoreA: 5,
        scoreB: 3,
        pairAPlayerIds: ['alice', 'bob'],
        pairBPlayerIds: ['dave', 'erin'],
      },
    ];
    const rows = computePlayerStandings(matches);
    expect(rows.find((r) => r.playerId === 'alice')).toBeUndefined();
  });

  it('ranks within each group, ties share a rank (SQL RANK() semantics)', () => {
    const win = (a: string, b: string, c: string, d: string): MatchResult => ({
      groupId: 'g1',
      status: 'completed',
      scoreA: 21,
      scoreB: 10,
      pairAPlayerIds: [a, b],
      pairBPlayerIds: [c, d],
    });
    // alice+bob both win once (tied for 1st), carol+dave both lose once (tied for 3rd).
    const rows = computePlayerStandings([win('alice', 'bob', 'carol', 'dave')]);
    const byId = Object.fromEntries(rows.map((r) => [r.playerId, r]));
    expect(byId.alice.rank).toBe(1);
    expect(byId.bob.rank).toBe(1);
    expect(byId.carol.rank).toBe(3);
    expect(byId.dave.rank).toBe(3);
  });

  it('keeps groups separate', () => {
    const matches: MatchResult[] = [
      {
        groupId: 'g1',
        status: 'completed',
        scoreA: 21,
        scoreB: 10,
        pairAPlayerIds: ['alice', 'bob'],
        pairBPlayerIds: ['carol', 'dave'],
      },
      {
        groupId: 'g2',
        status: 'completed',
        scoreA: 21,
        scoreB: 10,
        pairAPlayerIds: ['erin', 'frank'],
        pairBPlayerIds: ['grace', 'heidi'],
      },
    ];
    const rows = computePlayerStandings(matches);
    expect(rows.find((r) => r.playerId === 'alice')!.groupId).toBe('g1');
    expect(rows.find((r) => r.playerId === 'erin')!.groupId).toBe('g2');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/player-standings.test.ts`
Expected: FAIL — `Cannot find module '@/lib/player-standings'`.

- [ ] **Step 3: Implement `computePlayerStandings`**

Create `src/lib/player-standings.ts`:

```typescript
export type MatchResult = {
  groupId: string;
  status: 'pending' | 'completed';
  scoreA: number;
  scoreB: number;
  pairAPlayerIds: [string, string];
  pairBPlayerIds: [string, string];
};

export type PlayerStandingRow = {
  playerId: string;
  groupId: string;
  wins: number;
  losses: number;
  played: number;
  pointDiff: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
};

type UnrankedRow = Omit<PlayerStandingRow, 'rank'>;

/**
 * Aggregates completed matches into per-player win/loss records, ranked
 * within each group. A club-format match has no stable "team" — each
 * player's own perspective (their side's score vs the other side's) is
 * tallied individually, so the same player accumulates stats across every
 * match they appeared in, regardless of who they were partnered with.
 */
export function computePlayerStandings(matches: MatchResult[]): PlayerStandingRow[] {
  const byPlayer = new Map<string, UnrankedRow>();

  function row(playerId: string, groupId: string): UnrankedRow {
    let r = byPlayer.get(playerId);
    if (!r) {
      r = { playerId, groupId, wins: 0, losses: 0, played: 0, pointDiff: 0, pointsFor: 0, pointsAgainst: 0 };
      byPlayer.set(playerId, r);
    }
    return r;
  }

  function tally(playerIds: [string, string], groupId: string, myScore: number, oppScore: number) {
    for (const playerId of playerIds) {
      const r = row(playerId, groupId);
      r.played++;
      r.pointsFor += myScore;
      r.pointsAgainst += oppScore;
      r.pointDiff += myScore - oppScore;
      if (myScore > oppScore) r.wins++;
      else if (myScore < oppScore) r.losses++;
    }
  }

  for (const m of matches) {
    if (m.status !== 'completed') continue;
    tally(m.pairAPlayerIds, m.groupId, m.scoreA, m.scoreB);
    tally(m.pairBPlayerIds, m.groupId, m.scoreB, m.scoreA);
  }

  const byGroup = new Map<string, UnrankedRow[]>();
  for (const r of byPlayer.values()) {
    const arr = byGroup.get(r.groupId) ?? [];
    arr.push(r);
    byGroup.set(r.groupId, arr);
  }

  const result: PlayerStandingRow[] = [];
  for (const rows of byGroup.values()) {
    result.push(...rankGroup(rows));
  }
  return result;
}

function rankGroup(rows: UnrankedRow[]): PlayerStandingRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.pointsFor - a.pointsFor ||
      a.pointsAgainst - b.pointsAgainst,
  );
  const result: PlayerStandingRow[] = [];
  let rank = 0;
  let prevKey: string | null = null;
  sorted.forEach((r, i) => {
    const key = `${r.wins}|${r.losses}|${r.pointsFor}|${r.pointsAgainst}`;
    if (key !== prevKey) rank = i + 1;
    prevKey = key;
    result.push({ ...r, rank });
  });
  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/player-standings.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/lib/player-standings.ts tests/unit/player-standings.test.ts
git commit -m "feat: add computePlayerStandings for club-format per-player ranking"
```

---

## Task 3: `lib/rotation.ts` — split a group into two level-balanced sides

**Files:**
- Create: `src/lib/rotation.ts`
- Test: `tests/unit/rotation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/rotation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { splitByLevel2 } from '@/lib/rotation';

describe('splitByLevel2', () => {
  it('splits players evenly between two sides by level', () => {
    const players = [
      { id: 'a1', level: '1' }, { id: 'a2', level: '1' },
      { id: 'b1', level: '2' }, { id: 'b2', level: '2' },
      { id: 'c1', level: '3' }, { id: 'c2', level: '3' },
    ];
    const { sideA, sideB } = splitByLevel2(players);
    expect(sideA).toHaveLength(3);
    expect(sideB).toHaveLength(3);
    // every level contributes one player to each side
    const levelOf = (id: string) => players.find((p) => p.id === id)!.level;
    expect(new Set(sideA.map(levelOf))).toEqual(new Set(['1', '2', '3']));
    expect(new Set(sideB.map(levelOf))).toEqual(new Set(['1', '2', '3']));
  });

  it('throws unequal_sides when the split is not even', () => {
    const players = [
      { id: 'a', level: '1' }, { id: 'b', level: '1' }, { id: 'c', level: '1' },
      { id: 'd', level: '2' }, { id: 'e', level: '2' },
    ];
    expect(() => splitByLevel2(players)).toThrow('unequal_sides');
  });

  it('throws side_too_small when a side would have fewer than 3 players', () => {
    const players = [
      { id: 'a', level: '1' }, { id: 'b', level: '1' },
      { id: 'c', level: '2' }, { id: 'd', level: '2' },
    ];
    expect(() => splitByLevel2(players)).toThrow('side_too_small');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/rotation.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rotation'` (file doesn't exist yet).

- [ ] **Step 3: Implement `splitByLevel2`**

Create `src/lib/rotation.ts`:

```typescript
export type LevelPlayer = { id: string; level: string | null };
export type SeededPlayer = { id: string; seed: number | null };

/**
 * Splits a group's players into two level-balanced sides (round-robin by
 * level, same distribution logic as the "各組等級均分" grouping method,
 * but with exactly 2 buckets).
 * Throws 'unequal_sides' if the two sides don't land on equal counts,
 * 'side_too_small' if either side would have fewer than 3 players
 * (fewer than 3 makes the circular partner rotation degenerate — with
 * only 2 players the "circle" is the same pair twice).
 */
export function splitByLevel2(players: LevelPlayer[]): { sideA: string[]; sideB: string[] } {
  const byLevel = new Map<string, string[]>();
  for (const p of players) {
    const lvl = p.level ?? 'unassigned';
    const arr = byLevel.get(lvl) ?? [];
    arr.push(p.id);
    byLevel.set(lvl, arr);
  }

  const buckets: string[][] = [[], []];
  let cursor = 0;
  for (const lvl of [...byLevel.keys()].sort()) {
    for (const id of byLevel.get(lvl)!) {
      buckets[cursor % 2].push(id);
      cursor++;
    }
  }

  const [sideA, sideB] = buckets;
  if (sideA.length !== sideB.length) throw new Error('unequal_sides');
  if (sideA.length < 3) throw new Error('side_too_small');
  return { sideA, sideB };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/rotation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/lib/rotation.ts tests/unit/rotation.test.ts
git commit -m "feat: add splitByLevel2 for club-format A/B side split"
```

---

## Task 4: `lib/rotation.ts` — circular partner rotation + round assignment

**Files:**
- Modify: `src/lib/rotation.ts`
- Test: `tests/unit/rotation.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/rotation.test.ts`:

```typescript
import { rotationSchedule } from '@/lib/rotation';

describe('rotationSchedule', () => {
  it('forms circular adjacent partnerships and pairs side A[k] vs side B[k]', () => {
    const sideA = [
      { id: 'a1', seed: 1 }, { id: 'a2', seed: 2 },
      { id: 'a3', seed: 3 }, { id: 'a4', seed: 4 },
    ];
    const sideB = [
      { id: 'b1', seed: 1 }, { id: 'b2', seed: 2 },
      { id: 'b3', seed: 3 }, { id: 'b4', seed: 4 },
    ];
    const drafts = rotationSchedule(sideA, sideB);
    expect(drafts).toHaveLength(4);
    expect(drafts[0].sideAPlayers).toEqual(['a1', 'a2']);
    expect(drafts[1].sideAPlayers).toEqual(['a2', 'a3']);
    expect(drafts[2].sideAPlayers).toEqual(['a3', 'a4']);
    expect(drafts[3].sideAPlayers).toEqual(['a4', 'a1']); // wraps around
    expect(drafts[0].sideBPlayers).toEqual(['b1', 'b2']);
    expect(drafts[3].sideBPlayers).toEqual(['b4', 'b1']);
    drafts.forEach((d, i) => expect(d.matchOrder).toBe(i + 1));
  });

  it('sorts by seed before forming partnerships (unseeded players sort last)', () => {
    const sideA = [
      { id: 'x', seed: null }, { id: 'a1', seed: 1 }, { id: 'a2', seed: 2 },
    ];
    const sideB = [
      { id: 'b1', seed: 1 }, { id: 'b2', seed: 2 }, { id: 'y', seed: null },
    ];
    const drafts = rotationSchedule(sideA, sideB);
    // ordered by seed: a1, a2, x -> partnerships (a1,a2) (a2,x) (x,a1)
    expect(drafts[0].sideAPlayers).toEqual(['a1', 'a2']);
    expect(drafts[1].sideAPlayers).toEqual(['a2', 'x']);
    expect(drafts[2].sideAPlayers).toEqual(['x', 'a1']);
  });

  it('assigns 2 alternating rounds when side size is even, with no shared player in the same round', () => {
    const side = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, seed: i + 1 }));
    const drafts = rotationSchedule(side('a', 6), side('b', 6));
    const rounds = new Set(drafts.map((d) => d.roundNumber));
    expect(rounds).toEqual(new Set([1, 2]));
    assertNoSameRoundPlayerOverlap(drafts);
  });

  it('assigns 3 rounds when side size is odd, with no shared player in the same round', () => {
    const side = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, seed: i + 1 }));
    const drafts = rotationSchedule(side('a', 5), side('b', 5));
    const rounds = new Set(drafts.map((d) => d.roundNumber));
    expect(rounds).toEqual(new Set([1, 2, 3]));
    assertNoSameRoundPlayerOverlap(drafts);
  });

  it('throws unequal_sides / side_too_small like splitByLevel2', () => {
    expect(() =>
      rotationSchedule([{ id: 'a', seed: 1 }], [{ id: 'b', seed: 1 }]),
    ).toThrow('side_too_small');
    expect(() =>
      rotationSchedule(
        [{ id: 'a', seed: 1 }, { id: 'b', seed: 2 }, { id: 'c', seed: 3 }],
        [{ id: 'd', seed: 1 }, { id: 'e', seed: 2 }],
      ),
    ).toThrow('unequal_sides');
  });
});

function assertNoSameRoundPlayerOverlap(
  drafts: { sideAPlayers: [string, string]; sideBPlayers: [string, string]; roundNumber: number }[],
) {
  const byRound = new Map<number, typeof drafts>();
  for (const d of drafts) {
    const arr = byRound.get(d.roundNumber) ?? [];
    arr.push(d);
    byRound.set(d.roundNumber, arr);
  }
  for (const [, matchesInRound] of byRound) {
    const seen = new Set<string>();
    for (const m of matchesInRound) {
      for (const id of [...m.sideAPlayers, ...m.sideBPlayers]) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/rotation.test.ts`
Expected: FAIL — `rotationSchedule is not exported` / not defined.

- [ ] **Step 3: Implement `rotationSchedule`**

Append to `src/lib/rotation.ts`:

```typescript
export type RotationMatchDraft = {
  sideAPlayers: [string, string];
  sideBPlayers: [string, string];
  roundNumber: number;
  matchOrder: number;
};

/**
 * Orders each side by 棒次 (seed, nulls sort last), forms n circular
 * adjacent partnerships per side (partnership[i] = side[i] + side[i+1],
 * wrapping), and pairs side A's k-th partnership against side B's k-th
 * partnership — n matches total.
 *
 * Round assignment: match k shares a player with match k-1 and k+1
 * (adjacent partnerships overlap by one player), forming a cycle graph.
 * Even n is 2-colorable (alternate rounds); odd n needs a 3rd round for
 * the last match, since an odd cycle isn't 2-colorable.
 *
 * Throws 'unequal_sides' / 'side_too_small' — same rules as splitByLevel2,
 * checked again here since this can be called directly.
 */
export function rotationSchedule(sideA: SeededPlayer[], sideB: SeededPlayer[]): RotationMatchDraft[] {
  if (sideA.length !== sideB.length) throw new Error('unequal_sides');
  const n = sideA.length;
  if (n < 3) throw new Error('side_too_small');

  const orderedA = orderBySeed(sideA);
  const orderedB = orderBySeed(sideB);
  const partnershipsA = circularPartnerships(orderedA);
  const partnershipsB = circularPartnerships(orderedB);

  const drafts: RotationMatchDraft[] = [];
  for (let k = 0; k < n; k++) {
    const roundNumber = n % 2 === 0 ? (k % 2) + 1 : k < n - 1 ? (k % 2) + 1 : 3;
    drafts.push({
      sideAPlayers: partnershipsA[k],
      sideBPlayers: partnershipsB[k],
      roundNumber,
      matchOrder: k + 1,
    });
  }
  return drafts;
}

function orderBySeed(players: SeededPlayer[]): string[] {
  return [...players]
    .sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity))
    .map((p) => p.id);
}

function circularPartnerships(ordered: string[]): [string, string][] {
  const n = ordered.length;
  return ordered.map((id, i) => [id, ordered[(i + 1) % n]] as [string, string]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/rotation.test.ts`
Expected: PASS (8 tests total in the file).

- [ ] **Step 5: Typecheck and run the full unit suite**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx vitest run tests/unit`
Expected: no type errors; all tests pass (should now be 24: 16 previous + 8 new).

- [ ] **Step 6: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/lib/rotation.ts tests/unit/rotation.test.ts
git commit -m "feat: add rotationSchedule (circular partners + round coloring)"
```

---

## Task 5: Let tournament creation set the format

**Files:**
- Modify: `src/lib/schemas.ts`
- Modify: `src/app/api/tournaments/route.ts`
- Modify: `src/components/admin/create-tournament-dialog.tsx`

- [ ] **Step 1: Add `format` to `CreateTournament`**

In `src/lib/schemas.ts`, find:

```typescript
export const CreateTournament = z.object({
  name: z.string().trim().min(1).max(100),
  groupCount: z.number().int().min(1).max(26).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
});
```

Replace with:

```typescript
export const TournamentFormatEnum = z.enum(['friendly', 'club']);

export const CreateTournament = z.object({
  name: z.string().trim().min(1).max(100),
  groupCount: z.number().int().min(1).max(26).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
  format: TournamentFormatEnum.optional(),
});
```

- [ ] **Step 2: Pass `format` through on create**

In `src/app/api/tournaments/route.ts`, find:

```typescript
  const t = await prisma.tournament.create({
    data: {
      name: parsed.data.name,
      groupCount: parsed.data.groupCount ?? 4,
      pointsPerGame: parsed.data.pointsPerGame ?? 21,
    },
  });
```

Replace with:

```typescript
  const t = await prisma.tournament.create({
    data: {
      name: parsed.data.name,
      groupCount: parsed.data.groupCount ?? 4,
      pointsPerGame: parsed.data.pointsPerGame ?? 21,
      format: parsed.data.format ?? 'friendly',
    },
  });
```

- [ ] **Step 3: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Add the format picker to the create-tournament dialog**

In `src/components/admin/create-tournament-dialog.tsx`, add a `format` state and a radio-style picker. Replace the whole file:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

const FORMATS = [
  { key: 'friendly', label: '友誼賽', hint: '固定搭檔打完整個循環賽' },
  { key: 'club', label: '會內賽', hint: '組內搭檔輪轉，每場都換搭檔' },
] as const;

export function CreateTournamentDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [groupCount, setGroupCount] = useState(4);
  const [format, setFormat] = useState<(typeof FORMATS)[number]['key']>('friendly');

  async function submit() {
    try {
      const t = await api<{ id: string }>('/api/tournaments', {
        method: 'POST',
        body: { name, groupCount, format },
      });
      setOpen(false);
      router.push(`/admin/t/${t.id}`);
    } catch {
      toast({ title: '建立失敗', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>新增賽事</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增賽事</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">名稱</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gc">組數</Label>
            <Input
              id="gc"
              type="number"
              min={1}
              max={26}
              value={groupCount}
              onChange={(e) => setGroupCount(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>賽制（建立後不能改）</Label>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFormat(f.key)}
                  className={`rounded-md border p-2 text-left text-sm transition ${
                    format === f.key ? 'border-primary bg-primary/5' : 'border-input'
                  }`}
                >
                  <div className="font-medium">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <Button onClick={submit} disabled={!name.trim()} className="w-full">
            建立
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Typecheck and lint**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx eslint src/components/admin/create-tournament-dialog.tsx src/lib/schemas.ts src/app/api/tournaments/route.ts`
Expected: no type errors; no new lint errors beyond the project's existing `catch (e: any)` pattern (there isn't one in these files, so expect a clean pass).

- [ ] **Step 6: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/lib/schemas.ts src/app/api/tournaments/route.ts src/components/admin/create-tournament-dialog.tsx
git commit -m "feat: pick tournament format (友誼賽/會內賽) at creation"
```

---

## Task 6: Wire up "確認分組" for club tournaments (advance to in_progress without pairing)

Club format skips the pairing step entirely, so it needs a way to move from `grouping` to `in_progress` that doesn't depend on per-group pairing locks. `/api/tournaments/[id]/groups/lock` already does exactly this (validates every player is grouped and every group has ≥2 players, then advances status) and is currently unused by any UI — wire a button to it for club tournaments only.

**Files:**
- Modify: `src/components/admin/section-groups.tsx`

- [ ] **Step 1: Hide the pairing UI and add the confirm button for club format**

In `src/components/admin/section-groups.tsx`:

Add a function near the other action functions (after `lockPairing`):

```typescript
  async function confirmGrouping() {
    try {
      await api(`/api/tournaments/${tournament.id}/groups/lock`, { method: 'POST' });
      toast({ title: '分組已確認，可以到「賽程」分頁產生對戰' });
    } catch (e: any) {
      const code = e.body?.error;
      const msg =
        code === 'players_not_grouped'
          ? '還有球員沒有被分到任何一組'
          : code === 'group_too_small'
            ? '有一組人數少於 2 人'
            : undefined;
      toast({ title: '無法確認分組', description: msg ?? code, variant: 'destructive' });
    }
  }
```

Find the JSX block that renders the per-group pairing buttons:

```tsx
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  {PAIR_METHODS.map((m) => (
                    <Button
                      key={m.key}
                      size="sm"
                      variant="outline"
                      onClick={() => shuffle(g.id, m.key)}
                    >
                      {m.label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    disabled={isLocked || g.pairs.length === 0}
                    onClick={() => lockPairing(g.id)}
                  >
                    鎖定配對
                  </Button>
                </div>
              )}
```

Replace with (pairing buttons only for `friendly`; nothing rendered per-group for `club` since there's no per-group pairing step):

```tsx
              {canEdit && tournament.format === 'friendly' && (
                <div className="flex flex-wrap gap-2">
                  {PAIR_METHODS.map((m) => (
                    <Button
                      key={m.key}
                      size="sm"
                      variant="outline"
                      onClick={() => shuffle(g.id, m.key)}
                    >
                      {m.label}
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    disabled={isLocked || g.pairs.length === 0}
                    onClick={() => lockPairing(g.id)}
                  >
                    鎖定配對
                  </Button>
                </div>
              )}
```

Also hide the "配對" list block (it only has content for friendly tournaments pre-match-generation anyway, but club groups will accumulate one-off pairs once matches are generated — hide unconditionally for club so it never shows the confusing flattened list). Find:

```tsx
              {g.pairs.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">配對</div>
```

Replace with:

```tsx
              {tournament.format === 'friendly' && g.pairs.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">配對</div>
```

Finally, add a tournament-wide "確認分組" button for club format, next to the two grouping buttons at the top of the section. Find:

```tsx
        {canGenerate && (
          <>
            <Button onClick={generateByLevel} size="sm" disabled={players.length === 0}>
              依等級自動分組
            </Button>
            <Button
              onClick={generateMixed}
              size="sm"
              variant="outline"
              disabled={players.length === 0}
            >
              各組等級均分
            </Button>
          </>
        )}
```

Replace with:

```tsx
        {canGenerate && (
          <>
            <Button onClick={generateByLevel} size="sm" disabled={players.length === 0}>
              依等級自動分組
            </Button>
            <Button
              onClick={generateMixed}
              size="sm"
              variant="outline"
              disabled={players.length === 0}
            >
              各組等級均分
            </Button>
          </>
        )}
        {canEdit && tournament.format === 'club' && (
          <Button onClick={confirmGrouping} size="sm">
            確認分組，開始賽程
          </Button>
        )}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors. (`tournament.format` will typecheck once the Prisma client from Task 1 is generated — confirm it already ran `npx prisma generate`.)

- [ ] **Step 3: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/admin/section-groups.tsx
git commit -m "feat(groups): club format skips pairing, adds 確認分組 to advance to in_progress"
```

---

## Task 7: Club-format match generation

**Files:**
- Modify: `src/app/api/tournaments/[id]/matches/generate/route.ts`

- [ ] **Step 1: Rewrite the route to branch on `tournament.format`**

Replace the entire contents of `src/app/api/tournaments/[id]/matches/generate/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { roundRobinPairs } from '@/lib/algorithms/circle-method';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';
import { splitByLevel2, rotationSchedule } from '@/lib/rotation';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

// Existing pairs are read off the group (friendly). Rotation matches don't
// have pairs yet — the two players for each side are carried through and
// turned into fresh Pair rows inside the transaction.
type Draft = {
  tournamentId: string;
  groupId: string;
  roundNumber: number;
  matchOrder: number;
} & (
  | { kind: 'existing'; pairAId: string; pairBId: string }
  | { kind: 'rotation'; sideAPlayers: [string, string]; sideBPlayers: [string, string] }
);

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const statusErr = ensureStatus(tournament.status, ['in_progress']);
  if (statusErr) return statusErr;

  const groups = await prisma.group.findMany({
    where: { tournamentId: params.id },
    include: { pairs: true, players: true },
    orderBy: { displayOrder: 'asc' },
  });
  const courts = await prisma.court.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
  });

  if (groups.length === 0) return conflict('no_groups');

  const drafts: Draft[] = [];
  try {
    for (const g of groups) {
      if (tournament.format === 'club') {
        const { sideA, sideB } = splitByLevel2(g.players.map((p) => ({ id: p.id, level: p.level })));
        const bySide = (ids: string[]) =>
          ids.map((id) => ({ id, seed: g.players.find((p) => p.id === id)!.seed }));
        const schedule = rotationSchedule(bySide(sideA), bySide(sideB));
        for (const m of schedule) {
          drafts.push({
            kind: 'rotation',
            tournamentId: params.id,
            groupId: g.id,
            sideAPlayers: m.sideAPlayers,
            sideBPlayers: m.sideBPlayers,
            roundNumber: m.roundNumber,
            matchOrder: m.matchOrder,
          });
        }
      } else {
        const pairIds = g.pairs.map((p) => p.id);
        const matches = roundRobinPairs(pairIds);
        for (const m of matches) {
          drafts.push({
            kind: 'existing',
            tournamentId: params.id,
            groupId: g.id,
            pairAId: m.teamA,
            pairBId: m.teamB,
            roundNumber: m.roundNumber,
            matchOrder: m.matchOrder,
          });
        }
      }
    }
  } catch (e: any) {
    return conflict(e.message);
  }

  if (drafts.length === 0) return conflict('no_matches_to_generate');

  const matchInputs: MatchInput[] = drafts.map((d, idx) => ({
    id: `tmp${idx}`,
    groupId: d.groupId,
    roundNumber: d.roundNumber,
  }));
  const allocations = allocateCourts(matchInputs, courts.map((c) => c.id));
  const courtById = new Map(allocations.map((a) => [a.id, a.courtId]));

  const result = await prisma.$transaction(async (tx) => {
    if (tournament.format === 'club') {
      // Club pairs are one-off (created fresh below); clear any from a
      // previous generate before rebuilding. Cascades their old matches.
      await tx.pair.deleteMany({ where: { groupId: { in: groups.map((g) => g.id) } } });
    } else {
      await tx.match.deleteMany({ where: { tournamentId: params.id } });
    }

    const created = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const courtId = courtById.get(`tmp${i}`) ?? null;

      let pairAId: string;
      let pairBId: string;
      if (d.kind === 'existing') {
        pairAId = d.pairAId;
        pairBId = d.pairBId;
      } else {
        const pairA = await tx.pair.create({
          data: {
            tournamentId: d.tournamentId,
            groupId: d.groupId,
            player1Id: d.sideAPlayers[0],
            player2Id: d.sideAPlayers[1],
            displayOrder: d.matchOrder,
          },
        });
        const pairB = await tx.pair.create({
          data: {
            tournamentId: d.tournamentId,
            groupId: d.groupId,
            player1Id: d.sideBPlayers[0],
            player2Id: d.sideBPlayers[1],
            displayOrder: d.matchOrder,
          },
        });
        pairAId = pairA.id;
        pairBId = pairB.id;
      }

      const m = await tx.match.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupId,
          pairAId,
          pairBId,
          roundNumber: d.roundNumber,
          matchOrder: d.matchOrder,
          courtId,
        },
      });
      created.push(m);
    }
    return created;
  });

  emitToTournament(params.id, 'match.generated', { tournamentId: params.id, matches: result });
  return ok({ matches: result, count: result.length });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint "src/app/api/tournaments/[id]/matches/generate/route.ts"`
Expected: only the pre-existing `catch (e: any)` pattern already used elsewhere in this codebase (see `groups/generate/route.ts`), no new categories of error.

- [ ] **Step 4: Commit**

```bash
cd "C:\Private\badminton-game"
git add "src/app/api/tournaments/[id]/matches/generate/route.ts"
git commit -m "feat(matches): generate rotation schedule for club-format groups"
```

---

## Task 8: Per-player standings for club format

**Files:**
- Modify: `src/app/api/tournaments/[id]/standings/route.ts`

- [ ] **Step 1: Branch the standings route on format**

Replace `src/app/api/tournaments/[id]/standings/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok } from '@/lib/api-helpers';
import { getStandings } from '@/lib/standings-sql';
import { computePlayerStandings, type MatchResult } from '@/lib/player-standings';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  if (tournament.format === 'club') {
    const matches = await prisma.match.findMany({
      where: { tournamentId: params.id },
      include: { pairA: true, pairB: true },
    });
    const results: MatchResult[] = matches.map((m) => ({
      groupId: m.groupId,
      status: m.status,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      pairAPlayerIds: [m.pairA.player1Id, m.pairA.player2Id],
      pairBPlayerIds: [m.pairB.player1Id, m.pairB.player2Id],
    }));
    const rows = computePlayerStandings(results).map((r) => ({
      player_id: r.playerId,
      group_id: r.groupId,
      wins: r.wins,
      losses: r.losses,
      played: r.played,
      point_diff: r.pointDiff,
      points_for: r.pointsFor,
      points_against: r.pointsAgainst,
      rank: r.rank,
    }));
    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byGroup.get(r.group_id) ?? [];
      arr.push(r);
      byGroup.set(r.group_id, arr);
    }
    const result = [...byGroup.entries()].map(([groupId, standings]) => ({ groupId, standings }));
    return ok(result);
  }

  const rows = await getStandings(params.id);
  // group rows by group_id for client convenience
  const byGroup = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byGroup.get(r.group_id) ?? [];
    arr.push(r);
    byGroup.set(r.group_id, arr);
  }
  const result = [...byGroup.entries()].map(([groupId, standings]) => ({ groupId, standings }));
  return ok(result);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "C:\Private\badminton-game"
git add "src/app/api/tournaments/[id]/standings/route.ts"
git commit -m "feat(standings): per-player ranking for club-format tournaments"
```

---

## Task 9: Thread `format` down to the viewer tabs

The three viewer tab components (`GroupsTab`, `MatchesTab`, `StandingsTab`) currently only take `tournamentId` and `revision`. They need the tournament's `format` to decide what to hide/render differently.

**Files:**
- Modify: `src/app/t/[id]/viewer-client.tsx`
- Modify: `src/components/viewer/groups-tab.tsx`
- Modify: `src/components/viewer/matches-tab.tsx`
- Modify: `src/components/viewer/standings-tab.tsx`

- [ ] **Step 1: Pass `format` from `viewer-client.tsx`**

In `src/app/t/[id]/viewer-client.tsx`, find:

```tsx
          <TabsContent value="groups">
            <GroupsTab tournamentId={tournamentId} revision={revision} />
          </TabsContent>
          <TabsContent value="matches">
            <MatchesTab tournamentId={tournamentId} revision={revision} />
          </TabsContent>
          <TabsContent value="standings">
            <StandingsTab tournamentId={tournamentId} revision={revision} />
          </TabsContent>
```

Replace with:

```tsx
          <TabsContent value="groups">
            <GroupsTab tournamentId={tournamentId} revision={revision} format={tournament.format} />
          </TabsContent>
          <TabsContent value="matches">
            <MatchesTab tournamentId={tournamentId} revision={revision} format={tournament.format} />
          </TabsContent>
          <TabsContent value="standings">
            <StandingsTab tournamentId={tournamentId} revision={revision} format={tournament.format} />
          </TabsContent>
```

- [ ] **Step 2: `GroupsTab` — hide the pairs list for club**

In `src/components/viewer/groups-tab.tsx`, change the function signature:

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

Find:

```tsx
                {sortedPairs.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
```

Replace with:

```tsx
                {format === 'friendly' && sortedPairs.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
```

- [ ] **Step 3: `MatchesTab` — hide the 循環圖 view for club**

In `src/components/viewer/matches-tab.tsx`, change the function signature:

```typescript
export function MatchesTab({
  tournamentId,
  revision,
  format,
}: {
  tournamentId: string;
  revision: number;
  format: 'friendly' | 'club';
}) {
```

Right after `const [view, setView] = useState<ViewMode>('graph');`, default club tournaments to the group list view instead (there's no graph tab to land on):

```typescript
  const [view, setView] = useState<ViewMode>(format === 'club' ? 'group' : 'graph');
```

Find the 3-button view switcher:

```tsx
      <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1">
        <Button
          size="sm"
          variant={view === 'graph' ? 'default' : 'ghost'}
          onClick={() => setView('graph')}
          className="h-8 w-full"
        >
          循環圖
        </Button>
        <Button
          size="sm"
          variant={view === 'group' ? 'default' : 'ghost'}
          onClick={() => setView('group')}
          className="h-8 w-full"
        >
          分組列表
        </Button>
        <Button
          size="sm"
          variant={view === 'court' ? 'default' : 'ghost'}
          onClick={() => setView('court')}
          className="h-8 w-full"
        >
          場地列表
        </Button>
      </div>
```

Replace with:

```tsx
      <div className={`grid gap-1 rounded-lg border bg-muted/40 p-1 ${format === 'club' ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {format === 'friendly' && (
          <Button
            size="sm"
            variant={view === 'graph' ? 'default' : 'ghost'}
            onClick={() => setView('graph')}
            className="h-8 w-full"
          >
            循環圖
          </Button>
        )}
        <Button
          size="sm"
          variant={view === 'group' ? 'default' : 'ghost'}
          onClick={() => setView('group')}
          className="h-8 w-full"
        >
          分組列表
        </Button>
        <Button
          size="sm"
          variant={view === 'court' ? 'default' : 'ghost'}
          onClick={() => setView('court')}
          className="h-8 w-full"
        >
          場地列表
        </Button>
      </div>
```

- [ ] **Step 4: `StandingsTab` — render per-player rows for club**

In `src/components/viewer/standings-tab.tsx`, change the function signature and row typing. Replace the whole file:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import type { Group, Player, Pair } from '@prisma/client';

type Row = {
  pair_id?: string;
  player_id?: string;
  group_id: string;
  wins: number;
  losses: number;
  played: number;
  point_diff: number;
  points_for: number;
  points_against: number;
  rank: number;
};
type GroupBlock = { groupId: string; standings: Row[] };
type GroupWithRelations = Group & { players: Player[]; pairs: Pair[] };

export function StandingsTab({
  tournamentId,
  revision,
  format,
}: {
  tournamentId: string;
  revision: number;
  format: 'friendly' | 'club';
}) {
  const [blocks, setBlocks] = useState<GroupBlock[]>([]);
  const [groups, setGroups] = useState<GroupWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<GroupBlock[]>(`/api/tournaments/${tournamentId}/standings`),
      api<GroupWithRelations[]>(`/api/tournaments/${tournamentId}/groups`),
    ])
      .then(([s, g]) => {
        setBlocks(s);
        setGroups(g);
      })
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && blocks.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
  if (blocks.length === 0) return <p className="py-6 text-muted-foreground">尚無排名資料</p>;

  const pairLabel = (pairId: string) => {
    for (const g of groups) {
      const pair = g.pairs.find((p) => p.id === pairId);
      if (!pair) continue;
      const p1 = g.players.find((pl) => pl.id === pair.player1Id)?.name ?? '?';
      const p2 = g.players.find((pl) => pl.id === pair.player2Id)?.name ?? '?';
      return `${p1} / ${p2}`;
    }
    return pairId.slice(0, 6);
  };
  const playerLabel = (playerId: string) => {
    for (const g of groups) {
      const p = g.players.find((pl) => pl.id === playerId);
      if (p) return p.name;
    }
    return playerId.slice(0, 6);
  };
  const subjectLabel = (r: Row) =>
    format === 'club' ? playerLabel(r.player_id!) : pairLabel(r.pair_id!);
  const subjectKey = (r: Row) => (format === 'club' ? r.player_id! : r.pair_id!);
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? '';

  return (
    <div className="space-y-6 py-4">
      {blocks.map((b) => (
        <Card key={b.groupId} className="p-4">
          <div className="mb-3 text-lg font-semibold">{groupName(b.groupId)} 組</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">名次</TableHead>
                <TableHead>{format === 'club' ? '球員' : '配對'}</TableHead>
                <TableHead className="text-right">勝</TableHead>
                <TableHead className="text-right">負</TableHead>
                <TableHead className="text-right">場次</TableHead>
                <TableHead className="text-right">得分差</TableHead>
                <TableHead className="text-right">總得分</TableHead>
                <TableHead className="text-right">總失分</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.standings.map((r) => {
                const hasMedal = r.played > 0 && (r.rank === 1 || r.rank === 2 || r.rank === 3);
                return (
                <TableRow
                  key={subjectKey(r)}
                  className={
                    hasMedal && r.rank === 1
                      ? 'bg-amber-50'
                      : hasMedal && r.rank === 2
                        ? 'bg-slate-50'
                        : hasMedal && r.rank === 3
                          ? 'bg-orange-50'
                          : ''
                  }
                >
                  <TableCell className="font-medium whitespace-nowrap">
                    {hasMedal && r.rank === 1 ? (
                      <span className="font-bold text-amber-700">🥇 冠軍</span>
                    ) : hasMedal && r.rank === 2 ? (
                      <span className="font-bold text-slate-700">🥈 亞軍</span>
                    ) : hasMedal && r.rank === 3 ? (
                      <span className="font-bold text-orange-700">🥉 季軍</span>
                    ) : (
                      <span className="text-muted-foreground">{r.rank}</span>
                    )}
                  </TableCell>
                  <TableCell>{subjectLabel(r)}</TableCell>
                  <TableCell className="text-right">{r.wins}</TableCell>
                  <TableCell className="text-right">{r.losses}</TableCell>
                  <TableCell className="text-right">{r.played}</TableCell>
                  <TableCell className="text-right">{r.point_diff}</TableCell>
                  <TableCell className="text-right">{r.points_for}</TableCell>
                  <TableCell className="text-right">{r.points_against}</TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Lint the touched viewer files**

Run: `cd "C:\Private\badminton-game" && npx eslint src/app/t/[id]/viewer-client.tsx src/components/viewer/groups-tab.tsx src/components/viewer/matches-tab.tsx src/components/viewer/standings-tab.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/app/t/[id]/viewer-client.tsx src/components/viewer/groups-tab.tsx src/components/viewer/matches-tab.tsx src/components/viewer/standings-tab.tsx
git commit -m "feat(viewer): hide pair-list/循環圖, show per-player standings for club format"
```

---

## Task 10: End-to-end manual verification

This project has no browser/integration test harness (see `tests/integration/` — check what's there before assuming; if empty, manual verification is the existing convention for full-flow checks in this codebase). Verify on the test deployment.

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite + typecheck one more time**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx vitest run tests/unit`
Expected: no type errors; all unit tests pass.

- [ ] **Step 2: Deploy to the test machine**

```bash
git push
```
Then on the test machine:
```bash
git pull
docker build -t badminton-game-app:latest .
docker compose up -d
```

- [ ] **Step 3: Manual walkthrough — club format**

1. 建一場新賽事，賽制選「會內賽」。
2. 報名至少 6 位球員，等級隨意填（至少 2 種等級，方便確認 A/B 隊等級有混到）。
3. 分組頁：點「依等級自動分組」（或「各組等級均分」），確認組卡片**沒有**配對按鈕，只有球員名單 + 棒次欄位 + 上下移動按鈕。
4. 點「確認分組，開始賽程」，確認賽事狀態變成 in_progress（沒有錯誤 toast）。
5. 到「賽程」分頁點「產生對戰＋分配場地」，確認每組產生了 n 場比賽（n = 該組每邊人數），場地有被分配。
6. 計分幾場，到 viewer 端（`/t/<id>`）確認：分組頁沒有配對清單、賽程頁的檢視切換只剩「分組列表」「場地列表」兩個、排名頁欄位標題是「球員」不是「配對」，名次是依個人勝負算的。

- [ ] **Step 4: Manual walkthrough — friendly format regression check**

1. 建一場新賽事，賽制選「友誼賽」（預設）。
2. 走一次原本流程：分組 → 依棒次配對／依等級配對／隨機重抽 → 鎖定配對 → 產生對戰 → 計分。
3. 確認一切跟這次改動之前的行為完全一樣（配對按鈕都在、循環圖檢視還在、排名還是依配對算）。

- [ ] **Step 5: If both walkthroughs pass, this feature is done**

No further step — this is the final task in the plan.

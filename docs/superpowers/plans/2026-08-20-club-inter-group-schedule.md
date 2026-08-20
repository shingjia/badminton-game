# 會內賽「組跟組對戰」賽制 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace club-format's current "one group splits into A/B internally" match generation with "分組 groups play each other in a full round-robin" — reusing `roundRobinPairs` (group-vs-group pairing across waves) and `rotationSchedule` (each pairing's internal circular-partner rotation) almost entirely as-is, plus a new court-balancing rule and a data-model fix so per-group standings attribute each side's stats correctly.

**Architecture:** A new pure module `lib/club-schedule.ts` orchestrates the two existing algorithms (`roundRobinPairs` decides which groups play which groups in which wave; `rotationSchedule` builds each pairing's n-match rotation) and adds the primary/shared court-balancing split. `matches/generate/route.ts` gets a new club branch that calls this, creates one-off `Pair` rows tagged with each side's *own* group id (not a shared one), and assigns courts directly (no `allocateCourts` — the friendly branch keeps using it unchanged). `lib/player-standings.ts`'s `MatchResult` type changes from one shared `groupId` to `pairAGroupId`/`pairBGroupId`, fixing a cross-group stat-attribution bug this design surfaced. The viewer's match list groups club matches by "A vs B" pairing instead of a single group.

**Tech Stack:** Next.js (App Router) API routes, Prisma + PostgreSQL, Vitest for unit tests, React client components.

**Design doc:** `docs/superpowers/specs/2026-08-20-club-inter-group-schedule-design.md`

---

## Task 1: Fix `lib/player-standings.ts` to attribute each side's stats to its own group

**Files:**
- Modify: `src/lib/player-standings.ts`
- Modify: `tests/unit/player-standings.test.ts`

**Why:** `MatchResult` currently has one `groupId` shared by both sides — correct for the old "match only happens within one group" model, wrong for the new "match spans two different groups" model (would attribute the losing side's stats to the winning side's group). Every existing test constructs matches with both sides in the same group (valid for what they test), so a mechanical field rename with the same value on both sides preserves all existing behavior; one new test proves the fix with genuinely different groups on each side.

- [ ] **Step 1: Update the failing tests first**

Replace `tests/unit/player-standings.test.ts` in full:

```typescript
import { describe, it, expect } from 'vitest';
import { computePlayerStandings, computeGroupStandings, type MatchResult } from '@/lib/player-standings';

describe('computePlayerStandings', () => {
  it('two players each play two matches, one win one loss', () => {
    // Alice partners Bob in match 1 (win), partners Carol in match 2 (loss).
    const matches: MatchResult[] = [
      {
        pairAGroupId: 'g1',
        pairBGroupId: 'g1',
        status: 'completed',
        scoreA: 21,
        scoreB: 15,
        pairAPlayerIds: ['alice', 'bob'],
        pairBPlayerIds: ['dave', 'erin'],
      },
      {
        pairAGroupId: 'g1',
        pairBGroupId: 'g1',
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
        pairAGroupId: 'g1',
        pairBGroupId: 'g1',
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
      pairAGroupId: 'g1',
      pairBGroupId: 'g1',
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
        pairAGroupId: 'g1',
        pairBGroupId: 'g1',
        status: 'completed',
        scoreA: 21,
        scoreB: 10,
        pairAPlayerIds: ['alice', 'bob'],
        pairBPlayerIds: ['carol', 'dave'],
      },
      {
        pairAGroupId: 'g2',
        pairBGroupId: 'g2',
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

  it('attributes each side to its OWN group, not the other side\'s (cross-group match)', () => {
    // group A beats group B — this is the new inter-group shape, unlike
    // every test above where both sides happen to share one group.
    const matches: MatchResult[] = [
      {
        pairAGroupId: 'A',
        pairBGroupId: 'B',
        status: 'completed',
        scoreA: 21,
        scoreB: 10,
        pairAPlayerIds: ['a1', 'a2'],
        pairBPlayerIds: ['b1', 'b2'],
      },
    ];
    const rows = computePlayerStandings(matches);
    const byId = Object.fromEntries(rows.map((r) => [r.playerId, r]));
    expect(byId.a1.groupId).toBe('A');
    expect(byId.a1.wins).toBe(1);
    expect(byId.b1.groupId).toBe('B');
    expect(byId.b1.losses).toBe(1);
  });
});

describe('computeGroupStandings', () => {
  it('sums every player in a group into that group\'s totals', () => {
    // g1: one match, alice+bob beat carol+dave 21-15.
    const matches: MatchResult[] = [
      {
        pairAGroupId: 'g1',
        pairBGroupId: 'g1',
        status: 'completed',
        scoreA: 21,
        scoreB: 15,
        pairAPlayerIds: ['alice', 'bob'],
        pairBPlayerIds: ['carol', 'dave'],
      },
    ];
    const rows = computeGroupStandings(matches);
    const g1 = rows.find((r) => r.groupId === 'g1')!;
    // 2 winners (+1 win each) + 2 losers (+1 loss each) = 2 wins, 2 losses group-wide.
    expect(g1.wins).toBe(2);
    expect(g1.losses).toBe(2);
    expect(g1.played).toBe(4);
    expect(g1.pointsFor).toBe(21 + 21 + 15 + 15);
    expect(g1.pointsAgainst).toBe(15 + 15 + 21 + 21);
  });

  it('ranks groups against each other: wins desc, then points-for desc, then points-against asc', () => {
    const match = (groupId: string, scoreA: number, scoreB: number): MatchResult => ({
      pairAGroupId: groupId,
      pairBGroupId: groupId,
      status: 'completed',
      scoreA,
      scoreB,
      pairAPlayerIds: [`${groupId}-a1`, `${groupId}-a2`],
      pairBPlayerIds: [`${groupId}-b1`, `${groupId}-b2`],
    });
    const matches: MatchResult[] = [
      match('g1', 21, 5),
      match('g1', 21, 5),
      match('g2', 21, 19),
      match('g3', 5, 21),
    ];
    const rows = computeGroupStandings(matches);
    const order = rows.map((r) => r.groupId);
    expect(order).toEqual(['g1', 'g2', 'g3']);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[2].rank).toBe(3);
  });

  it('breaks a wins tie by total points-for, then points-against', () => {
    const match = (groupId: string, scoreA: number, scoreB: number): MatchResult => ({
      pairAGroupId: groupId,
      pairBGroupId: groupId,
      status: 'completed',
      scoreA,
      scoreB,
      pairAPlayerIds: [`${groupId}-a1`, `${groupId}-a2`],
      pairBPlayerIds: [`${groupId}-b1`, `${groupId}-b2`],
    });
    const matches: MatchResult[] = [match('g1', 21, 18), match('g2', 21, 10)];
    const rows = computeGroupStandings(matches);
    expect(rows[0].groupId).toBe('g1');
    expect(rows[0].rank).toBe(1);
    expect(rows[1].groupId).toBe('g2');
    expect(rows[1].rank).toBe(2);
  });

  it('attributes wins/losses to each side\'s own group only (regression: cross-group contamination)', () => {
    // group A beats group B: A's 2 players both win, B's 2 players both lose.
    const matches: MatchResult[] = [
      {
        pairAGroupId: 'A',
        pairBGroupId: 'B',
        status: 'completed',
        scoreA: 21,
        scoreB: 10,
        pairAPlayerIds: ['a1', 'a2'],
        pairBPlayerIds: ['b1', 'b2'],
      },
    ];
    const rows = computeGroupStandings(matches);
    const gA = rows.find((r) => r.groupId === 'A')!;
    const gB = rows.find((r) => r.groupId === 'B')!;
    expect(gA.wins).toBe(2);
    expect(gA.losses).toBe(0);
    expect(gB.wins).toBe(0);
    expect(gB.losses).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/player-standings.test.ts`
Expected: FAIL — TypeScript error or test failures referencing `pairAGroupId`/`pairBGroupId` not existing on `MatchResult` yet (the type still has `groupId`).

- [ ] **Step 3: Update `MatchResult` and `computePlayerStandings`**

In `src/lib/player-standings.ts`, replace the top of the file through `computePlayerStandings`:

```typescript
export type MatchResult = {
  pairAGroupId: string;
  pairBGroupId: string;
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
 *
 * A match now spans two different groups (group A's roster plays group
 * B's), so each side's players are attributed to *their own* group
 * (pairAGroupId / pairBGroupId) — never to the other side's group.
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
    tally(m.pairAPlayerIds, m.pairAGroupId, m.scoreA, m.scoreB);
    tally(m.pairBPlayerIds, m.pairBGroupId, m.scoreB, m.scoreA);
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
```

Leave `rankGroup`, `GroupStandingRow`, and `computeGroupStandings` exactly as they are — they consume `computePlayerStandings`'s output, so they inherit the fix automatically with no changes needed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/player-standings.test.ts`
Expected: PASS (9 tests: 5 in `computePlayerStandings`, 4 in `computeGroupStandings`).

- [ ] **Step 5: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: at least 1 error, in a file this task hasn't touched yet — `src/app/api/tournaments/[id]/standings/route.ts` (still constructs `MatchResult` with the old `groupId` field, which no longer exists on the type). This is expected; Task 4 fixes it. Confirm every reported error is in that one file (`route.ts`'s `results: MatchResult[] = matches.map(...)` line) — if errors show up anywhere else, stop and investigate before continuing.

- [ ] **Step 6: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/lib/player-standings.ts tests/unit/player-standings.test.ts
git commit -m "fix(standings): attribute each match side to its own group, not a shared one"
```

---

## Task 2: `lib/club-schedule.ts` — inter-group round-robin orchestration

**Files:**
- Create: `src/lib/club-schedule.ts`
- Test: `tests/unit/club-schedule.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/club-schedule.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildClubSchedule, primaryCourtCount, type GroupRoster } from '@/lib/club-schedule';

describe('primaryCourtCount', () => {
  it('balances 4 groups x 6 players -> keeps 4 matches on the primary court', () => {
    expect(primaryCourtCount(4, 6)).toBe(4);
  });

  it('clamps to [0, n]', () => {
    expect(primaryCourtCount(2, 3)).toBeGreaterThanOrEqual(0);
    expect(primaryCourtCount(100, 3)).toBeLessThanOrEqual(3);
  });
});

describe('buildClubSchedule', () => {
  function roster(groupId: string, n: number): GroupRoster {
    return {
      groupId,
      players: Array.from({ length: n }, (_, i) => ({ id: `${groupId}${i + 1}`, seed: i + 1 })),
    };
  }

  it('throws odd_group_count for an odd number of groups', () => {
    expect(() => buildClubSchedule([roster('A', 6), roster('B', 6), roster('C', 6)])).toThrow(
      'odd_group_count',
    );
  });

  it('throws too_few_groups for fewer than 2 groups', () => {
    expect(() => buildClubSchedule([roster('A', 6)])).toThrow('too_few_groups');
  });

  it('4 groups x 6 players: every pair of groups plays exactly once, 36 matches total', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => roster(g, 6));
    const drafts = buildClubSchedule(groups);
    expect(drafts).toHaveLength(36);

    const pairingCounts = new Map<string, number>();
    for (const d of drafts) {
      const key = [d.groupAId, d.groupBId].sort().join('-');
      pairingCounts.set(key, (pairingCounts.get(key) ?? 0) + 1);
    }
    expect([...pairingCounts.keys()].sort()).toEqual(['A-B', 'A-C', 'A-D', 'B-C', 'B-D', 'C-D']);
    for (const count of pairingCounts.values()) expect(count).toBe(6);
  });

  it('splits each pairing 4 primary / 2 shared, every wave has exactly 2 pairings using courts 0 and 1', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => roster(g, 6));
    const drafts = buildClubSchedule(groups);

    const byPairing = new Map<string, { primary: number; shared: number }>();
    for (const d of drafts) {
      const key = [d.groupAId, d.groupBId].sort().join('-');
      const counts = byPairing.get(key) ?? { primary: 0, shared: 0 };
      counts[d.courtSlot]++;
      byPairing.set(key, counts);
    }
    for (const counts of byPairing.values()) {
      expect(counts.primary).toBe(4);
      expect(counts.shared).toBe(2);
    }

    const byWave = new Map<number, Set<number>>();
    for (const d of drafts) {
      const set = byWave.get(d.roundNumber) ?? new Set<number>();
      set.add(d.pairingIndexInWave);
      byWave.set(d.roundNumber, set);
    }
    expect(byWave.size).toBe(3); // 4 groups -> 3 waves
    for (const indices of byWave.values()) {
      expect([...indices].sort()).toEqual([0, 1]);
    }
  });

  it('interleaves shared-court matches across a wave\'s pairings instead of clumping', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => roster(g, 6));
    const drafts = buildClubSchedule(groups);
    const wave1Shared = drafts.filter((d) => d.roundNumber === 1 && d.courtSlot === 'shared');
    expect(wave1Shared.map((d) => d.pairingIndexInWave)).toEqual([0, 1, 0, 1]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/club-schedule.test.ts`
Expected: FAIL — `Cannot find module '@/lib/club-schedule'`.

- [ ] **Step 3: Implement `club-schedule.ts`**

Create `src/lib/club-schedule.ts`:

```typescript
import { roundRobinPairs } from './algorithms/circle-method';
import { rotationSchedule, type SeededPlayer } from './rotation';

export type GroupRoster = { groupId: string; players: SeededPlayer[] };

export type ClubMatchDraft = {
  groupAId: string;
  groupBId: string;
  sideAPlayers: [string, string];
  sideBPlayers: [string, string];
  roundNumber: number; // which wave (1..groupCount-1) this group-pairing plays in
  matchOrder: number; // 1..n within this group-pairing's own rotation
  courtSlot: 'primary' | 'shared';
  pairingIndexInWave: number; // which of this wave's simultaneous pairings this is (0-based) — picks the dedicated primary court
};

/**
 * How many of a pairing's n matches stay on its own dedicated court — the
 * rest move to the shared court, so all (groupCount/2 + 1) courts end up
 * with roughly the same number of matches per wave.
 * x = round(groupCount * n / (groupCount + 2)), clamped to [0, n].
 */
export function primaryCourtCount(groupCount: number, n: number): number {
  const x = Math.round((groupCount * n) / (groupCount + 2));
  return Math.max(0, Math.min(n, x));
}

/**
 * Builds a full inter-group round-robin schedule: which groups play which
 * groups in which wave (lib/algorithms/circle-method.ts's roundRobinPairs,
 * treating each group as one "team"), and within each group-pairing, the
 * circular partner rotation (lib/rotation.ts's rotationSchedule) — both
 * reused as-is, nothing new algorithmically there.
 *
 * Requires an even number of groups (>= 2) — odd counts would need a bye,
 * not supported yet.
 */
export function buildClubSchedule(groups: GroupRoster[]): ClubMatchDraft[] {
  if (groups.length < 2) throw new Error('too_few_groups');
  if (groups.length % 2 !== 0) throw new Error('odd_group_count');

  const byId = new Map(groups.map((g) => [g.groupId, g]));
  const pairings = roundRobinPairs(groups.map((g) => g.groupId));

  const byWave = new Map<number, typeof pairings>();
  for (const p of pairings) {
    const arr = byWave.get(p.roundNumber) ?? [];
    arr.push(p);
    byWave.set(p.roundNumber, arr);
  }

  const drafts: ClubMatchDraft[] = [];
  for (const wave of [...byWave.keys()].sort((a, b) => a - b)) {
    const pairsInWave = byWave.get(wave)!;
    const schedules = pairsInWave.map((pairing, pairingIndex) => {
      const groupA = byId.get(pairing.teamA)!;
      const groupB = byId.get(pairing.teamB)!;
      const schedule = rotationSchedule(groupA.players, groupB.players);
      const primaryCount = primaryCourtCount(groups.length, schedule.length);
      return {
        groupAId: groupA.groupId,
        groupBId: groupB.groupId,
        pairingIndex,
        primary: schedule.slice(0, primaryCount),
        shared: schedule.slice(primaryCount),
      };
    });

    // Primary matches: each pairing has its own dedicated court, so order
    // across pairings doesn't matter — append in pairing order.
    for (const s of schedules) {
      for (const m of s.primary) {
        drafts.push({
          groupAId: s.groupAId,
          groupBId: s.groupBId,
          sideAPlayers: m.sideAPlayers,
          sideBPlayers: m.sideBPlayers,
          roundNumber: wave,
          matchOrder: m.matchOrder,
          courtSlot: 'primary',
          pairingIndexInWave: s.pairingIndex,
        });
      }
    }

    // Shared-court matches: interleave round-robin across this wave's
    // pairings (ponytail: this is a best-effort display-order nicety, not
    // a correctness requirement — different pairings never share a
    // player, so any court queue order is physically valid; if the
    // interleave ever needs to be guaranteed regardless of how callers
    // sort/refetch matches, encode it into roundNumber instead).
    const maxShared = Math.max(...schedules.map((s) => s.shared.length), 0);
    for (let step = 0; step < maxShared; step++) {
      for (const s of schedules) {
        const m = s.shared[step];
        if (!m) continue;
        drafts.push({
          groupAId: s.groupAId,
          groupBId: s.groupBId,
          sideAPlayers: m.sideAPlayers,
          sideBPlayers: m.sideBPlayers,
          roundNumber: wave,
          matchOrder: m.matchOrder,
          courtSlot: 'shared',
          pairingIndexInWave: s.pairingIndex,
        });
      }
    }
  }
  return drafts;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/club-schedule.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck and run the full unit suite**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx vitest run tests/unit`
Expected: same pre-existing error from Task 1 Step 5 (still not fixed until Task 4), no new errors; test count now 9 (player-standings) + 7 (club-schedule) + 25 (circle-method, court-allocation, pairing, rotation combined) = 41 total.

- [ ] **Step 6: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/lib/club-schedule.ts tests/unit/club-schedule.test.ts
git commit -m "feat: add buildClubSchedule for inter-group round-robin scheduling"
```

---

## Task 3: Rewrite club-format match generation to use `buildClubSchedule`

**Files:**
- Modify: `src/app/api/tournaments/[id]/matches/generate/route.ts`

- [ ] **Step 1: Replace the whole file**

Replace `src/app/api/tournaments/[id]/matches/generate/route.ts` in full:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { roundRobinPairs } from '@/lib/algorithms/circle-method';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';
import { buildClubSchedule, type ClubMatchDraft } from '@/lib/club-schedule';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

type ExistingDraft = {
  tournamentId: string;
  groupId: string;
  pairAId: string;
  pairBId: string;
  roundNumber: number;
  matchOrder: number;
};

type ClubDraft = ClubMatchDraft & { tournamentId: string; courtId: string | null };

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

  let existingDrafts: ExistingDraft[] = [];
  let clubDrafts: ClubDraft[] = [];

  if (tournament.format === 'club') {
    // Groups play each other directly (round-robin), not internally —
    // needs exactly groupCount/2 dedicated courts + 1 shared court.
    if (groups.length % 2 !== 0) return conflict('odd_group_count');
    const primaryCourtsNeeded = groups.length / 2;
    if (courts.length !== primaryCourtsNeeded + 1) return conflict('court_count_mismatch');

    try {
      const rosters = groups.map((g) => ({
        groupId: g.id,
        players: g.players.map((p) => ({ id: p.id, seed: p.seed })),
      }));
      const schedule = buildClubSchedule(rosters);
      clubDrafts = schedule.map((m) => ({
        ...m,
        tournamentId: params.id,
        courtId:
          m.courtSlot === 'primary'
            ? courts[m.pairingIndexInWave].id
            : courts[primaryCourtsNeeded].id,
      }));
    } catch (e: any) {
      return conflict(e.message);
    }
  } else {
    try {
      for (const g of groups) {
        const pairIds = g.pairs.map((p) => p.id);
        const matches = roundRobinPairs(pairIds);
        for (const m of matches) {
          existingDrafts.push({
            tournamentId: params.id,
            groupId: g.id,
            pairAId: m.teamA,
            pairBId: m.teamB,
            roundNumber: m.roundNumber,
            matchOrder: m.matchOrder,
          });
        }
      }
    } catch (e: any) {
      return conflict(e.message);
    }
  }

  if (existingDrafts.length + clubDrafts.length === 0) return conflict('no_matches_to_generate');

  // Friendly's existing pairs still go through the generic allocateCourts
  // (batches by roundNumber, round-robins across all courts) — club's
  // court assignment is already resolved above, bespoke to its primary/
  // shared-court balancing rule.
  const matchInputs: MatchInput[] = existingDrafts.map((d, idx) => ({
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

    for (let i = 0; i < existingDrafts.length; i++) {
      const d = existingDrafts[i];
      const courtId = courtById.get(`tmp${i}`) ?? null;
      const m = await tx.match.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupId,
          pairAId: d.pairAId,
          pairBId: d.pairBId,
          roundNumber: d.roundNumber,
          matchOrder: d.matchOrder,
          courtId,
        },
      });
      created.push(m);
    }

    for (const d of clubDrafts) {
      // Each side's one-off Pair is tagged with *its own* group — not a
      // shared value — so standings can attribute stats correctly (see
      // lib/player-standings.ts).
      const pairA = await tx.pair.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupAId,
          player1Id: d.sideAPlayers[0],
          player2Id: d.sideAPlayers[1],
          displayOrder: d.matchOrder,
        },
      });
      const pairB = await tx.pair.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupBId,
          player1Id: d.sideBPlayers[0],
          player2Id: d.sideBPlayers[1],
          displayOrder: d.matchOrder,
        },
      });
      // Match.groupId is a required single FK but a club match spans two
      // groups — pairA's group is stored here as a technical placeholder
      // only; nothing should read it as "the" group for a club match
      // (use pairA.group / pairB.group instead, see matches-tab.tsx).
      const m = await tx.match.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupAId,
          pairAId: pairA.id,
          pairBId: pairB.id,
          roundNumber: d.roundNumber,
          matchOrder: d.matchOrder,
          courtId: d.courtId,
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
Expected: same 1 pre-existing error in `standings/route.ts` (fixed in Task 4), no errors in this file.

- [ ] **Step 3: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint "src/app/api/tournaments/[id]/matches/generate/route.ts"`
Expected: only the pre-existing `catch (e: any)` pattern already used elsewhere in this codebase, no new categories of error.

- [ ] **Step 4: Commit**

```bash
cd "C:\Private\badminton-game"
git add "src/app/api/tournaments/[id]/matches/generate/route.ts"
git commit -m "feat(matches): club format groups play each other (inter-group round-robin)"
```

---

## Task 4: Fix the standings route's `MatchResult` construction

**Files:**
- Modify: `src/app/api/tournaments/[id]/standings/route.ts`

- [ ] **Step 1: Update the club branch's `MatchResult` mapping**

In `src/app/api/tournaments/[id]/standings/route.ts`, find:

```typescript
    const results: MatchResult[] = matches.map((m) => ({
      groupId: m.groupId,
      status: m.status,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      pairAPlayerIds: [m.pairA.player1Id, m.pairA.player2Id],
      pairBPlayerIds: [m.pairB.player1Id, m.pairB.player2Id],
    }));
```

Replace with:

```typescript
    const results: MatchResult[] = matches.map((m) => ({
      pairAGroupId: m.pairA.groupId,
      pairBGroupId: m.pairB.groupId,
      status: m.status,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      pairAPlayerIds: [m.pairA.player1Id, m.pairA.player2Id],
      pairBPlayerIds: [m.pairB.player1Id, m.pairB.player2Id],
    }));
```

`Pair.groupId` is already a plain column on `Pair` (not a relation), so it's available on `m.pairA` / `m.pairB` from the existing `include: { pairA: true, pairB: true }` — no query change needed.

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors anywhere in the project.

- [ ] **Step 3: Run the full unit suite**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit`
Expected: all 41 tests pass.

- [ ] **Step 4: Commit**

```bash
cd "C:\Private\badminton-game"
git add "src/app/api/tournaments/[id]/standings/route.ts"
git commit -m "fix(standings): read each side's own group from Pair.groupId"
```

---

## Task 5: Include each side's group in the matches list API

**Files:**
- Modify: `src/app/api/tournaments/[id]/matches/route.ts`

**Why:** The viewer needs to label a club match as "A組 vs B組" — that requires each Pair's own group name, not just the Match's single (now-ambiguous) group.

- [ ] **Step 1: Add `group: true` to the pairA/pairB includes**

Replace `src/app/api/tournaments/[id]/matches/route.ts` in full:

```typescript
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok } from '@/lib/api-helpers';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const matches = await prisma.match.findMany({
    where: { tournamentId: params.id },
    orderBy: [{ groupId: 'asc' }, { matchOrder: 'asc' }],
    include: {
      pairA: { include: { player1: true, player2: true, group: true } },
      pairB: { include: { player1: true, player2: true, group: true } },
      court: true,
      group: true,
    },
  });
  return ok(matches);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "C:\Private\badminton-game"
git add "src/app/api/tournaments/[id]/matches/route.ts"
git commit -m "feat(matches): include each pair's own group for club-format display"
```

---

## Task 6: Viewer — group club matches by pairing, not by a single group

**Files:**
- Modify: `src/components/viewer/matches-tab.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/viewer/matches-tab.tsx` in full before editing (it's a substantial existing file with 3 view modes — graph/group/court — and a shared `MatchList` sub-component; match every edit below against the exact current text rather than guessing at line numbers).

- [ ] **Step 2: Widen the `PairWithPlayers` type to include `group`**

Find:

```typescript
type PairWithPlayers = Pair & { player1: Player; player2: Player };
```

Replace with:

```typescript
type PairWithPlayers = Pair & { player1: Player; player2: Player; group: Group };
```

- [ ] **Step 3: Add a pairing-key helper**

Find:

```typescript
function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}
```

Add right after it:

```typescript
function pairingOf(m: MatchFull) {
  const [first, second] = [m.pairA.group, m.pairB.group].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return { key: `${first.id}-${second.id}`, label: `${first.name} 組 vs ${second.name} 組` };
}
```

- [ ] **Step 4: Build the "分組列表" grouping differently for club format**

Find:

```typescript
  // Group by group
  const byGroup = new Map<string, MatchFull[]>();
  for (const m of matches) {
    const k = m.group.name;
    const arr = byGroup.get(k) ?? [];
    arr.push(m);
    byGroup.set(k, arr);
  }
```

Replace with:

```typescript
  // Group by group (friendly) or by pairing (club — a match spans two
  // different groups, so grouping by Match.group alone would only show
  // one side and hide who the opponent is).
  const byGroup = new Map<string, { label: string; matches: MatchFull[] }>();
  for (const m of matches) {
    const { key, label } = format === 'club' ? pairingOf(m) : { key: m.group.name, label: `${m.group.name} 組` };
    const block = byGroup.get(key) ?? { label, matches: [] };
    block.matches.push(m);
    byGroup.set(key, block);
  }
```

- [ ] **Step 5: Update the two render blocks that consume `byGroup`**

Find (the `view === 'graph'` block — friendly-only, since the graph button is already hidden for club, but the map still runs over `byGroup`; this block only ever renders when `format === 'friendly'` in practice, so `label` will always be the `友誼賽` shape):

```tsx
      {view === 'graph' &&
        [...byGroup.entries()].map(([gname, ms]) => {
          const completed = ms.filter((m) => m.status === 'completed').length;
          const total = ms.length;
          return (
            <Card key={gname} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-block rounded-lg bg-slate-800 px-4 py-1.5 text-xl font-bold text-white shadow">
                  {gname} 組
                </span>
                <div className="text-xs text-muted-foreground">
                  {completed} / {total} 場已完成
                </div>
              </div>
              <MatchGraph matches={ms} />
            </Card>
          );
        })}

      {view === 'group' &&
        [...byGroup.entries()].map(([gname, ms]) => {
          const completed = ms.filter((m) => m.status === 'completed').length;
          const total = ms.length;
          return (
            <Card key={gname} className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-lg font-semibold">{gname} 組</div>
                <div className="text-xs text-muted-foreground">
                  {completed} / {total} 場已完成
                </div>
              </div>
              <MatchList matches={ms} showGroup={false} />
            </Card>
          );
        })}
```

Replace with:

```tsx
      {view === 'graph' &&
        [...byGroup.entries()].map(([key, block]) => {
          const completed = block.matches.filter((m) => m.status === 'completed').length;
          const total = block.matches.length;
          return (
            <Card key={key} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-block rounded-lg bg-slate-800 px-4 py-1.5 text-xl font-bold text-white shadow">
                  {block.label}
                </span>
                <div className="text-xs text-muted-foreground">
                  {completed} / {total} 場已完成
                </div>
              </div>
              <MatchGraph matches={block.matches} />
            </Card>
          );
        })}

      {view === 'group' &&
        [...byGroup.entries()].map(([key, block]) => {
          const completed = block.matches.filter((m) => m.status === 'completed').length;
          const total = block.matches.length;
          return (
            <Card key={key} className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-lg font-semibold">{block.label}</div>
                <div className="text-xs text-muted-foreground">
                  {completed} / {total} 場已完成
                </div>
              </div>
              <MatchList matches={block.matches} showGroup={false} format={format} />
            </Card>
          );
        })}
```

- [ ] **Step 6: Fix the 場地列表 view's per-match badge for club**

The court view (`view === 'court'`) is unaffected structurally (still grouped by court, not by group), but `MatchList`'s `showGroup` badge currently renders `m.group.name` — for club that's the arbitrary technical placeholder (pairA's group only), misleading. Find:

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
              <MatchList matches={c.matches} showGroup />
            </Card>
          );
        })}
```

Replace with:

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

- [ ] **Step 7: Update `MatchList` to show the right badge per format**

Find:

```tsx
function MatchList({ matches, showGroup }: { matches: MatchFull[]; showGroup: boolean }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {matches.map((m) => {
        const done = m.status === 'completed';
        const playing = !done && (m.scoreA > 0 || m.scoreB > 0);
        return (
          <Card
            key={m.id}
            className={`flex items-center justify-between p-3 ${
              done
                ? 'border-emerald-300 bg-emerald-50'
                : playing
                  ? 'border-amber-300 bg-amber-50'
                  : ''
            }`}
          >
            <div className="text-sm">
              <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
              {showGroup && (
                <Badge variant="outline" className="mr-1 text-xs">
                  {m.group.name}
                </Badge>
              )}
              <span className="font-medium">{pairLabel(m.pairA)}</span>
              <span className="mx-2">vs</span>
              <span className="font-medium">{pairLabel(m.pairB)}</span>
            </div>
```

Replace with:

```tsx
function MatchList({
  matches,
  showGroup,
  format,
}: {
  matches: MatchFull[];
  showGroup: boolean;
  format: 'friendly' | 'club';
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {matches.map((m) => {
        const done = m.status === 'completed';
        const playing = !done && (m.scoreA > 0 || m.scoreB > 0);
        return (
          <Card
            key={m.id}
            className={`flex items-center justify-between p-3 ${
              done
                ? 'border-emerald-300 bg-emerald-50'
                : playing
                  ? 'border-amber-300 bg-amber-50'
                  : ''
            }`}
          >
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
```

Leave the rest of `MatchList` (the score/court badge on the right side) unchanged.

- [ ] **Step 8: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors. (`Group` must already be imported in this file from `@prisma/client` — it is, check the existing `import type { Match, Pair, Player, Court, Group } from '@prisma/client';` line at the top; no import changes needed.)

- [ ] **Step 9: Lint**

Run: `cd "C:\Private\badminton-game" && npx eslint src/components/viewer/matches-tab.tsx`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/viewer/matches-tab.tsx
git commit -m "feat(viewer): show club matches grouped by pairing (A vs B), not a single group"
```

---

## Task 7: Friendly Chinese error messages for the two new failure codes

**Files:**
- Modify: `src/components/admin/section-matches.tsx`

- [ ] **Step 1: Add the two new codes to the `ERR` map**

In `src/components/admin/section-matches.tsx`, find:

```typescript
  const ERR: Record<string, string> = {
    no_matches_to_generate: '每組至少要有 2 對才能產生對戰',
    no_groups: '尚未分組',
    unequal_sides: '有一組依等級分出的兩隊人數不相等，請調整組數或球員人數',
    side_too_small: '有一組分出的兩隊人數少於 3 人，無法輪轉搭檔，請調整組數或球員人數',
  };
```

Replace with:

```typescript
  const ERR: Record<string, string> = {
    no_matches_to_generate: '每組至少要有 2 對才能產生對戰',
    no_groups: '尚未分組',
    unequal_sides: '有一組依等級分出的兩隊人數不相等，請調整組數或球員人數',
    side_too_small: '有一組分出的兩隊人數少於 3 人，無法輪轉搭檔，請調整組數或球員人數',
    odd_group_count: '會內賽的組數必須是偶數（組跟組要兩兩對戰），請調整組數',
    court_count_mismatch: '會內賽的場地數必須等於「組數÷2 + 1」，請調整場地或組數',
  };
```

Note: `unequal_sides` / `side_too_small` are dead codes as of Task 3 (they were thrown by the old `splitByLevel2`-based club path, which this plan's Task 3 removed) — leaving their translations in place is harmless (friendly format never triggers them either) and avoids unnecessary churn to this map; not worth removing in this task.

- [ ] **Step 2: Typecheck**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/components/admin/section-matches.tsx
git commit -m "feat(matches): Chinese error messages for inter-group scheduling failures"
```

---

## Task 8: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite + typecheck one more time**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx vitest run tests/unit`
Expected: no type errors; all tests pass (41 total).

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

- [ ] **Step 3: Manual walkthrough — 4 groups, 3 courts**

1. 建一場會內賽，報名足夠球員（至少 4 組 × 6 人 = 24 人，等級隨意），場地設 3 個。
2. 分組頁：用「各組等級均分」分成 4 組，每組設定棒次。
3. 點「確認分組，開始賽程」。
4. 賽程頁點「產生對戰＋分配場地」，確認：
   - 總共產生 36 場比賽。
   - 沒有錯誤 toast（若場地數不是 3，或組數是奇數，應該會看到 Task 7 那兩則新錯誤訊息，先確認這條路徑也正常）。
5. 到 viewer（`/t/<id>`）賽程頁「分組列表」檢視，確認顯示的是「A組 vs B組」這種配對標題，不是單一組名；「場地列表」檢視三個場地的比賽數應該接近平均（12 場左右）。
6. 計分幾場，到排名頁確認組跟組的名次有正確反映勝負（贏的那組戰績不會出現在輸的那組上）。

- [ ] **Step 4: Manual walkthrough — friendly format regression check**

1. 建一場友誼賽，走一次原本流程：分組 → 依等級自動分組（自動配對）→ 產生對戰 → 計分。
2. 確認一切跟這次改動之前的行為完全一樣（循環圖檢視還在、分組列表還是照單一組分、排名還是配對排名）。

- [ ] **Step 5: If both walkthroughs pass, this feature is done**

No further step — this is the final task in the plan.

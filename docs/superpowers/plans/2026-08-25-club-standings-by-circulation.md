# 會內賽排名表改用「循環比總分」計勝 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 會內賽排名表的「勝/負」改成以「循環（roundNumber）+ 對戰兩組」為單位比總分決勝，不再是把個人賽勝負直接加總；「總得分/總失分」改成每場已完成個人賽只計一次（修正原本雙打兩位球員各記一次的重複計分）。

**Architecture:** 重寫 `lib/player-standings.ts` 的 `computeGroupStandings`（移除已無人使用的 `computePlayerStandings`），`MatchResult` 型別新增 `roundNumber` 欄位；`standings/route.ts` 呼叫端多帶 `roundNumber` 進去，其餘（API 回傳形狀、`standings-tab.tsx` 顯示）完全不動。

**Tech Stack:** TypeScript、Vitest。

**Design doc:** `docs/superpowers/specs/2026-08-25-club-standings-by-circulation-design.md`

---

## Task 1: 重寫 `lib/player-standings.ts` 與其測試

**Files:**
- Modify: `tests/unit/player-standings.test.ts` (full rewrite)
- Modify: `src/lib/player-standings.ts` (full rewrite)

- [ ] **Step 1: 用新測試取代整份測試檔**

Replace the entire content of `tests/unit/player-standings.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { computeGroupStandings, type MatchResult } from '@/lib/player-standings';

function match(opts: {
  round: number;
  a: string;
  b: string;
  scoreA: number;
  scoreB: number;
  status?: 'pending' | 'completed';
}): MatchResult {
  return {
    pairAGroupId: opts.a,
    pairBGroupId: opts.b,
    roundNumber: opts.round,
    status: opts.status ?? 'completed',
    scoreA: opts.scoreA,
    scoreB: opts.scoreB,
    pairAPlayerIds: [`${opts.a}-p1`, `${opts.a}-p2`],
    pairBPlayerIds: [`${opts.b}-p1`, `${opts.b}-p2`],
  };
}

describe('computeGroupStandings', () => {
  it('a fully-completed circulation gives 1 win to the group with the higher combined total, not 1 win per individual match', () => {
    // Round 1, group A vs group B, 3 individual matches (like 3 doubles
    // pairs from a 6-person group). A wins 2 of the 3 individual matches,
    // but B's COMBINED total across all 3 is higher -- B should get the
    // circulation's 1 win, not A. This is the exact bug being fixed: the
    // old code would have credited A with "2 wins" (one per match won).
    const matches: MatchResult[] = [
      match({ round: 1, a: 'A', b: 'B', scoreA: 11, scoreB: 9 }),
      match({ round: 1, a: 'A', b: 'B', scoreA: 11, scoreB: 9 }),
      match({ round: 1, a: 'A', b: 'B', scoreA: 1, scoreB: 11 }),
    ];
    // A's total: 11+11+1 = 23. B's total: 9+9+11 = 29.
    const rows = computeGroupStandings(matches);
    const a = rows.find((r) => r.groupId === 'A')!;
    const b = rows.find((r) => r.groupId === 'B')!;
    expect(b.wins).toBe(1);
    expect(b.losses).toBe(0);
    expect(a.wins).toBe(0);
    expect(a.losses).toBe(1);
    expect(a.played).toBe(1);
    expect(b.played).toBe(1);
  });

  it('a circulation with any match still pending does not count toward wins/losses yet, but completed matches still add to points-for/against', () => {
    const matches: MatchResult[] = [
      match({ round: 1, a: 'A', b: 'B', scoreA: 11, scoreB: 5, status: 'completed' }),
      match({ round: 1, a: 'A', b: 'B', scoreA: 3, scoreB: 2, status: 'pending' }),
    ];
    const rows = computeGroupStandings(matches);
    const a = rows.find((r) => r.groupId === 'A')!;
    const b = rows.find((r) => r.groupId === 'B')!;
    expect(a.wins).toBe(0);
    expect(a.losses).toBe(0);
    expect(a.played).toBe(0);
    expect(a.pointsFor).toBe(11);
    expect(a.pointsAgainst).toBe(5);
    expect(b.pointsFor).toBe(5);
    expect(b.pointsAgainst).toBe(11);
  });

  it('counts a single match\'s score once toward points-for/against, not once per player', () => {
    const matches: MatchResult[] = [match({ round: 1, a: 'A', b: 'B', scoreA: 11, scoreB: 7 })];
    const rows = computeGroupStandings(matches);
    const a = rows.find((r) => r.groupId === 'A')!;
    const b = rows.find((r) => r.groupId === 'B')!;
    expect(a.pointsFor).toBe(11);
    expect(a.pointsAgainst).toBe(7);
    expect(b.pointsFor).toBe(7);
    expect(b.pointsAgainst).toBe(11);
  });

  it('ranks groups by wins desc, then points-for desc, then points-against asc', () => {
    const matches: MatchResult[] = [
      match({ round: 1, a: 'A', b: 'B', scoreA: 11, scoreB: 5 }),
      match({ round: 2, a: 'C', b: 'B', scoreA: 11, scoreB: 9 }),
    ];
    const rows = computeGroupStandings(matches);
    // A and C both have 1 win / 0 losses / 11 points-for (tied on both) --
    // A ranks above C because A conceded fewer points (5 < 9). B lost both
    // circulations it played, ranks last.
    const order = rows.map((r) => r.groupId);
    expect(order).toEqual(['A', 'C', 'B']);
    expect(rows[0].rank).toBe(1);
    expect(rows[1].rank).toBe(2);
    expect(rows[2].rank).toBe(3);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/player-standings.test.ts`
Expected: FAIL — either compile errors (`roundNumber` doesn't exist on `MatchResult` yet, `computePlayerStandings` import removed but old `player-standings.ts` still exports the old shape) or assertion failures against the current per-match-win-tally behavior.

- [ ] **Step 3: Rewrite `src/lib/player-standings.ts`**

Replace the entire file content with:

```typescript
export type MatchResult = {
  pairAGroupId: string;
  pairBGroupId: string;
  roundNumber: number;
  status: 'pending' | 'completed';
  scoreA: number;
  scoreB: number;
  pairAPlayerIds: [string, string];
  pairBPlayerIds: [string, string];
};

export type GroupStandingRow = {
  groupId: string;
  wins: number;
  losses: number;
  played: number;
  pointDiff: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
};

type UnrankedRow = Omit<GroupStandingRow, 'rank'>;

/**
 * Ranks a club-format tournament's GROUPS against each other. A club
 * match's win/loss is decided at the CIRCULATION level (one
 * roundNumber's group-A-vs-group-B pairing, which spans several
 * individual matches -- e.g. 3 doubles pairs from a 6-person group all
 * playing the other group's 3 pairs) -- not per individual match. Once
 * every match in a circulation is completed, whichever group's combined
 * score across all of them is higher gets 1 win for that circulation
 * (the other gets 1 loss). A circulation with any match still pending
 * contributes nothing to wins/losses yet.
 *
 * points-for/points-against are a straight sum of every completed
 * individual match's own score, counted once per match (not once per
 * player) -- these update live regardless of whether their circulation's
 * win/loss has been decided yet.
 *
 * Ranking: wins desc, then points-for desc, then points-against asc
 * (fewer conceded ranks higher). Ranks use SQL RANK() semantics: tied
 * rows share a rank, the next distinct row's rank skips ahead by the
 * number of ties.
 */
export function computeGroupStandings(matches: MatchResult[]): GroupStandingRow[] {
  const byGroup = new Map<string, UnrankedRow>();
  function group(groupId: string): UnrankedRow {
    let g = byGroup.get(groupId);
    if (!g) {
      g = { groupId, wins: 0, losses: 0, played: 0, pointDiff: 0, pointsFor: 0, pointsAgainst: 0 };
      byGroup.set(groupId, g);
    }
    return g;
  }

  // Every group that's ever appeared shows up in the table, even at
  // 0/0/0 before anything's decided.
  for (const m of matches) {
    group(m.pairAGroupId);
    group(m.pairBGroupId);
  }

  // points-for/points-against: once per completed match, not once per player.
  for (const m of matches) {
    if (m.status !== 'completed') continue;
    const a = group(m.pairAGroupId);
    a.pointsFor += m.scoreA;
    a.pointsAgainst += m.scoreB;
    a.pointDiff += m.scoreA - m.scoreB;
    const b = group(m.pairBGroupId);
    b.pointsFor += m.scoreB;
    b.pointsAgainst += m.scoreA;
    b.pointDiff += m.scoreB - m.scoreA;
  }

  // wins/losses: one per fully-completed circulation, decided by each
  // side's combined score across every match in that circulation.
  const byCirculation = new Map<string, MatchResult[]>();
  for (const m of matches) {
    const key = `${m.roundNumber}|${m.pairAGroupId}|${m.pairBGroupId}`;
    const arr = byCirculation.get(key) ?? [];
    arr.push(m);
    byCirculation.set(key, arr);
  }
  for (const bucket of byCirculation.values()) {
    if (bucket.some((m) => m.status !== 'completed')) continue;
    const { pairAGroupId, pairBGroupId } = bucket[0];
    let totalA = 0;
    let totalB = 0;
    for (const m of bucket) {
      totalA += m.scoreA;
      totalB += m.scoreB;
    }
    // ponytail: an exact tie isn't possible under this tournament's rules
    // (confirmed with the organizer), so the `else` branch below is an
    // arbitrary-but-non-crashing default rather than something expected
    // to actually happen.
    if (totalA > totalB) {
      group(pairAGroupId).wins++;
      group(pairBGroupId).losses++;
    } else {
      group(pairBGroupId).wins++;
      group(pairAGroupId).losses++;
    }
  }

  for (const g of byGroup.values()) {
    g.played = g.wins + g.losses;
  }

  const sorted = [...byGroup.values()].sort(
    (x, y) => y.wins - x.wins || y.pointsFor - x.pointsFor || x.pointsAgainst - y.pointsAgainst,
  );
  const result: GroupStandingRow[] = [];
  let rank = 0;
  let prevKey: string | null = null;
  sorted.forEach((g, i) => {
    const key = `${g.wins}|${g.pointsFor}|${g.pointsAgainst}`;
    if (key !== prevKey) rank = i + 1;
    prevKey = key;
    result.push({ ...g, rank });
  });
  return result;
}
```

Note: `computePlayerStandings` and `PlayerStandingRow` are intentionally NOT carried over — confirmed via the design doc that nothing else in the codebase imports them (the only place they were used was internally to build the old `computeGroupStandings`), so this is dead code being removed, not a breaking change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit/player-standings.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Typecheck and lint**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx eslint src/lib/player-standings.ts tests/unit/player-standings.test.ts`
Expected: errors pointing at `src/app/api/tournaments/[id]/standings/route.ts` (it still constructs the old `MatchResult` shape without `roundNumber`, and no longer imports anything removed since it never imported `computePlayerStandings`/`PlayerStandingRow`) — that's expected and gets fixed in Task 2. If `tsc`/`eslint` report errors ONLY in that route file, that's fine to proceed; if they report errors anywhere else, stop and investigate before continuing.

- [ ] **Step 6: Commit**

```bash
cd "C:\Private\badminton-game"
git add src/lib/player-standings.ts tests/unit/player-standings.test.ts
git commit -m "feat(standings): club group wins are decided per circulation, not per match

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: 更新 `standings/route.ts` 帶入 `roundNumber`

**Files:**
- Modify: `src/app/api/tournaments/[id]/standings/route.ts`

- [ ] **Step 1: 加上 `roundNumber` 欄位**

Find:
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

Replace:
```typescript
    const results: MatchResult[] = matches.map((m) => ({
      pairAGroupId: m.pairA.groupId,
      pairBGroupId: m.pairB.groupId,
      roundNumber: m.roundNumber,
      status: m.status,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      pairAPlayerIds: [m.pairA.player1Id, m.pairA.player2Id],
      pairBPlayerIds: [m.pairB.player1Id, m.pairB.player2Id],
    }));
```

Nothing else in this file needs to change — the `computeGroupStandings(results).map((r) => ({ group_id: r.groupId, wins: r.wins, ... }))` block right below stays exactly as-is, since `GroupStandingRow`'s field names are unchanged.

- [ ] **Step 2: Typecheck and lint**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx eslint "src/app/api/tournaments/[id]/standings/route.ts"`
Expected: no errors anywhere now.

- [ ] **Step 3: Run the full unit suite**

Run: `cd "C:\Private\badminton-game" && npx vitest run tests/unit`
Expected: all tests pass (44 existing minus the old player-standings tests that got replaced, plus the 4 new ones — confirm the actual total in the output, don't assume a specific number).

- [ ] **Step 4: Commit**

```bash
cd "C:\Private\badminton-game"
git add "src/app/api/tournaments/[id]/standings/route.ts"
git commit -m "feat(standings): pass roundNumber through to the club standings calculation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Final verification and manual walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck, lint, and test suite**

Run: `cd "C:\Private\badminton-game" && npx tsc --noEmit -p . && npx vitest run tests/unit`
Expected: no type errors, all tests pass.

- [ ] **Step 2: Push**

```bash
cd "C:\Private\badminton-game"
git push
```

- [ ] **Step 3: Manual walkthrough**

1. 開一個會內賽（club format）測試賽事，產生賽程，跑完至少 2 個循環的所有比賽。
2. 刻意讓某一循環裡「總分較高的一組」不是「贏比較多場個人賽的那一組」（例如 A 組在某循環贏 2 場個人賽但總分反而較低），確認排名表的「勝」是算給總分較高的那組，不是贏場數較多的那組。
3. 確認「場次」欄位等於「勝+負」（已分出勝負的循環數），不是個人賽場次。
4. 確認「總得分」「總失分」是每場個人賽分數各計一次（不是雙倍）。
5. 刻意讓某循環還有比賽未完成，確認排名表「勝/負」還沒把這個循環算進去，但「總得分/總失分」已經把已完成的那幾場算進去了。
6. 確認同勝場數時，排序依總得分高→總失分低。

- [ ] **Step 4: If the walkthrough passes, this feature is done**

No further step — this is the final task in the plan.

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

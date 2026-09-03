import { describe, it, expect } from 'vitest';
import { computeGroupStandings, type MatchResult } from '@/lib/player-standings';

function match(opts: {
  round: number;
  order: number;
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
    matchOrder: opts.order,
    status: opts.status ?? 'completed',
    scoreA: opts.scoreA,
    scoreB: opts.scoreB,
    pairAPlayerIds: [`${opts.a}-p1`, `${opts.a}-p2`],
    pairBPlayerIds: [`${opts.b}-p1`, `${opts.b}-p2`],
  };
}

describe('computeGroupStandings (relay cumulative scoring)', () => {
  it('the group that reaches the final target score first wins the circulation — decided by the final segment, not by summing segments', () => {
    // 3 segments, ppg=11: cumulative scores 0:11 → 5:22 → 15:33.
    // B reached the finish score (33) first → B gets the circulation's 1 win.
    const matches: MatchResult[] = [
      match({ round: 1, order: 1, a: 'A', b: 'B', scoreA: 0, scoreB: 11 }),
      match({ round: 1, order: 2, a: 'A', b: 'B', scoreA: 5, scoreB: 22 }),
      match({ round: 1, order: 3, a: 'A', b: 'B', scoreA: 15, scoreB: 33 }),
    ];
    const rows = computeGroupStandings(matches);
    const a = rows.find((r) => r.groupId === 'A')!;
    const b = rows.find((r) => r.groupId === 'B')!;
    expect(b.wins).toBe(1);
    expect(b.losses).toBe(0);
    expect(a.wins).toBe(0);
    expect(a.losses).toBe(1);
    // points = final cumulative score, NOT 0+5+15 / 11+22+33
    expect(a.pointsFor).toBe(15);
    expect(a.pointsAgainst).toBe(33);
    expect(b.pointsFor).toBe(33);
    expect(b.pointsAgainst).toBe(15);
  });

  it('a circulation with a pending segment gives no win/loss yet; points track the latest completed segment live', () => {
    const matches: MatchResult[] = [
      match({ round: 1, order: 1, a: 'A', b: 'B', scoreA: 5, scoreB: 11 }),
      match({ round: 1, order: 2, a: 'A', b: 'B', scoreA: 12, scoreB: 22 }),
      match({ round: 1, order: 3, a: 'A', b: 'B', scoreA: 15, scoreB: 25, status: 'pending' }),
    ];
    const rows = computeGroupStandings(matches);
    const a = rows.find((r) => r.groupId === 'A')!;
    expect(a.wins).toBe(0);
    expect(a.losses).toBe(0);
    expect(a.played).toBe(0);
    // latest completed segment (order 2) carries the running total
    expect(a.pointsFor).toBe(12);
    expect(a.pointsAgainst).toBe(22);
  });

  it('ranks groups by wins desc, then points-for desc, then points-against asc', () => {
    const matches: MatchResult[] = [
      match({ round: 1, order: 1, a: 'A', b: 'B', scoreA: 11, scoreB: 5 }),
      match({ round: 2, order: 1, a: 'C', b: 'B', scoreA: 11, scoreB: 9 }),
    ];
    const rows = computeGroupStandings(matches);
    // A and C both 1 win / 11 points-for — A ranks above C because A
    // conceded fewer points (5 < 9). B lost both circulations, ranks last.
    expect(rows.map((r) => r.groupId)).toEqual(['A', 'C', 'B']);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks a (manually forced) finish-total tie by overall points-against', () => {
    const matches: MatchResult[] = [
      // Round 1 finish tied 23:23 (only possible via manual edits).
      match({ round: 1, order: 1, a: 'A', b: 'B', scoreA: 11, scoreB: 6 }),
      match({ round: 1, order: 2, a: 'A', b: 'B', scoreA: 23, scoreB: 23 }),
      // Round 2: A beats C — C's 11 points inflate A's overall
      // points-against, tipping the round 1 tiebreak toward B.
      match({ round: 2, order: 1, a: 'A', b: 'C', scoreA: 15, scoreB: 11 }),
    ];
    const rows = computeGroupStandings(matches);
    const a = rows.find((r) => r.groupId === 'A')!;
    const b = rows.find((r) => r.groupId === 'B')!;
    // B conceded 23 overall, A conceded 34 (23 + 11) → B takes round 1.
    expect(b.wins).toBe(1);
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(1);
  });

  it('when finish total AND overall points-against also tie (fully undecidable), both groups get the win', () => {
    const matches: MatchResult[] = [
      match({ round: 1, order: 1, a: 'A', b: 'B', scoreA: 11, scoreB: 6 }),
      match({ round: 1, order: 2, a: 'A', b: 'B', scoreA: 17, scoreB: 17 }),
    ];
    const rows = computeGroupStandings(matches);
    const a = rows.find((r) => r.groupId === 'A')!;
    const b = rows.find((r) => r.groupId === 'B')!;
    expect(a.wins).toBe(1);
    expect(a.losses).toBe(0);
    expect(b.wins).toBe(1);
    expect(b.losses).toBe(0);
  });
});

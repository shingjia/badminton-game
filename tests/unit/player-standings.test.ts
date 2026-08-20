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

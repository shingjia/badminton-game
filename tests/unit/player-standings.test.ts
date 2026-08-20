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

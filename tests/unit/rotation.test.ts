import { describe, it, expect } from 'vitest';
import { splitByLevel2 } from '@/lib/rotation';
import { rotationSchedule } from '@/lib/rotation';

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

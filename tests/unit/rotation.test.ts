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

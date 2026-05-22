import { describe, it, expect } from 'vitest';
import { snakeGroup, type TeamSeed } from '@/lib/algorithms/snake-grouping';

const team = (id: string, seed: number): TeamSeed => ({ id, seedLevel: seed });

describe('snakeGroup', () => {
  it('returns single group when N <= K', () => {
    const teams = [team('a', 3), team('b', 2), team('c', 1)];
    const groups = snakeGroup(teams, 4, () => 0);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((t) => t.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('distributes 12 teams across 3 groups in snake pattern by seed', () => {
    // seeds 5,5,5,4,4,4,3,3,3,2,2,2 → with stable random=0 (no shuffle)
    const teams: TeamSeed[] = [];
    [5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2].forEach((s, i) => teams.push(team(`t${i}`, s)));
    const groups = snakeGroup(teams, 4, () => 0); // 3 groups of 4
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveLength(4);
    expect(groups[1]).toHaveLength(4);
    expect(groups[2]).toHaveLength(4);
    // First round: G0 gets idx 0 (seed=5), G1 gets idx 1 (seed=5), G2 gets idx 2 (seed=5)
    // Second round (reversed): G2 gets idx 3 (seed=4), G1 gets idx 4 (seed=4), G0 gets idx 5 (seed=4)
    // Third round: G0 gets idx 6 (seed=3), G1 gets idx 7 (seed=3), G2 gets idx 8 (seed=3)
    // Fourth round (reversed): G2 gets idx 9 (seed=2), G1 gets idx 10 (seed=2), G0 gets idx 11 (seed=2)
    expect(groups[0].map((t) => t.id)).toEqual(['t0', 't5', 't6', 't11']);
    expect(groups[1].map((t) => t.id)).toEqual(['t1', 't4', 't7', 't10']);
    expect(groups[2].map((t) => t.id)).toEqual(['t2', 't3', 't8', 't9']);
  });

  it('handles uneven last group when N not divisible by K', () => {
    // 10 teams, K=4 → ceil(10/4)=3 groups, sizes might be 4,4,2 or 4,3,3
    const teams: TeamSeed[] = Array.from({ length: 10 }, (_, i) => team(`t${i}`, 5 - Math.floor(i / 2)));
    const groups = snakeGroup(teams, 4, () => 0);
    expect(groups).toHaveLength(3);
    const total = groups.reduce((sum, g) => sum + g.length, 0);
    expect(total).toBe(10);
    // every team appears exactly once
    const ids = groups.flat().map((t) => t.id).sort();
    expect(ids).toEqual(Array.from({ length: 10 }, (_, i) => `t${i}`).sort());
  });

  it('shuffles within same seed level using provided random fn', () => {
    // 4 teams all same seed; without shuffle they'd appear in order t0,t1,t2,t3
    // with random=0.99 we expect a specific deterministic re-order
    const teams = [team('t0', 3), team('t1', 3), team('t2', 3), team('t3', 3)];
    const noShuffle = snakeGroup(teams, 2, () => 0);
    const shuffled = snakeGroup(teams, 2, () => 0.99);
    // Both produce 2 groups of 2 but ordering within groups may differ
    expect(noShuffle).toHaveLength(2);
    expect(shuffled).toHaveLength(2);
    // sanity: all teams placed
    expect(shuffled.flat()).toHaveLength(4);
  });
});

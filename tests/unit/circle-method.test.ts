import { describe, it, expect } from 'vitest';
import { roundRobinPairs, type Pair } from '@/lib/algorithms/circle-method';

describe('roundRobinPairs', () => {
  it('returns empty array for 0 or 1 teams', () => {
    expect(roundRobinPairs([])).toEqual([]);
    expect(roundRobinPairs(['a'])).toEqual([]);
  });

  it('produces C(K,2) pairs for even K', () => {
    // 4 teams → 6 pairs across 3 rounds (2 per round)
    const pairs = roundRobinPairs(['a', 'b', 'c', 'd']);
    expect(pairs).toHaveLength(6);
    // 3 rounds, each round has 2 simultaneous matches
    const rounds = new Set(pairs.map((p) => p.roundNumber));
    expect(rounds.size).toBe(3);
    for (let r = 1; r <= 3; r++) {
      const inRound = pairs.filter((p) => p.roundNumber === r);
      expect(inRound).toHaveLength(2);
    }
    // matchOrder is unique 1..6
    const orders = pairs.map((p) => p.matchOrder).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6]);
    // every pair of teams appears exactly once (unordered)
    const seen = new Set<string>();
    for (const p of pairs) {
      const key = [p.teamA, p.teamB].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(6);
    // no team plays twice in same round
    for (let r = 1; r <= 3; r++) {
      const teamsThisRound = pairs.filter((p) => p.roundNumber === r).flatMap((p) => [p.teamA, p.teamB]);
      expect(new Set(teamsThisRound).size).toBe(teamsThisRound.length);
    }
  });

  it('produces correct count for odd K (skips bye)', () => {
    // 5 teams → C(5,2)=10 pairs, 5 rounds, each round 2 matches (one bye dropped)
    const pairs = roundRobinPairs(['a', 'b', 'c', 'd', 'e']);
    expect(pairs).toHaveLength(10);
    const rounds = new Set(pairs.map((p) => p.roundNumber));
    expect(rounds.size).toBe(5);
    // every pair unique
    const seen = new Set<string>();
    for (const p of pairs) {
      const key = [p.teamA, p.teamB].sort().join('|');
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBe(10);
    // matchOrder unique
    const orders = pairs.map((p) => p.matchOrder).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('produces 1 pair for K=2', () => {
    const pairs = roundRobinPairs(['a', 'b']);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].teamA).toBe('a');
    expect(pairs[0].teamB).toBe('b');
    expect(pairs[0].roundNumber).toBe(1);
    expect(pairs[0].matchOrder).toBe(1);
  });
});

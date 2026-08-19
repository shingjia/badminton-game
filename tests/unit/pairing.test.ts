import { describe, it, expect } from 'vitest';
import { seedPairs, levelPairs, shufflePairs } from '@/lib/pairing';

describe('seedPairs', () => {
  it('pairs adjacent seeds: 1-2, 3-4, ...', () => {
    const players = [
      { id: 'd', seed: 4 },
      { id: 'a', seed: 1 },
      { id: 'c', seed: 3 },
      { id: 'b', seed: 2 },
    ];
    const pairs = seedPairs(players);
    expect(pairs).toEqual([
      { player1Id: 'a', player2Id: 'b', displayOrder: 1 },
      { player1Id: 'c', player2Id: 'd', displayOrder: 2 },
    ]);
  });

  it('sorts unseeded players after seeded ones', () => {
    const players = [
      { id: 'x', seed: null },
      { id: 'a', seed: 1 },
      { id: 'b', seed: 2 },
      { id: 'y', seed: null },
    ];
    const pairs = seedPairs(players);
    expect(pairs).toEqual([
      { player1Id: 'a', player2Id: 'b', displayOrder: 1 },
      { player1Id: 'x', player2Id: 'y', displayOrder: 2 },
    ]);
  });

  it('throws odd_player_count for odd or empty input', () => {
    expect(() => seedPairs([{ id: 'a', seed: 1 }])).toThrow('odd_player_count');
    expect(() => seedPairs([])).toThrow('odd_player_count');
  });
});

describe('levelPairs', () => {
  it('pairs same-level players together', () => {
    const players = [
      { id: 'a1', level: '1' },
      { id: 'a2', level: '1' },
      { id: 'b1', level: '2' },
      { id: 'b2', level: '2' },
    ];
    const pairs = levelPairs(players);
    expect(pairs).toEqual([
      { player1Id: 'a1', player2Id: 'a2', displayOrder: 1 },
      { player1Id: 'b1', player2Id: 'b2', displayOrder: 2 },
    ]);
  });

  it('pairs odd-level leftovers with the nearest-level leftover', () => {
    // level 1: 1 player (leftover), level 2: 2 players (even), level 3: 1 player (leftover)
    const players = [
      { id: 'a', level: '1' },
      { id: 'b1', level: '2' },
      { id: 'b2', level: '2' },
      { id: 'c', level: '3' },
    ];
    const pairs = levelPairs(players);
    expect(pairs).toEqual([
      { player1Id: 'b1', player2Id: 'b2', displayOrder: 1 },
      { player1Id: 'a', player2Id: 'c', displayOrder: 2 }, // leftovers, nearest levels
    ]);
  });

  it('throws odd_player_count when leftovers cannot balance (odd total)', () => {
    expect(() => levelPairs([{ id: 'a', level: '1' }])).toThrow('odd_player_count');
  });
});

describe('shufflePairs (regression: still works alongside new methods)', () => {
  it('pairs every player exactly once', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const pairs = shufflePairs(ids, () => 0); // deterministic rng
    const seen = pairs.flatMap((p) => [p.player1Id, p.player2Id]);
    expect(new Set(seen).size).toBe(6);
  });
});

import { describe, it, expect } from 'vitest';
import { buildClubSchedule, type GroupRoster } from '@/lib/club-schedule';

describe('buildClubSchedule', () => {
  function roster(groupId: string, n: number): GroupRoster {
    return {
      groupId,
      players: Array.from({ length: n }, (_, i) => ({ id: `${groupId}${i + 1}`, seed: i + 1 })),
    };
  }

  it('throws odd_group_count for an odd number of groups', () => {
    expect(() => buildClubSchedule([roster('A', 6), roster('B', 6), roster('C', 6)])).toThrow(
      'odd_group_count',
    );
  });

  it('throws too_few_groups for fewer than 2 groups', () => {
    expect(() => buildClubSchedule([roster('A', 6)])).toThrow('too_few_groups');
  });

  it('4 groups x 6 players: every pair of groups plays exactly once, 36 matches total', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => roster(g, 6));
    const drafts = buildClubSchedule(groups);
    expect(drafts).toHaveLength(36);

    const pairingCounts = new Map<string, number>();
    for (const d of drafts) {
      const key = [d.groupAId, d.groupBId].sort().join('-');
      pairingCounts.set(key, (pairingCounts.get(key) ?? 0) + 1);
    }
    expect([...pairingCounts.keys()].sort()).toEqual(['A-B', 'A-C', 'A-D', 'B-C', 'B-D', 'C-D']);
    for (const count of pairingCounts.values()) expect(count).toBe(6);
  });

  it('4 groups -> 3 waves, each wave has exactly 2 simultaneous pairings on courts 0 and 1', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => roster(g, 6));
    const drafts = buildClubSchedule(groups);

    const byWave = new Map<number, Set<number>>();
    for (const d of drafts) {
      const set = byWave.get(d.roundNumber) ?? new Set<number>();
      set.add(d.pairingIndexInWave);
      byWave.set(d.roundNumber, set);
    }
    expect(byWave.size).toBe(3); // 4 groups -> 3 waves
    for (const indices of byWave.values()) {
      expect([...indices].sort()).toEqual([0, 1]);
    }
  });

  it('a pairing keeps all its segments on its own dedicated court (same pairingIndexInWave), ordered 1..n', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => roster(g, 6));
    const drafts = buildClubSchedule(groups);
    const byPairing = new Map<string, { indices: Set<number>; orders: number[] }>();
    for (const d of drafts) {
      const key = [d.groupAId, d.groupBId].sort().join('-');
      const entry = byPairing.get(key) ?? { indices: new Set(), orders: [] };
      entry.indices.add(d.pairingIndexInWave);
      entry.orders.push(d.matchOrder);
      byPairing.set(key, entry);
    }
    for (const entry of byPairing.values()) {
      expect(entry.indices.size).toBe(1); // relay: one court per pairing
      expect([...entry.orders].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });
});

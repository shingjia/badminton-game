import { describe, it, expect } from 'vitest';
import { buildClubSchedule, primaryCourtCount, type GroupRoster } from '@/lib/club-schedule';

describe('primaryCourtCount', () => {
  it('balances 4 groups x 6 players -> keeps 4 matches on the primary court', () => {
    expect(primaryCourtCount(4, 6)).toBe(4);
  });

  it('clamps to [0, n]', () => {
    expect(primaryCourtCount(2, 3)).toBeGreaterThanOrEqual(0);
    expect(primaryCourtCount(100, 3)).toBeLessThanOrEqual(3);
  });
});

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

  it('splits each pairing 4 primary / 2 shared, every wave has exactly 2 pairings using courts 0 and 1', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => roster(g, 6));
    const drafts = buildClubSchedule(groups);

    const byPairing = new Map<string, { primary: number; shared: number }>();
    for (const d of drafts) {
      const key = [d.groupAId, d.groupBId].sort().join('-');
      const counts = byPairing.get(key) ?? { primary: 0, shared: 0 };
      counts[d.courtSlot]++;
      byPairing.set(key, counts);
    }
    for (const counts of byPairing.values()) {
      expect(counts.primary).toBe(4);
      expect(counts.shared).toBe(2);
    }

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

  it('interleaves shared-court matches across a wave\'s pairings instead of clumping', () => {
    const groups = ['A', 'B', 'C', 'D'].map((g) => roster(g, 6));
    const drafts = buildClubSchedule(groups);
    const wave1Shared = drafts.filter((d) => d.roundNumber === 1 && d.courtSlot === 'shared');
    expect(wave1Shared.map((d) => d.pairingIndexInWave)).toEqual([0, 1, 0, 1]);
  });
});

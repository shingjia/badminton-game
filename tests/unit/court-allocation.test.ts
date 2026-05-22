import { describe, it, expect } from 'vitest';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';

const m = (id: string, groupId: string, roundNumber: number): MatchInput => ({
  id,
  groupId,
  roundNumber,
});

describe('allocateCourts', () => {
  it('returns empty array when no matches', () => {
    expect(allocateCourts([], ['c1'])).toEqual([]);
  });

  it('assigns matches in same round across courts', () => {
    // 1 group, 2 matches in round 1, 2 courts → both placed simultaneously
    const matches = [m('m1', 'g1', 1), m('m2', 'g1', 1)];
    const result = allocateCourts(matches, ['c1', 'c2']);
    expect(result).toHaveLength(2);
    const courts = result.map((r) => r.courtId).sort();
    expect(courts).toEqual(['c1', 'c2']);
  });

  it('spreads round across courts and overflows to next slot when courts < matches in round', () => {
    // 3 matches in round 1, 2 courts → 2 in slot 1, 1 in slot 2
    const matches = [m('m1', 'gA', 1), m('m2', 'gB', 1), m('m3', 'gC', 1)];
    const result = allocateCourts(matches, ['c1', 'c2']);
    expect(result).toHaveLength(3);
    // First two get c1, c2; third overflows to c1 again (queue order)
    expect(result.find((r) => r.id === 'm1')?.courtId).toBe('c1');
    expect(result.find((r) => r.id === 'm2')?.courtId).toBe('c2');
    expect(result.find((r) => r.id === 'm3')?.courtId).toBe('c1');
  });

  it('processes rounds in increasing order', () => {
    // Round 1 has 1 match, round 2 has 2 matches, 2 courts
    const matches = [
      m('m3', 'gA', 2),
      m('m1', 'gA', 1),
      m('m2', 'gB', 2),
    ];
    const result = allocateCourts(matches, ['c1', 'c2']);
    expect(result.find((r) => r.id === 'm1')?.courtId).toBe('c1');
    expect(result.find((r) => r.id === 'm2')?.courtId).toBe('c1');
    expect(result.find((r) => r.id === 'm3')?.courtId).toBe('c2');
  });

  it('returns courtId=null when no courts available', () => {
    const matches = [m('m1', 'gA', 1)];
    const result = allocateCourts(matches, []);
    expect(result[0].courtId).toBeNull();
  });
});

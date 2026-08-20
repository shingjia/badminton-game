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

  it('processes rounds in increasing order, court cursor carries over between rounds', () => {
    // Round 1 has 1 match, round 2 has 2 matches, 2 courts.
    // The court cursor does NOT reset to 0 at the start of round 2 — it
    // continues from where round 1 left off. Otherwise court c1 always
    // gets first pick in every round, and with many groups sharing few
    // round numbers (club format) that bias stacks up onto c1 across
    // every round instead of spreading out.
    const matches = [
      m('m3', 'gA', 2),
      m('m1', 'gA', 1),
      m('m2', 'gB', 2),
    ];
    const result = allocateCourts(matches, ['c1', 'c2']);
    expect(result.find((r) => r.id === 'm1')?.courtId).toBe('c1'); // round 1, cursor 0
    expect(result.find((r) => r.id === 'm2')?.courtId).toBe('c2'); // round 2, cursor 1 (continued)
    expect(result.find((r) => r.id === 'm3')?.courtId).toBe('c1'); // round 2, cursor 2
  });

  it('returns courtId=null when no courts available', () => {
    const matches = [m('m1', 'gA', 1)];
    const result = allocateCourts(matches, []);
    expect(result[0].courtId).toBeNull();
  });

  it('keeps court load balanced across many groups sharing few round numbers (club-format regression)', () => {
    // 5 groups (club format), each with rounds 1 and 2 having 2 matches
    // and round 3 having 1 match — mirrors a 5-player-per-side rotation
    // schedule. 3 courts. Before the fix, court c1 always won every
    // round's "remainder" slot and ended up hosting far more matches
    // than c2/c3. After the fix, the spread should be close to even.
    const groups = ['A', 'B', 'C', 'D', 'E'];
    const matches: MatchInput[] = [];
    let n = 0;
    for (const g of groups) {
      matches.push(m(`m${n++}`, g, 1));
      matches.push(m(`m${n++}`, g, 1));
      matches.push(m(`m${n++}`, g, 2));
      matches.push(m(`m${n++}`, g, 2));
      matches.push(m(`m${n++}`, g, 3));
    }
    const result = allocateCourts(matches, ['c1', 'c2', 'c3']);
    const counts: Record<string, number> = { c1: 0, c2: 0, c3: 0 };
    for (const r of result) counts[r.courtId!]++;
    // 25 matches / 3 courts = 8 or 9 each — no court should be starved
    // or overloaded the way a per-round reset would cause.
    for (const c of ['c1', 'c2', 'c3']) {
      expect(counts[c]).toBeGreaterThanOrEqual(8);
      expect(counts[c]).toBeLessThanOrEqual(9);
    }
  });
});

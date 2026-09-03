import { describe, it, expect } from 'vitest';
import { carryToNext } from '@/lib/club-relay';

/**
 * 累計接力計分制的核心規則：
 *   - 第 N 段（matchOrder = N）的換人分數 = N × pointsPerGame
 *   - 任一隊累計達到換人分數即結束該段
 *   - 整場勝負結束分數 = 段數 × pointsPerGame（由最後一段的換人分等於總段數 × ppg 隱含）
 */

function relayTarget(matchOrder: number, pointsPerGame: number): number {
  return matchOrder * pointsPerGame;
}

function isSegmentDone(scoreA: number, scoreB: number, matchOrder: number, pointsPerGame: number): boolean {
  return Math.max(scoreA, scoreB) >= relayTarget(matchOrder, pointsPerGame);
}

describe('club relay scoring — target score per segment', () => {
  it('segment 1 target = 1 × ppg', () => {
    expect(relayTarget(1, 11)).toBe(11);
  });

  it('segment 3 target = 3 × 11 = 33', () => {
    expect(relayTarget(3, 11)).toBe(33);
  });

  it('segment 6 target = 6 × 11 = 66 (final finish score with 6 segments)', () => {
    expect(relayTarget(6, 11)).toBe(66);
  });

  it('segment not done when both scores below target', () => {
    expect(isSegmentDone(10, 10, 1, 11)).toBe(false);
  });

  it('segment done when one side reaches cumulative target', () => {
    // Example from spec: after segment 1 (0:11), segment 2 target = 22
    // After segment 2 ends at 0:22, segment 3 target = 33
    expect(isSegmentDone(0, 22, 2, 11)).toBe(true);
  });

  it('segment done when underdog catches up to reach target', () => {
    // Side A was trailing but catches up to the target
    expect(isSegmentDone(33, 20, 3, 11)).toBe(true);
  });

  it('final segment (6) done at score 66 — match winner decided', () => {
    // After 6 segments of 11 pts each, finish score = 66
    expect(isSegmentDone(66, 40, 6, 11)).toBe(true);
  });

  it('target formula is segment-based not prior-score-based', () => {
    // Spec says: if A vs B result after seg1 is 0:11,
    // seg2 target is 22 (NOT 0+11+11=22 from "previous end score + 11").
    // Either way is 22 in this case, but the next example distinguishes:
    // After seg3 finishes 0:33, seg4 target must be 44,
    // regardless of what the seg3 running score was at segment end.
    expect(relayTarget(4, 11)).toBe(44);
  });
});

describe('club relay scoring — win/loss judgement', () => {
  it('total finish score with 6 pairs per side × ppg=11 is 66', () => {
    const pairsPerSide = 6;
    const ppg = 11;
    expect(relayTarget(pairsPerSide, ppg)).toBe(66);
  });

  it('total finish score with 3 pairs per side × ppg=21 is 63', () => {
    expect(relayTarget(3, 21)).toBe(63);
  });
});

describe('club relay scoring — carry finished score into next segment', () => {
  const pending = (scoreA: number, scoreB: number) => ({ scoreA, scoreB, status: 'pending' });

  it('segment 1 ends 0:11 → segment 2 starts at 0:11', () => {
    expect(carryToNext(pending(0, 10), { scoreA: 0, scoreB: 11 }, 'completed', pending(0, 0)))
      .toEqual({ scoreA: 0, scoreB: 11 });
  });

  it('does not clobber a next segment already in progress', () => {
    // seg1 corrected 3:11 → 5:11 while seg2 already at 6:14
    expect(carryToNext({ scoreA: 3, scoreB: 11, status: 'completed' }, { scoreA: 5, scoreB: 11 }, 'completed', pending(6, 14)))
      .toBeNull();
  });

  it('re-carries a correction when next segment is still at the old carry', () => {
    expect(carryToNext({ scoreA: 3, scoreB: 11, status: 'completed' }, { scoreA: 5, scoreB: 11 }, 'completed', pending(3, 11)))
      .toEqual({ scoreA: 5, scoreB: 11 });
  });

  it('retracts the carry when segment is reverted to pending', () => {
    // accidental +1 to 11 carried 3:11, then -1 back to 10 → next resets to 0:0
    expect(carryToNext({ scoreA: 3, scoreB: 11, status: 'completed' }, { scoreA: 3, scoreB: 10 }, 'pending', pending(3, 11)))
      .toEqual({ scoreA: 0, scoreB: 0 });
  });

  it('never touches a completed next segment, and no-ops without one', () => {
    expect(carryToNext(pending(0, 10), { scoreA: 0, scoreB: 11 }, 'completed', { scoreA: 0, scoreB: 22, status: 'completed' }))
      .toBeNull();
    expect(carryToNext(pending(0, 10), { scoreA: 0, scoreB: 11 }, 'completed', null)).toBeNull();
  });
});

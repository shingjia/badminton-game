import { describe, it, expect } from 'vitest';
import { colorForIndex } from '@/lib/badge-colors';

describe('colorForIndex', () => {
  it('returns the same color for the same index every time', () => {
    expect(colorForIndex(0)).toBe(colorForIndex(0));
    expect(colorForIndex(3)).toBe(colorForIndex(3));
  });

  it('cycles (wraps around) once the index exceeds the palette length, without going out of range', () => {
    // Palette has 8 colors — index 8 must wrap back to whatever index 0 is,
    // not return undefined.
    expect(colorForIndex(8)).toBe(colorForIndex(0));
    expect(colorForIndex(9)).toBe(colorForIndex(1));
    expect(colorForIndex(8)).not.toBeUndefined();
  });

  it('gives different indices different colors within one palette cycle', () => {
    expect(colorForIndex(0)).not.toBe(colorForIndex(1));
  });
});

export type LevelPlayer = { id: string; level: string | null };
export type SeededPlayer = { id: string; seed: number | null };

/**
 * Splits a group's players into two level-balanced sides (round-robin by
 * level, same distribution logic as the "各組等級均分" grouping method,
 * but with exactly 2 buckets).
 * Throws 'unequal_sides' if the two sides don't land on equal counts,
 * 'side_too_small' if either side would have fewer than 3 players
 * (fewer than 3 makes the circular partner rotation degenerate — with
 * only 2 players the "circle" is the same pair twice).
 */
export function splitByLevel2(players: LevelPlayer[]): { sideA: string[]; sideB: string[] } {
  const byLevel = new Map<string, string[]>();
  for (const p of players) {
    const lvl = p.level ?? 'unassigned';
    const arr = byLevel.get(lvl) ?? [];
    arr.push(p.id);
    byLevel.set(lvl, arr);
  }

  const buckets: string[][] = [[], []];
  let cursor = 0;
  for (const lvl of [...byLevel.keys()].sort()) {
    for (const id of byLevel.get(lvl)!) {
      buckets[cursor % 2].push(id);
      cursor++;
    }
  }

  const [sideA, sideB] = buckets;
  if (sideA.length !== sideB.length) throw new Error('unequal_sides');
  if (sideA.length < 3) throw new Error('side_too_small');
  return { sideA, sideB };
}

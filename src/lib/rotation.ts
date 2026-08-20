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

export type RotationMatchDraft = {
  sideAPlayers: [string, string];
  sideBPlayers: [string, string];
  roundNumber: number;
  matchOrder: number;
};

/**
 * Orders each side by 棒次 (seed, nulls sort last), forms n circular
 * adjacent partnerships per side (partnership[i] = side[i] + side[i+1],
 * wrapping), and pairs side A's k-th partnership against side B's k-th
 * partnership — n matches total.
 *
 * Round assignment: match k shares a player with match k-1 and k+1
 * (adjacent partnerships overlap by one player), forming a cycle graph.
 * Even n is 2-colorable (alternate rounds); odd n needs a 3rd round for
 * the last match, since an odd cycle isn't 2-colorable.
 *
 * Throws 'unequal_sides' / 'side_too_small' — same rules as splitByLevel2,
 * checked again here since this can be called directly.
 */
export function rotationSchedule(sideA: SeededPlayer[], sideB: SeededPlayer[]): RotationMatchDraft[] {
  if (sideA.length !== sideB.length) throw new Error('unequal_sides');
  const n = sideA.length;
  if (n < 3) throw new Error('side_too_small');

  const orderedA = orderBySeed(sideA);
  const orderedB = orderBySeed(sideB);
  const partnershipsA = circularPartnerships(orderedA);
  const partnershipsB = circularPartnerships(orderedB);

  const drafts: RotationMatchDraft[] = [];
  for (let k = 0; k < n; k++) {
    const roundNumber = n % 2 === 0 ? (k % 2) + 1 : k < n - 1 ? (k % 2) + 1 : 3;
    drafts.push({
      sideAPlayers: partnershipsA[k],
      sideBPlayers: partnershipsB[k],
      roundNumber,
      matchOrder: k + 1,
    });
  }
  return drafts;
}

function orderBySeed(players: SeededPlayer[]): string[] {
  return [...players]
    .sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity))
    .map((p) => p.id);
}

function circularPartnerships(ordered: string[]): [string, string][] {
  const n = ordered.length;
  return ordered.map((id, i) => [id, ordered[(i + 1) % n]] as [string, string]);
}

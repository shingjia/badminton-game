export type TeamSeed = { id: string; seedLevel: number };

/**
 * Distribute teams into G = ceil(N/K) groups using snake/serpentine pattern.
 * Higher seedLevel placed first. Within same seedLevel, deterministic shuffle
 * using rng() returning [0,1).
 */
export function snakeGroup<T extends TeamSeed>(
  teams: T[],
  teamsPerGroup: number,
  rng: () => number = Math.random,
): T[][] {
  if (teams.length === 0) return [];
  const groupCount = Math.ceil(teams.length / teamsPerGroup);
  if (groupCount === 1) return [[...teams]];

  // 1. sort by seedLevel DESC, stable; shuffle within same seed
  const byLevel = new Map<number, T[]>();
  for (const t of teams) {
    const arr = byLevel.get(t.seedLevel) ?? [];
    arr.push(t);
    byLevel.set(t.seedLevel, arr);
  }
  const sortedLevels = [...byLevel.keys()].sort((a, b) => b - a);
  const ordered: T[] = [];
  for (const lvl of sortedLevels) {
    const bucket = byLevel.get(lvl)!.slice();
    // Fisher-Yates with provided rng (right-biased: rng()=>0 yields identity)
    for (let i = bucket.length - 1; i > 0; i--) {
      const j = i - Math.floor(rng() * (i + 1));
      [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
    }
    ordered.push(...bucket);
  }

  // 2. snake assign
  const groups: T[][] = Array.from({ length: groupCount }, () => []);
  ordered.forEach((team, i) => {
    const row = Math.floor(i / groupCount);
    const col = row % 2 === 0 ? i % groupCount : groupCount - 1 - (i % groupCount);
    groups[col].push(team);
  });

  return groups;
}

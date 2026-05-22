export type Pair = {
  teamA: string;
  teamB: string;
  roundNumber: number; // 1..K-1
  matchOrder: number;  // 1..C(K,2) within this group
};

/**
 * Standard circle method for round-robin pairing.
 * Returns all C(K,2) pairs labeled with roundNumber and a unique matchOrder.
 * Pairs from earlier rounds get lower matchOrder values.
 */
export function roundRobinPairs(teamIds: string[]): Pair[] {
  const k = teamIds.length;
  if (k < 2) return [];

  // For odd k, add a bye sentinel; we'll drop matches involving the bye.
  const BYE = '__bye__';
  const teams = k % 2 === 0 ? [...teamIds] : [...teamIds, BYE];
  const n = teams.length;
  const totalRounds = n - 1;

  // Circle method: fix index 0, rotate the rest.
  const fixed = teams[0];
  const rotating = teams.slice(1);

  const result: Pair[] = [];
  let matchOrder = 1;

  for (let round = 1; round <= totalRounds; round++) {
    const left = [fixed, ...rotating.slice(0, n / 2 - 1)];
    const right = rotating.slice(n / 2 - 1).reverse();

    for (let i = 0; i < n / 2; i++) {
      const a = left[i];
      const b = right[i];
      if (a === BYE || b === BYE) continue;
      result.push({ teamA: a, teamB: b, roundNumber: round, matchOrder: matchOrder++ });
    }

    // rotate
    rotating.unshift(rotating.pop()!);
  }

  return result;
}

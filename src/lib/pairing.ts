import type { PrismaClient } from '@prisma/client';

export type PairDraft = {
  player1Id: string;
  player2Id: string;
  displayOrder: number;
};

/**
 * Fisher-Yates shuffle then pair adjacent players.
 * Throws 'odd_player_count' if playerIds.length is odd or zero.
 * rng defaults to Math.random; pass a seeded function for deterministic tests.
 */
export function shufflePairs(playerIds: string[], rng: () => number = Math.random): PairDraft[] {
  if (playerIds.length === 0 || playerIds.length % 2 !== 0) {
    throw new Error('odd_player_count');
  }

  const arr = [...playerIds];

  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  const pairs: PairDraft[] = [];
  for (let i = 0; i < arr.length; i += 2) {
    pairs.push({
      player1Id: arr[i],
      player2Id: arr[i + 1],
      displayOrder: pairs.length + 1,
    });
  }

  return pairs;
}

function toPairs(orderedIds: string[]): PairDraft[] {
  if (orderedIds.length === 0 || orderedIds.length % 2 !== 0) {
    throw new Error('odd_player_count');
  }
  const pairs: PairDraft[] = [];
  for (let i = 0; i < orderedIds.length; i += 2) {
    pairs.push({
      player1Id: orderedIds[i],
      player2Id: orderedIds[i + 1],
      displayOrder: pairs.length + 1,
    });
  }
  return pairs;
}

/**
 * Pairs players by 棒次 (seed), adjacent numbers become partners:
 * seed 1 with 2, seed 3 with 4, ... Players without a seed sort after
 * seeded ones, in their given (array) order.
 * Throws 'odd_player_count' if players.length is odd or zero.
 */
export function seedPairs(players: { id: string; seed: number | null }[]): PairDraft[] {
  const ordered = [...players]
    .sort((a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity))
    .map((p) => p.id);
  return toPairs(ordered);
}

/**
 * Pairs players of the same level together. If a level has an odd count,
 * its leftover player is carried over and paired with the leftover from
 * the next-nearest level (levels sorted, leftovers paired adjacent).
 * Throws 'odd_player_count' if players.length is odd or zero.
 */
export function levelPairs(players: { id: string; level: string | null }[]): PairDraft[] {
  const byLevel = new Map<string, string[]>();
  for (const p of players) {
    const lvl = p.level ?? 'unassigned';
    const arr = byLevel.get(lvl) ?? [];
    arr.push(p.id);
    byLevel.set(lvl, arr);
  }

  const ordered: string[] = [];
  const leftovers: string[] = []; // one per odd-count level, in level-sorted order

  for (const lvl of [...byLevel.keys()].sort()) {
    const ids = byLevel.get(lvl)!;
    if (ids.length % 2 === 1) {
      leftovers.push(ids.pop()!);
    }
    ordered.push(...ids);
  }

  // Leftovers are already in level-sorted order — adjacent pairing here
  // pairs each with its nearest-level leftover.
  ordered.push(...leftovers);

  return toPairs(ordered);
}

/**
 * Deletes existing Pair rows for this group, then writes new ones.
 * Returns the created Pair rows.
 * Must be called inside a Prisma transaction.
 */
export async function writePairs(
  tx: Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >,
  tournamentId: string,
  groupId: string,
  drafts: PairDraft[],
) {
  await tx.pair.deleteMany({ where: { groupId } });

  const created = [];
  for (const d of drafts) {
    const pair = await tx.pair.create({
      data: {
        tournamentId,
        groupId,
        player1Id: d.player1Id,
        player2Id: d.player2Id,
        displayOrder: d.displayOrder,
      },
    });
    created.push(pair);
  }
  return created;
}

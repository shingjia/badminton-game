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

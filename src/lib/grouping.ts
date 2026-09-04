import type { PrismaClient } from '@prisma/client';

export type GroupAssignment = {
  levelCode: string;
  playerIds: string[];
};

/**
 * Validates the proposed grouping.
 * Throws an Error with a machine-readable message on any violation:
 * - 'no_groups'              — groups array is empty
 * - 'group_too_small'        — a group has fewer than 2 players
 * - 'odd_players_in_group'   — a group has an odd player count (doubles require even)
 * - 'duplicate_player'       — same playerId appears in more than one group
 */
export function validateGroupingInput(groups: GroupAssignment[]): void {
  if (groups.length === 0) throw new Error('no_groups');

  const seen = new Set<string>();

  for (const g of groups) {
    if (g.playerIds.length < 2) throw new Error('group_too_small');
    if (g.playerIds.length % 2 !== 0) throw new Error('odd_players_in_group');
    for (const pid of g.playerIds) {
      if (seen.has(pid)) throw new Error('duplicate_player');
      seen.add(pid);
    }
  }
}

/**
 * Applies the grouping inside a Prisma interactive transaction.
 * 1. Detaches all players in the tournament from any existing group.
 * 2. Deletes old Group rows (cascades to Pair rows).
 * 3. Creates new Group rows and assigns players.
 *
 * The caller must call validateGroupingInput first.
 * Returns the array of created Group rows.
 */
export async function applyGrouping(
  tx: Omit<
    PrismaClient,
    '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
  >,
  tournamentId: string,
  groups: GroupAssignment[],
): Promise<
  {
    id: string;
    name: string;
    displayOrder: number;
    levelCode: string;
    tournamentId: string;
    pairingLockedAt: Date | null;
  }[]
> {
  // 棒次是「組內順序」，重新分組後舊棒次沒有意義（成員都換了），
  // 一併歸零讓前端對每個新組乾淨地自動重編 1..N，避免殘留的舊棒次
  // 造成重號/跳號。
  await tx.player.updateMany({
    where: { tournamentId },
    data: { groupId: null, seed: null },
  });

  await tx.group.deleteMany({ where: { tournamentId } });

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const created = [];

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const groupRow = await tx.group.create({
      data: {
        tournamentId,
        name: letters[i] ?? `Group${i + 1}`,
        displayOrder: i + 1,
        levelCode: g.levelCode,
      },
    });

    await tx.player.updateMany({
      where: { id: { in: g.playerIds } },
      data: { groupId: groupRow.id },
    });

    created.push(groupRow);
  }

  return created;
}

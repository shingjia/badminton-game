import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin } from '@/lib/api-helpers';
import { shufflePairs, writePairs } from '@/lib/pairing';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const group = await prisma.group.findUnique({
    where: { id: params.id },
    include: { players: true },
  });
  if (!group) return notFound('group_not_found');

  if (group.pairingLockedAt) {
    return conflict('pairing_locked');
  }

  const playerIds = group.players.map((p) => p.id);

  let drafts;
  try {
    drafts = shufflePairs(playerIds);
  } catch (e: any) {
    return conflict(e.message);
  }

  const pairs = await prisma.$transaction((tx) =>
    writePairs(tx, group.tournamentId, group.id, drafts),
  );

  emitToTournament(group.tournamentId, 'pairs.shuffled', {
    tournamentId: group.tournamentId,
    groupId: group.id,
    pairs,
  });

  return ok({ pairs });
}

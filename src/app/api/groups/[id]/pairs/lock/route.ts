import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin } from '@/lib/api-helpers';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const group = await prisma.group.findUnique({
    where: { id: params.id },
    include: { pairs: true },
  });
  if (!group) return notFound('group_not_found');

  if (group.pairingLockedAt) {
    return conflict('pairing_already_locked');
  }

  if (group.pairs.length === 0) {
    return conflict('no_pairs_to_lock');
  }

  const updatedGroup = await prisma.group.update({
    where: { id: params.id },
    data: { pairingLockedAt: new Date() },
  });

  emitToTournament(group.tournamentId, 'pairing.locked', {
    tournamentId: group.tournamentId,
    groupId: group.id,
  });

  // If all groups in the tournament are now locked, advance tournament to in_progress
  const unlockedCount = await prisma.group.count({
    where: { tournamentId: group.tournamentId, pairingLockedAt: null },
  });

  if (unlockedCount === 0) {
    const updatedTournament = await prisma.tournament.update({
      where: { id: group.tournamentId },
      data: { status: 'in_progress' },
    });
    emitToTournament(group.tournamentId, 'tournament.updated', {
      tournamentId: group.tournamentId,
      tournament: updatedTournament,
    });
  }

  return ok(updatedGroup);
}

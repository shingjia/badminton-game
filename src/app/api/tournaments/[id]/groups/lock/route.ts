import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');
  const statusErr = ensureStatus(tournament.status, ['grouping']);
  if (statusErr) return statusErr;

  // every player must belong to a group
  const orphan = await prisma.player.count({
    where: { tournamentId: params.id, groupId: null },
  });
  if (orphan > 0) return conflict('players_not_grouped');

  const groups = await prisma.group.findMany({
    where: { tournamentId: params.id },
    include: { players: true },
  });
  for (const g of groups) {
    if (g.players.length < 2) return conflict('group_too_small');
  }

  const updated = await prisma.tournament.update({
    where: { id: params.id },
    data: { status: 'in_progress' },
  });
  emitToTournament(params.id, 'tournament.updated', { tournamentId: params.id, tournament: updated });
  return ok(updated);
}

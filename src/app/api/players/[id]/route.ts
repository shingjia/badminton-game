import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdatePlayer } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, UpdatePlayer);
  if (!parsed.ok) return parsed.res;

  const player = await prisma.player
    .update({ where: { id: params.id }, data: parsed.data })
    .catch(() => null);
  if (!player) return notFound();

  emitToTournament(player.tournamentId, 'player.updated', {
    tournamentId: player.tournamentId,
    player,
  });
  return ok(player);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const player = await prisma.player
    .delete({ where: { id: params.id } })
    .catch(() => null);
  if (!player) return notFound();

  emitToTournament(player.tournamentId, 'player.deleted', {
    tournamentId: player.tournamentId,
    playerId: player.id,
  });
  return ok({ deleted: true });
}

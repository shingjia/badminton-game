import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { CreatePlayer } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const players = await prisma.player.findMany({
    where: { tournamentId: params.id },
    orderBy: { name: 'asc' },
  });
  return ok(players);
}

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, CreatePlayer);
  if (!parsed.ok) return parsed.res;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const player = await prisma.player.create({
    data: { tournamentId: params.id, ...parsed.data },
  });

  emitToTournament(params.id, 'player.added', { tournamentId: params.id, player });
  return ok(player, 201);
}

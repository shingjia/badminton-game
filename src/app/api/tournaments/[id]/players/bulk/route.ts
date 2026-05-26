import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { BulkCreatePlayers } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, BulkCreatePlayers);
  if (!parsed.ok) return parsed.res;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const rows = parsed.data.players.map((p) => ({
    tournamentId: params.id,
    name: p.name,
    level: p.level ?? null,
  }));

  const created = await prisma.$transaction(
    rows.map((r) => prisma.player.create({ data: r })),
  );

  for (const player of created) {
    emitToTournament(params.id, 'player.added', { tournamentId: params.id, player });
  }

  return ok({ created: created.length, failed: [] }, 201);
}

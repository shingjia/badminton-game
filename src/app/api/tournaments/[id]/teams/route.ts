import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { CreateTeam } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const teams = await prisma.team.findMany({
    where: { tournamentId: params.id },
    orderBy: { name: 'asc' },
  });
  return ok(teams);
}

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, CreateTeam);
  if (!parsed.ok) return parsed.res;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const team = await prisma.team.create({
    data: { tournamentId: params.id, ...parsed.data },
  });
  emitToTournament(params.id, 'team.added', { tournamentId: params.id, team });
  return ok(team, 201);
}

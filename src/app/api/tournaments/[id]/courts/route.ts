import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { CreateCourt } from '@/lib/schemas';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const courts = await prisma.court.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
  });
  return ok(courts);
}

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, CreateCourt);
  if (!parsed.ok) return parsed.res;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const next = await prisma.court.aggregate({
    where: { tournamentId: params.id },
    _max: { displayOrder: true },
  });
  const order = (next._max.displayOrder ?? 0) + 1;

  const court = await prisma.court.create({
    data: { tournamentId: params.id, name: parsed.data.name, displayOrder: order },
  });
  return ok(court, 201);
}

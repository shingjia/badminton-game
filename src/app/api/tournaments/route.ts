import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { CreateTournament } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

export async function GET() {
  const tournaments = await prisma.tournament.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return ok(tournaments);
}

export async function POST(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, CreateTournament);
  if (!parsed.ok) return parsed.res;

  const t = await prisma.tournament.create({
    data: {
      name: parsed.data.name,
      teamsPerGroup: parsed.data.teamsPerGroup ?? 4,
      pointsPerGame: parsed.data.pointsPerGame ?? 21,
    },
  });
  emitToTournament(t.id, 'tournament.updated', { tournamentId: t.id, tournament: t });
  return ok(t, 201);
}

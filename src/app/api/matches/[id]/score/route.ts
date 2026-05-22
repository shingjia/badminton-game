import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateMatchScore } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

function validBadmintonScore(a: number, b: number, target: number): boolean {
  // 21 points game, win by 2, max 30
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  if (max < target) return false;          // game not ended
  if (max === 30) return true;             // hard cap reached
  if (max > 30) return false;              // impossible
  return max - min >= 2;                   // need 2-point lead
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, UpdateMatchScore);
  if (!parsed.ok) return parsed.res;

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: { tournament: true },
  });
  if (!match) return notFound();

  if (match.tournament.status !== 'in_progress' && match.tournament.status !== 'finished') {
    return conflict('tournament_not_in_progress');
  }

  const target = match.tournament.pointsPerGame;
  if (!validBadmintonScore(parsed.data.scoreA, parsed.data.scoreB, target)) {
    return conflict('invalid_score');
  }

  const updated = await prisma.match.update({
    where: { id: params.id },
    data: {
      scoreA: parsed.data.scoreA,
      scoreB: parsed.data.scoreB,
      status: 'completed',
      finishedAt: new Date(),
    },
  });

  // If all matches completed, transition tournament to finished
  const pending = await prisma.match.count({
    where: { tournamentId: match.tournamentId, status: 'pending' },
  });
  emitToTournament(updated.tournamentId, 'match.scored', { tournamentId: updated.tournamentId, match: updated });
  if (pending === 0) {
    await prisma.tournament.update({
      where: { id: match.tournamentId },
      data: { status: 'finished', finishedAt: new Date() },
    });
    const final = await prisma.tournament.findUnique({ where: { id: match.tournamentId } });
    if (final) emitToTournament(final.id, 'tournament.updated', { tournamentId: final.id, tournament: final });
  }

  return ok(updated);
}

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateMatchScore } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

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
  const maxScore = Math.max(parsed.data.scoreA, parsed.data.scoreB);
  // 達標即算完賽；分數歸零或未達標皆為「進行中」(DB status: pending)。
  const newStatus = maxScore >= target ? 'completed' : 'pending';

  const updated = await prisma.match.update({
    where: { id: params.id },
    data: {
      scoreA: parsed.data.scoreA,
      scoreB: parsed.data.scoreB,
      status: newStatus,
      finishedAt: newStatus === 'completed' ? new Date() : null,
    },
  });

  emitToTournament(updated.tournamentId, 'match.scored', {
    tournamentId: updated.tournamentId,
    match: updated,
  });

  // Roll up tournament status from the per-match states.
  const pendingCount = await prisma.match.count({
    where: { tournamentId: match.tournamentId, status: 'pending' },
  });

  if (pendingCount === 0 && match.tournament.status !== 'finished') {
    await prisma.tournament.update({
      where: { id: match.tournamentId },
      data: { status: 'finished', finishedAt: new Date() },
    });
    const final = await prisma.tournament.findUnique({ where: { id: match.tournamentId } });
    if (final) emitToTournament(final.id, 'tournament.updated', { tournamentId: final.id, tournament: final });
  } else if (pendingCount > 0 && match.tournament.status === 'finished') {
    // A previously completed match got reverted → tournament back to in_progress
    await prisma.tournament.update({
      where: { id: match.tournamentId },
      data: { status: 'in_progress', finishedAt: null },
    });
    const reopened = await prisma.tournament.findUnique({ where: { id: match.tournamentId } });
    if (reopened) emitToTournament(reopened.id, 'tournament.updated', { tournamentId: reopened.id, tournament: reopened });
  }

  return ok(updated);
}

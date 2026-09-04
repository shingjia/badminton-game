import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateMatchScore } from '@/lib/schemas';
import { carryToNext } from '@/lib/club-relay';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, UpdateMatchScore);
  if (!parsed.ok) return parsed.res;

  const match = await prisma.match.findUnique({
    where: { id: params.id },
    include: {
      tournament: true,
      pairA: { select: { groupId: true } },
      pairB: { select: { groupId: true } },
    },
  });
  if (!match) return notFound();

  if (match.tournament.status !== 'in_progress' && match.tournament.status !== 'finished') {
    return conflict('tournament_not_in_progress');
  }

  // 累計接力計分制（會內賽）：第 N 段（matchOrder=N）的換人分數為
  // N × pointsPerGame；任一隊累計達到該分數即結束這一段。
  // 一般友誼賽：維持原本 pointsPerGame 即為目標分。
  const target =
    match.tournament.format === 'club'
      ? match.matchOrder * match.tournament.pointsPerGame
      : match.tournament.pointsPerGame;
  const maxScore = Math.max(parsed.data.scoreA, parsed.data.scoreB);
  // 會內賽：每段分數不得超過該段換人分數（第 N 段上限 N × pointsPerGame）。
  if (match.tournament.format === 'club' && maxScore > target) {
    return conflict('score_exceeds_target');
  }
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

  // 接力帶分：本段完賽時把結束分數帶進同配對的下一段當起始分
  // （帶入/收回的判斷規則見 lib/club-relay.ts 的 carryToNext）。
  if (match.tournament.format === 'club') {
    const next = await prisma.match.findFirst({
      where: {
        tournamentId: match.tournamentId,
        roundNumber: match.roundNumber,
        matchOrder: match.matchOrder + 1,
        pairA: { groupId: match.pairA.groupId },
        pairB: { groupId: match.pairB.groupId },
      },
    });
    const carry = carryToNext(match, parsed.data, newStatus, next);
    if (carry && next) {
      const nextUpdated = await prisma.match.update({
        where: { id: next.id },
        data: { scoreA: carry.scoreA, scoreB: carry.scoreB },
      });
      emitToTournament(nextUpdated.tournamentId, 'match.scored', {
        tournamentId: nextUpdated.tournamentId,
        match: nextUpdated,
      });
    }
  }

  // Roll up tournament status from the per-match states.
  const pendingCount = await prisma.match.count({
    where: { tournamentId: match.tournamentId, status: 'pending' },
  });

  // 會內賽逐循環產生賽程：就算目前所有比賽都完賽，只要還有循環沒
  // 產生（應有 組數-1 個循環），賽事就還沒結束。
  let allWavesGenerated = true;
  if (pendingCount === 0 && match.tournament.format === 'club') {
    const [groupCount, waves] = await Promise.all([
      prisma.group.count({ where: { tournamentId: match.tournamentId } }),
      prisma.match.findMany({
        where: { tournamentId: match.tournamentId },
        distinct: ['roundNumber'],
        select: { roundNumber: true },
      }),
    ]);
    allWavesGenerated = waves.length >= Math.max(1, groupCount - 1);
  }

  if (pendingCount === 0 && allWavesGenerated && match.tournament.status !== 'finished') {
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

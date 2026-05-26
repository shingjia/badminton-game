import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { roundRobinPairs } from '@/lib/algorithms/circle-method';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const statusErr = ensureStatus(tournament.status, ['in_progress']);
  if (statusErr) return statusErr;

  const groups = await prisma.group.findMany({
    where: { tournamentId: params.id },
    include: { pairs: true },
    orderBy: { displayOrder: 'asc' },
  });
  const courts = await prisma.court.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
  });

  if (groups.length === 0) return conflict('no_groups');

  type Draft = {
    tournamentId: string;
    groupId: string;
    pairAId: string;
    pairBId: string;
    roundNumber: number;
    matchOrder: number;
  };

  const drafts: Draft[] = [];
  for (const g of groups) {
    const pairIds = g.pairs.map((p) => p.id);
    const matches = roundRobinPairs(pairIds);
    for (const m of matches) {
      drafts.push({
        tournamentId: params.id,
        groupId: g.id,
        pairAId: m.teamA,
        pairBId: m.teamB,
        roundNumber: m.roundNumber,
        matchOrder: m.matchOrder,
      });
    }
  }

  if (drafts.length === 0) return conflict('no_matches_to_generate');

  const matchInputs: MatchInput[] = drafts.map((d, idx) => ({
    id: `tmp${idx}`,
    groupId: d.groupId,
    roundNumber: d.roundNumber,
  }));
  const allocations = allocateCourts(matchInputs, courts.map((c) => c.id));
  const courtById = new Map(allocations.map((a) => [a.id, a.courtId]));

  const result = await prisma.$transaction(async (tx) => {
    await tx.match.deleteMany({ where: { tournamentId: params.id } });
    const created = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const courtId = courtById.get(`tmp${i}`) ?? null;
      const m = await tx.match.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupId,
          pairAId: d.pairAId,
          pairBId: d.pairBId,
          roundNumber: d.roundNumber,
          matchOrder: d.matchOrder,
          courtId,
        },
      });
      created.push(m);
    }
    return created;
  });

  emitToTournament(params.id, 'match.generated', { tournamentId: params.id, matches: result });
  return ok({ matches: result, count: result.length });
}

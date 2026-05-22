import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { roundRobinPairs } from '@/lib/algorithms/circle-method';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';

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
    include: { teams: true },
    orderBy: { displayOrder: 'asc' },
  });
  const courts = await prisma.court.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
  });

  if (groups.length === 0) return conflict('no_groups');

  // Build pairs per group with a global matchOrder offset for stable UI display
  type Draft = {
    tournamentId: string;
    groupId: string;
    teamAId: string;
    teamBId: string;
    roundNumber: number;
    matchOrder: number; // unique within group; we'll re-number globally below
  };

  const drafts: Draft[] = [];
  for (const g of groups) {
    const teamIds = g.teams.map((t) => t.id);
    const pairs = roundRobinPairs(teamIds);
    for (const p of pairs) {
      drafts.push({
        tournamentId: params.id,
        groupId: g.id,
        teamAId: p.teamA,
        teamBId: p.teamB,
        roundNumber: p.roundNumber,
        matchOrder: p.matchOrder,
      });
    }
  }

  if (drafts.length === 0) return conflict('no_matches_to_generate');

  // Allocate courts based on roundNumber (cross-group batches)
  const matchInputs: MatchInput[] = drafts.map((d, idx) => ({
    id: `tmp${idx}`,
    groupId: d.groupId,
    roundNumber: d.roundNumber,
  }));
  const allocations = allocateCourts(matchInputs, courts.map((c) => c.id));
  const courtById = new Map(allocations.map((a) => [a.id, a.courtId]));

  // Write in a transaction: clear old matches first
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
          teamAId: d.teamAId,
          teamBId: d.teamBId,
          roundNumber: d.roundNumber,
          matchOrder: d.matchOrder,
          courtId,
        },
      });
      created.push(m);
    }
    return created;
  });

  return ok({ matches: result, count: result.length });
}

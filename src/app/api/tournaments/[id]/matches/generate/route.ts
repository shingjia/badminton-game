import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { roundRobinPairs } from '@/lib/algorithms/circle-method';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';
import { splitByLevel2, rotationSchedule } from '@/lib/rotation';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

// Existing pairs are read off the group (friendly). Rotation matches don't
// have pairs yet — the two players for each side are carried through and
// turned into fresh Pair rows inside the transaction.
type Draft = {
  tournamentId: string;
  groupId: string;
  roundNumber: number;
  matchOrder: number;
} & (
  | { kind: 'existing'; pairAId: string; pairBId: string }
  | { kind: 'rotation'; sideAPlayers: [string, string]; sideBPlayers: [string, string] }
);

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const statusErr = ensureStatus(tournament.status, ['in_progress']);
  if (statusErr) return statusErr;

  const groups = await prisma.group.findMany({
    where: { tournamentId: params.id },
    include: { pairs: true, players: true },
    orderBy: { displayOrder: 'asc' },
  });
  const courts = await prisma.court.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
  });

  if (groups.length === 0) return conflict('no_groups');

  const drafts: Draft[] = [];
  try {
    for (const g of groups) {
      if (tournament.format === 'club') {
        const { sideA, sideB } = splitByLevel2(g.players.map((p) => ({ id: p.id, level: p.level })));
        const bySide = (ids: string[]) =>
          ids.map((id) => ({ id, seed: g.players.find((p) => p.id === id)!.seed }));
        const schedule = rotationSchedule(bySide(sideA), bySide(sideB));
        for (const m of schedule) {
          drafts.push({
            kind: 'rotation',
            tournamentId: params.id,
            groupId: g.id,
            sideAPlayers: m.sideAPlayers,
            sideBPlayers: m.sideBPlayers,
            roundNumber: m.roundNumber,
            matchOrder: m.matchOrder,
          });
        }
      } else {
        const pairIds = g.pairs.map((p) => p.id);
        const matches = roundRobinPairs(pairIds);
        for (const m of matches) {
          drafts.push({
            kind: 'existing',
            tournamentId: params.id,
            groupId: g.id,
            pairAId: m.teamA,
            pairBId: m.teamB,
            roundNumber: m.roundNumber,
            matchOrder: m.matchOrder,
          });
        }
      }
    }
  } catch (e: any) {
    return conflict(e.message);
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
    if (tournament.format === 'club') {
      // Club pairs are one-off (created fresh below); clear any from a
      // previous generate before rebuilding. Cascades their old matches.
      await tx.pair.deleteMany({ where: { groupId: { in: groups.map((g) => g.id) } } });
    } else {
      await tx.match.deleteMany({ where: { tournamentId: params.id } });
    }

    const created = [];
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const courtId = courtById.get(`tmp${i}`) ?? null;

      let pairAId: string;
      let pairBId: string;
      if (d.kind === 'existing') {
        pairAId = d.pairAId;
        pairBId = d.pairBId;
      } else {
        const pairA = await tx.pair.create({
          data: {
            tournamentId: d.tournamentId,
            groupId: d.groupId,
            player1Id: d.sideAPlayers[0],
            player2Id: d.sideAPlayers[1],
            displayOrder: d.matchOrder,
          },
        });
        const pairB = await tx.pair.create({
          data: {
            tournamentId: d.tournamentId,
            groupId: d.groupId,
            player1Id: d.sideBPlayers[0],
            player2Id: d.sideBPlayers[1],
            displayOrder: d.matchOrder,
          },
        });
        pairAId = pairA.id;
        pairBId = pairB.id;
      }

      const m = await tx.match.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupId,
          pairAId,
          pairBId,
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

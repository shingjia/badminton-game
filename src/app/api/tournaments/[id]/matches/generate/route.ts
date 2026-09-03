import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { roundRobinPairs } from '@/lib/algorithms/circle-method';
import { allocateCourts, type MatchInput } from '@/lib/algorithms/court-allocation';
import { buildClubSchedule, type ClubMatchDraft } from '@/lib/club-schedule';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

type ExistingDraft = {
  tournamentId: string;
  groupId: string;
  pairAId: string;
  pairBId: string;
  roundNumber: number;
  matchOrder: number;
};

type ClubDraft = ClubMatchDraft & { tournamentId: string; courtId: string | null };

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

  const existingDrafts: ExistingDraft[] = [];
  let clubDrafts: ClubDraft[] = [];
  let wave = 0; // only meaningful for club format — captured for the transaction below

  if (tournament.format === 'club') {
    // Groups play each other directly (round-robin), not internally.
    // 接力累計計分：同一配對的各段必須在同一場地依序進行（每段接續前段
    // 分數），所以場地數必須剛好 = 組數/2（4 隊 2 場地、6 隊 3 場地）。
    if (groups.length % 2 !== 0) return conflict('odd_group_count');
    if (courts.length !== groups.length / 2) return conflict('court_count_mismatch');

    // Each circulation (wave) is generated independently, so staff can
    // adjust a group's 棒次 (seed order) between circulations and have it
    // reflected in the next one — see docs/superpowers/specs/2026-08-20-
    // club-per-wave-generation-design.md. Which groups play which groups
    // in which wave never depends on 棒次 (roundRobinPairs only looks at
    // group ids), so it's safe to always recompute the full schedule from
    // the *current* rosters and just keep the requested wave's matches.
    const body = await req.json().catch(() => ({}));
    wave = Number(body?.wave);
    const maxWave = groups.length - 1;
    if (!Number.isInteger(wave) || wave < 1 || wave > maxWave) return conflict('invalid_wave');

    // 已有分數的循環不允許重新產生（會洗掉比分）；全部歸零後才放行。
    const scoredCount = await prisma.match.count({
      where: {
        tournamentId: params.id,
        roundNumber: wave,
        OR: [{ scoreA: { gt: 0 } }, { scoreB: { gt: 0 } }],
      },
    });
    if (scoredCount > 0) return conflict('wave_has_scores');

    try {
      const rosters = groups.map((g) => ({
        groupId: g.id,
        players: g.players.map((p) => ({ id: p.id, seed: p.seed })),
      }));
      const schedule = buildClubSchedule(rosters).filter((m) => m.roundNumber === wave);
      clubDrafts = schedule.map((m) => ({
        ...m,
        tournamentId: params.id,
        courtId: courts[m.pairingIndexInWave].id,
      }));
    } catch (e: any) {
      return conflict(e.message);
    }
  } else {
    try {
      for (const g of groups) {
        const pairIds = g.pairs.map((p) => p.id);
        const matches = roundRobinPairs(pairIds);
        for (const m of matches) {
          existingDrafts.push({
            tournamentId: params.id,
            groupId: g.id,
            pairAId: m.teamA,
            pairBId: m.teamB,
            roundNumber: m.roundNumber,
            matchOrder: m.matchOrder,
          });
        }
      }
    } catch (e: any) {
      return conflict(e.message);
    }
  }

  if (existingDrafts.length + clubDrafts.length === 0) return conflict('no_matches_to_generate');

  // Friendly's existing pairs still go through the generic allocateCourts
  // (batches by roundNumber, round-robins across all courts) — club's
  // court assignment is already resolved above, bespoke to its primary/
  // shared-court balancing rule.
  const matchInputs: MatchInput[] = existingDrafts.map((d, idx) => ({
    id: `tmp${idx}`,
    groupId: d.groupId,
    roundNumber: d.roundNumber,
  }));
  const allocations = allocateCourts(matchInputs, courts.map((c) => c.id));
  const courtById = new Map(allocations.map((a) => [a.id, a.courtId]));

  const result = await prisma.$transaction(async (tx) => {
    if (tournament.format === 'club') {
      // Only this wave's matches get regenerated — other circulations
      // (including already-scored ones) are untouched. Pairs are one-off
      // per match, so find them via their match before deleting (deleting
      // a Pair cascades its Match, per the schema's onDelete: Cascade).
      const existingWaveMatches = await tx.match.findMany({
        where: { tournamentId: params.id, roundNumber: wave },
        select: { pairAId: true, pairBId: true },
      });
      const pairIds = existingWaveMatches.flatMap((m) => [m.pairAId, m.pairBId]);
      if (pairIds.length > 0) {
        await tx.pair.deleteMany({ where: { id: { in: pairIds } } });
      }
    } else {
      await tx.match.deleteMany({ where: { tournamentId: params.id } });
    }

    const created = [];

    for (let i = 0; i < existingDrafts.length; i++) {
      const d = existingDrafts[i];
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

    for (const d of clubDrafts) {
      // Each side's one-off Pair is tagged with *its own* group — not a
      // shared value — so standings can attribute stats correctly (see
      // lib/player-standings.ts).
      const pairA = await tx.pair.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupAId,
          player1Id: d.sideAPlayers[0],
          player2Id: d.sideAPlayers[1],
          displayOrder: d.matchOrder,
        },
      });
      const pairB = await tx.pair.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupBId,
          player1Id: d.sideBPlayers[0],
          player2Id: d.sideBPlayers[1],
          displayOrder: d.matchOrder,
        },
      });
      // Match.groupId is a required single FK but a club match spans two
      // groups — pairA's group is stored here as a technical placeholder
      // only; nothing should read it as "the" group for a club match
      // (use pairA.group / pairB.group instead, see matches-tab.tsx).
      const m = await tx.match.create({
        data: {
          tournamentId: d.tournamentId,
          groupId: d.groupAId,
          pairAId: pairA.id,
          pairBId: pairB.id,
          roundNumber: d.roundNumber,
          matchOrder: d.matchOrder,
          courtId: d.courtId,
        },
      });
      created.push(m);
    }

    return created;
  });

  emitToTournament(params.id, 'match.generated', { tournamentId: params.id, matches: result });
  return ok({ matches: result, count: result.length });
}

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok } from '@/lib/api-helpers';
import { getStandings } from '@/lib/standings-sql';
import { computeGroupStandings, type MatchResult } from '@/lib/player-standings';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  if (tournament.format === 'club') {
    // 會內賽排名比的是「組跟組」，不是組內個人——一場賽事只有一份
    // 名次表，不用照 group 再拆一次。
    const matches = await prisma.match.findMany({
      where: { tournamentId: params.id },
      include: { pairA: true, pairB: true },
    });
    const results: MatchResult[] = matches.map((m) => ({
      pairAGroupId: m.pairA.groupId,
      pairBGroupId: m.pairB.groupId,
      roundNumber: m.roundNumber,
      status: m.status,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      pairAPlayerIds: [m.pairA.player1Id, m.pairA.player2Id],
      pairBPlayerIds: [m.pairB.player1Id, m.pairB.player2Id],
    }));
    const standings = computeGroupStandings(results).map((r) => ({
      group_id: r.groupId,
      wins: r.wins,
      losses: r.losses,
      played: r.played,
      point_diff: r.pointDiff,
      points_for: r.pointsFor,
      points_against: r.pointsAgainst,
      rank: r.rank,
    }));
    return ok(standings);
  }

  const rows = await getStandings(params.id);
  // group rows by group_id for client convenience
  const byGroup = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byGroup.get(r.group_id) ?? [];
    arr.push(r);
    byGroup.set(r.group_id, arr);
  }
  const result = [...byGroup.entries()].map(([groupId, standings]) => ({ groupId, standings }));
  return ok(result);
}

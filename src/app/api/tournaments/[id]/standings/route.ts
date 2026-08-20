import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok } from '@/lib/api-helpers';
import { getStandings } from '@/lib/standings-sql';
import { computePlayerStandings, type MatchResult } from '@/lib/player-standings';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  if (tournament.format === 'club') {
    const matches = await prisma.match.findMany({
      where: { tournamentId: params.id },
      include: { pairA: true, pairB: true },
    });
    const results: MatchResult[] = matches.map((m) => ({
      groupId: m.groupId,
      status: m.status,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      pairAPlayerIds: [m.pairA.player1Id, m.pairA.player2Id],
      pairBPlayerIds: [m.pairB.player1Id, m.pairB.player2Id],
    }));
    const rows = computePlayerStandings(results).map((r) => ({
      player_id: r.playerId,
      group_id: r.groupId,
      wins: r.wins,
      losses: r.losses,
      played: r.played,
      point_diff: r.pointDiff,
      points_for: r.pointsFor,
      points_against: r.pointsAgainst,
      rank: r.rank,
    }));
    const byGroup = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = byGroup.get(r.group_id) ?? [];
      arr.push(r);
      byGroup.set(r.group_id, arr);
    }
    const result = [...byGroup.entries()].map(([groupId, standings]) => ({ groupId, standings }));
    return ok(result);
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

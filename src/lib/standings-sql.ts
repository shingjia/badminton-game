import { prisma } from '@/lib/prisma';

export type StandingRow = {
  pair_id: string;
  group_id: string;
  tournament_id: string;
  wins: number;
  played: number;
  point_diff: number;
  points_for: number;
  rank: number;
};

export async function getStandings(tournamentId: string): Promise<StandingRow[]> {
  // bigint columns come back as bigint; cast in SQL
  const rows = await prisma.$queryRaw<StandingRow[]>`
    SELECT
      pair_id,
      group_id,
      tournament_id,
      wins::int             AS wins,
      played::int           AS played,
      point_diff::int       AS point_diff,
      points_for::int       AS points_for,
      RANK() OVER (
        PARTITION BY group_id
        ORDER BY wins DESC, point_diff DESC, points_for DESC
      )::int                AS rank
    FROM pair_standings
    WHERE tournament_id = ${tournamentId}
    ORDER BY group_id, rank
  `;
  return rows;
}

export type MatchResult = {
  pairAGroupId: string;
  pairBGroupId: string;
  status: 'pending' | 'completed';
  scoreA: number;
  scoreB: number;
  pairAPlayerIds: [string, string];
  pairBPlayerIds: [string, string];
};

export type PlayerStandingRow = {
  playerId: string;
  groupId: string;
  wins: number;
  losses: number;
  played: number;
  pointDiff: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
};

type UnrankedRow = Omit<PlayerStandingRow, 'rank'>;

/**
 * Aggregates completed matches into per-player win/loss records, ranked
 * within each group. A club-format match has no stable "team" — each
 * player's own perspective (their side's score vs the other side's) is
 * tallied individually, so the same player accumulates stats across every
 * match they appeared in, regardless of who they were partnered with.
 *
 * A match now spans two different groups (group A's roster plays group
 * B's), so each side's players are attributed to *their own* group
 * (pairAGroupId / pairBGroupId) — never to the other side's group.
 */
export function computePlayerStandings(matches: MatchResult[]): PlayerStandingRow[] {
  const byPlayer = new Map<string, UnrankedRow>();

  function row(playerId: string, groupId: string): UnrankedRow {
    let r = byPlayer.get(playerId);
    if (!r) {
      r = { playerId, groupId, wins: 0, losses: 0, played: 0, pointDiff: 0, pointsFor: 0, pointsAgainst: 0 };
      byPlayer.set(playerId, r);
    }
    return r;
  }

  function tally(playerIds: [string, string], groupId: string, myScore: number, oppScore: number) {
    for (const playerId of playerIds) {
      const r = row(playerId, groupId);
      r.played++;
      r.pointsFor += myScore;
      r.pointsAgainst += oppScore;
      r.pointDiff += myScore - oppScore;
      if (myScore > oppScore) r.wins++;
      else if (myScore < oppScore) r.losses++;
    }
  }

  for (const m of matches) {
    if (m.status !== 'completed') continue;
    tally(m.pairAPlayerIds, m.pairAGroupId, m.scoreA, m.scoreB);
    tally(m.pairBPlayerIds, m.pairBGroupId, m.scoreB, m.scoreA);
  }

  const byGroup = new Map<string, UnrankedRow[]>();
  for (const r of byPlayer.values()) {
    const arr = byGroup.get(r.groupId) ?? [];
    arr.push(r);
    byGroup.set(r.groupId, arr);
  }

  const result: PlayerStandingRow[] = [];
  for (const rows of byGroup.values()) {
    result.push(...rankGroup(rows));
  }
  return result;
}

/**
 * Sorts by wins desc, losses asc, points-for desc, points-against asc, and
 * assigns ranks using SQL RANK() semantics: tied rows share the same rank,
 * and the next distinct row's rank skips ahead by the number of ties
 * (e.g. two players tied for 1st means the next rank is 3, not 2).
 */
function rankGroup(rows: UnrankedRow[]): PlayerStandingRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.pointsFor - a.pointsFor ||
      a.pointsAgainst - b.pointsAgainst,
  );
  const result: PlayerStandingRow[] = [];
  let rank = 0;
  let prevKey: string | null = null;
  sorted.forEach((r, i) => {
    const key = `${r.wins}|${r.losses}|${r.pointsFor}|${r.pointsAgainst}`;
    if (key !== prevKey) rank = i + 1;
    prevKey = key;
    result.push({ ...r, rank });
  });
  return result;
}

export type GroupStandingRow = {
  groupId: string;
  wins: number;
  losses: number;
  played: number;
  pointDiff: number;
  pointsFor: number;
  pointsAgainst: number;
  rank: number;
};

/**
 * Ranks a club-format tournament's GROUPS against each other (not players
 * within a group) — e.g. "Group A did best overall". A group's totals are
 * just the sum of every one of its players' individual stats (every match
 * played by anyone in the group counts once toward the group's wins/losses/
 * points, on top of already counting toward that player's own record).
 *
 * Order: wins desc, then points-for desc, then points-against asc. Ranks
 * use SQL RANK() semantics (ties share a rank, next rank skips ahead).
 */
export function computeGroupStandings(matches: MatchResult[]): GroupStandingRow[] {
  const byGroup = new Map<string, Omit<GroupStandingRow, 'rank'>>();
  for (const p of computePlayerStandings(matches)) {
    let g = byGroup.get(p.groupId);
    if (!g) {
      g = { groupId: p.groupId, wins: 0, losses: 0, played: 0, pointDiff: 0, pointsFor: 0, pointsAgainst: 0 };
      byGroup.set(p.groupId, g);
    }
    g.wins += p.wins;
    g.losses += p.losses;
    g.played += p.played;
    g.pointDiff += p.pointDiff;
    g.pointsFor += p.pointsFor;
    g.pointsAgainst += p.pointsAgainst;
  }

  const sorted = [...byGroup.values()].sort(
    (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor || a.pointsAgainst - b.pointsAgainst,
  );
  const result: GroupStandingRow[] = [];
  let rank = 0;
  let prevKey: string | null = null;
  sorted.forEach((g, i) => {
    const key = `${g.wins}|${g.pointsFor}|${g.pointsAgainst}`;
    if (key !== prevKey) rank = i + 1;
    prevKey = key;
    result.push({ ...g, rank });
  });
  return result;
}

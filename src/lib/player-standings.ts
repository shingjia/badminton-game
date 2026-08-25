export type MatchResult = {
  pairAGroupId: string;
  pairBGroupId: string;
  roundNumber: number;
  status: 'pending' | 'completed';
  scoreA: number;
  scoreB: number;
  pairAPlayerIds: [string, string];
  pairBPlayerIds: [string, string];
};

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

type UnrankedRow = Omit<GroupStandingRow, 'rank'>;

/**
 * Ranks a club-format tournament's GROUPS against each other. A club
 * match's win/loss is decided at the CIRCULATION level (one
 * roundNumber's group-A-vs-group-B pairing, which spans several
 * individual matches -- e.g. 3 doubles pairs from a 6-person group all
 * playing the other group's 3 pairs) -- not per individual match. Once
 * every match in a circulation is completed, whichever group's combined
 * score across all of them is higher gets 1 win for that circulation
 * (the other gets 1 loss). A circulation with any match still pending
 * contributes nothing to wins/losses yet.
 *
 * points-for/points-against are a straight sum of every completed
 * individual match's own score, counted once per match (not once per
 * player) -- these update live regardless of whether their circulation's
 * win/loss has been decided yet.
 *
 * A circulation's combined score can tie exactly even when no individual
 * match tied (e.g. +5/+5/-10 nets to 0). When that happens, the tie is
 * broken by each group's OVERALL points-against across the whole
 * tournament so far (fewer conceded wins the circulation too) -- the
 * same metric already used as the final tie-break for the whole
 * standings table below. If THAT also ties (fully undecidable), both
 * groups are credited with the circulation's win and neither takes a
 * loss.
 *
 * Ranking: wins desc, then points-for desc, then points-against asc
 * (fewer conceded ranks higher). Ranks use SQL RANK() semantics: tied
 * rows share a rank, the next distinct row's rank skips ahead by the
 * number of ties.
 */
export function computeGroupStandings(matches: MatchResult[]): GroupStandingRow[] {
  const byGroup = new Map<string, UnrankedRow>();
  function group(groupId: string): UnrankedRow {
    let g = byGroup.get(groupId);
    if (!g) {
      g = { groupId, wins: 0, losses: 0, played: 0, pointDiff: 0, pointsFor: 0, pointsAgainst: 0 };
      byGroup.set(groupId, g);
    }
    return g;
  }

  // Every group that's ever appeared shows up in the table, even at
  // 0/0/0 before anything's decided.
  for (const m of matches) {
    group(m.pairAGroupId);
    group(m.pairBGroupId);
  }

  // points-for/points-against: once per completed match, not once per player.
  for (const m of matches) {
    if (m.status !== 'completed') continue;
    const a = group(m.pairAGroupId);
    a.pointsFor += m.scoreA;
    a.pointsAgainst += m.scoreB;
    a.pointDiff += m.scoreA - m.scoreB;
    const b = group(m.pairBGroupId);
    b.pointsFor += m.scoreB;
    b.pointsAgainst += m.scoreA;
    b.pointDiff += m.scoreB - m.scoreA;
  }

  // wins/losses: one per fully-completed circulation, decided by each
  // side's combined score across every match in that circulation.
  const byCirculation = new Map<string, MatchResult[]>();
  for (const m of matches) {
    const key = `${m.roundNumber}|${m.pairAGroupId}|${m.pairBGroupId}`;
    const arr = byCirculation.get(key) ?? [];
    arr.push(m);
    byCirculation.set(key, arr);
  }
  for (const bucket of byCirculation.values()) {
    if (bucket.some((m) => m.status !== 'completed')) continue;
    const { pairAGroupId, pairBGroupId } = bucket[0];
    let totalA = 0;
    let totalB = 0;
    for (const m of bucket) {
      totalA += m.scoreA;
      totalB += m.scoreB;
    }
    const a = group(pairAGroupId);
    const b = group(pairBGroupId);
    // A circulation's combined score can tie even though no individual
    // match tied (e.g. 3 matches at +5/+5/-10 nets to a 0 difference).
    // Confirmed with the organizer: this became a real possibility once
    // the format moved from 2 courts (matches ran serially, so "first to
    // reach the point target" inherently prevented ties) to 3 courts
    // (matches run in parallel and are only summed up afterward, which
    // CAN produce a genuine tie). Break a tied total by each group's
    // OVERALL points-against across the whole tournament so far (fewer
    // conceded wins this circulation too) -- the same metric already
    // used as the final tie-break for the whole standings table.
    const totalTied = totalA === totalB;
    const pointsAgainstTied = a.pointsAgainst === b.pointsAgainst;
    if (totalTied && pointsAgainstTied) {
      // Confirmed with the organizer: if the tiebreak ALSO ties (fully
      // undecidable -- genuinely possible, not just theoretical), BOTH
      // groups get credited with this circulation's win, and neither
      // gets a loss. This deliberately breaks the "wins across a group
      // = circulations decided" identity for the tied circulation (it
      // produces 2 wins instead of the usual 1 win + 1 loss) -- that's
      // accepted, not a bug.
      a.wins++;
      b.wins++;
    } else {
      const aWins = !totalTied ? totalA > totalB : a.pointsAgainst < b.pointsAgainst;
      if (aWins) {
        a.wins++;
        b.losses++;
      } else {
        b.wins++;
        a.losses++;
      }
    }
  }

  for (const g of byGroup.values()) {
    g.played = g.wins + g.losses;
  }

  const sorted = [...byGroup.values()].sort(
    (x, y) => y.wins - x.wins || y.pointsFor - x.pointsFor || x.pointsAgainst - y.pointsAgainst,
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

export type MatchResult = {
  pairAGroupId: string;
  pairBGroupId: string;
  roundNumber: number;
  matchOrder: number;
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
 * Ranks a club-format tournament's GROUPS against each other under the
 * relay cumulative scoring model: within a circulation (one
 * roundNumber's group-A-vs-group-B pairing), each segment (matchOrder =
 * N) carries the running total forward, so a match's stored score IS
 * the circulation's cumulative score at that point (segment N ends when
 * one side reaches N × pointsPerGame).
 *
 * Win/loss is decided per circulation: once every segment is completed,
 * the FINAL segment's scores are the finish totals -- whichever group
 * reached the final target score first is ahead there and gets the
 * circulation's 1 win (the other 1 loss). A circulation with any
 * segment still pending contributes nothing to wins/losses yet.
 *
 * points-for/points-against: one entry per circulation -- its latest
 * completed segment's (cumulative) scores. Summing every segment would
 * double-count, since each segment already includes all previous ones.
 * These update live as segments complete.
 *
 * An exact finish-total tie can't happen in normal relay play (one side
 * reaches the target first and scores are capped there), but manual
 * score edits can force one. When that happens, the tie is broken by
 * each group's OVERALL points-against across the whole tournament so
 * far (fewer conceded wins the circulation too). If THAT also ties
 * (fully undecidable), both groups are credited with the circulation's
 * win and neither takes a loss.
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

  const byCirculation = new Map<string, MatchResult[]>();
  for (const m of matches) {
    const key = `${m.roundNumber}|${m.pairAGroupId}|${m.pairBGroupId}`;
    const arr = byCirculation.get(key) ?? [];
    arr.push(m);
    byCirculation.set(key, arr);
  }

  // points-for/points-against: relay scores are cumulative, so a
  // circulation's running total is its latest COMPLETED segment's
  // scores -- counted once per circulation, never summed across
  // segments (that would double-count every earlier segment).
  for (const bucket of byCirculation.values()) {
    const done = bucket.filter((m) => m.status === 'completed');
    if (done.length === 0) continue;
    const latest = done.reduce((x, y) => (y.matchOrder > x.matchOrder ? y : x));
    const a = group(latest.pairAGroupId);
    a.pointsFor += latest.scoreA;
    a.pointsAgainst += latest.scoreB;
    a.pointDiff += latest.scoreA - latest.scoreB;
    const b = group(latest.pairBGroupId);
    b.pointsFor += latest.scoreB;
    b.pointsAgainst += latest.scoreA;
    b.pointDiff += latest.scoreB - latest.scoreA;
  }

  // wins/losses: one per fully-completed circulation. The final
  // segment's cumulative scores are the finish totals -- whoever
  // reached the final target score first is ahead there.
  for (const bucket of byCirculation.values()) {
    if (bucket.some((m) => m.status !== 'completed')) continue;
    const { pairAGroupId, pairBGroupId } = bucket[0];
    const last = bucket.reduce((x, y) => (y.matchOrder > x.matchOrder ? y : x));
    const totalA = last.scoreA;
    const totalB = last.scoreB;
    const a = group(pairAGroupId);
    const b = group(pairBGroupId);
    // A finish-total tie can't happen in normal relay play (first to
    // the target ends the segment, scores capped there) but manual
    // edits can force one -- keep the organizer-confirmed tiebreak:
    // overall points-against across the whole tournament so far.
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

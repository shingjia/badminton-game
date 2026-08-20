export type MatchInput = {
  id: string;
  groupId: string;
  roundNumber: number;
};

export type CourtAllocation = {
  id: string;       // match id
  courtId: string | null;
};

/**
 * Assign courts to matches by round.
 * - Matches with the same roundNumber form a parallel batch, and batches
 *   are processed in round order — round 1 (across every group) is fully
 *   scheduled before round 2 starts, so no group's matches get pushed
 *   behind another group's entire schedule.
 * - Within and across batches, courts are filled via one continuously
 *   incrementing cursor (not reset per round). If it reset per round,
 *   the first court would win every round's "overflow" slot, and with
 *   many groups sharing few round numbers (e.g. a club-format rotation
 *   schedule, which only has 2-3 rounds total) that bias stacks up onto
 *   one court instead of spreading out across the whole schedule.
 *
 * Batches are sorted by match id (localeCompare ascending) before
 * allocation so the output is deterministic regardless of input order.
 */
export function allocateCourts(matches: MatchInput[], courtIds: string[]): CourtAllocation[] {
  if (matches.length === 0) return [];
  if (courtIds.length === 0) return matches.map((m) => ({ id: m.id, courtId: null }));

  const byRound = new Map<number, MatchInput[]>();
  for (const m of matches) {
    const arr = byRound.get(m.roundNumber) ?? [];
    arr.push(m);
    byRound.set(m.roundNumber, arr);
  }
  const rounds = [...byRound.keys()].sort((a, b) => a - b);

  const result: CourtAllocation[] = [];
  let cursor = 0;
  for (const r of rounds) {
    const batch = byRound.get(r)!.slice().sort((a, b) => a.id.localeCompare(b.id));
    for (const match of batch) {
      result.push({ id: match.id, courtId: courtIds[cursor % courtIds.length] });
      cursor++;
    }
  }
  return result;
}

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
 * - Matches with the same roundNumber form a parallel batch.
 * - Within a batch, distribute matches across courts in order.
 * - If batch size > court count, overflow rotates back to court 0.
 * - If no courts provided, all assignments are null.
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
  for (const r of rounds) {
    const batch = byRound.get(r)!.slice().sort((a, b) => a.id.localeCompare(b.id));
    batch.forEach((match, i) => {
      result.push({ id: match.id, courtId: courtIds[i % courtIds.length] });
    });
  }
  return result;
}

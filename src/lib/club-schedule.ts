import { roundRobinPairs } from './algorithms/circle-method';
import { rotationSchedule, type SeededPlayer } from './rotation';

export type GroupRoster = { groupId: string; players: SeededPlayer[] };

export type ClubMatchDraft = {
  groupAId: string;
  groupBId: string;
  sideAPlayers: [string, string];
  sideBPlayers: [string, string];
  roundNumber: number; // which wave (1..groupCount-1) this group-pairing plays in
  matchOrder: number; // 1..n within this group-pairing's own rotation
  courtSlot: 'primary' | 'shared';
  pairingIndexInWave: number; // which of this wave's simultaneous pairings this is (0-based) — picks the dedicated primary court
};

/**
 * How many of a pairing's n matches stay on its own dedicated court — the
 * rest move to the shared court, so all (groupCount/2 + 1) courts end up
 * with roughly the same number of matches per wave.
 * x = round(groupCount * n / (groupCount + 2)), clamped to [0, n].
 */
export function primaryCourtCount(groupCount: number, n: number): number {
  const x = Math.round((groupCount * n) / (groupCount + 2));
  return Math.max(0, Math.min(n, x));
}

/**
 * Builds a full inter-group round-robin schedule: which groups play which
 * groups in which wave (lib/algorithms/circle-method.ts's roundRobinPairs,
 * treating each group as one "team"), and within each group-pairing, the
 * circular partner rotation (lib/rotation.ts's rotationSchedule) — both
 * reused as-is, nothing new algorithmically there.
 *
 * Requires an even number of groups (>= 2) — odd counts would need a bye,
 * not supported yet.
 */
export function buildClubSchedule(groups: GroupRoster[]): ClubMatchDraft[] {
  if (groups.length < 2) throw new Error('too_few_groups');
  if (groups.length % 2 !== 0) throw new Error('odd_group_count');

  const byId = new Map(groups.map((g) => [g.groupId, g]));
  const pairings = roundRobinPairs(groups.map((g) => g.groupId));

  const byWave = new Map<number, typeof pairings>();
  for (const p of pairings) {
    const arr = byWave.get(p.roundNumber) ?? [];
    arr.push(p);
    byWave.set(p.roundNumber, arr);
  }

  const drafts: ClubMatchDraft[] = [];
  for (const wave of [...byWave.keys()].sort((a, b) => a - b)) {
    const pairsInWave = byWave.get(wave)!;
    const schedules = pairsInWave.map((pairing, pairingIndex) => {
      const groupA = byId.get(pairing.teamA)!;
      const groupB = byId.get(pairing.teamB)!;
      const schedule = rotationSchedule(groupA.players, groupB.players);
      const primaryCount = primaryCourtCount(groups.length, schedule.length);
      return {
        groupAId: groupA.groupId,
        groupBId: groupB.groupId,
        pairingIndex,
        primary: schedule.slice(0, primaryCount),
        shared: schedule.slice(primaryCount),
      };
    });

    // Primary matches: each pairing has its own dedicated court, so order
    // across pairings doesn't matter — append in pairing order.
    for (const s of schedules) {
      for (const m of s.primary) {
        drafts.push({
          groupAId: s.groupAId,
          groupBId: s.groupBId,
          sideAPlayers: m.sideAPlayers,
          sideBPlayers: m.sideBPlayers,
          roundNumber: wave,
          matchOrder: m.matchOrder,
          courtSlot: 'primary',
          pairingIndexInWave: s.pairingIndex,
        });
      }
    }

    // Shared-court matches: interleave round-robin across this wave's
    // pairings (ponytail: this is a best-effort display-order nicety, not
    // a correctness requirement — different pairings never share a
    // player, so any court queue order is physically valid; if the
    // interleave ever needs to be guaranteed regardless of how callers
    // sort/refetch matches, encode it into roundNumber instead).
    const maxShared = Math.max(...schedules.map((s) => s.shared.length), 0);
    for (let step = 0; step < maxShared; step++) {
      for (const s of schedules) {
        const m = s.shared[step];
        if (!m) continue;
        drafts.push({
          groupAId: s.groupAId,
          groupBId: s.groupBId,
          sideAPlayers: m.sideAPlayers,
          sideBPlayers: m.sideBPlayers,
          roundNumber: wave,
          matchOrder: m.matchOrder,
          courtSlot: 'shared',
          pairingIndexInWave: s.pairingIndex,
        });
      }
    }
  }
  return drafts;
}

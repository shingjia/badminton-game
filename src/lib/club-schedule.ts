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
  pairingIndexInWave: number; // which of this wave's simultaneous pairings this is (0-based) — picks the pairing's dedicated court
};

/**
 * Builds a full inter-group round-robin schedule: which groups play which
 * groups in which wave (lib/algorithms/circle-method.ts's roundRobinPairs,
 * treating each group as one "team"), and within each group-pairing, the
 * circular partner rotation (lib/rotation.ts's rotationSchedule) — both
 * reused as-is, nothing new algorithmically there.
 *
 * Relay cumulative scoring means a pairing's segments MUST run serially
 * on one court (each segment starts from the previous one's score), so
 * every match stays on its pairing's dedicated court — exactly
 * groupCount/2 courts, no shared-court load balancing.
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
    pairsInWave.forEach((pairing, pairingIndex) => {
      const groupA = byId.get(pairing.teamA)!;
      const groupB = byId.get(pairing.teamB)!;
      for (const m of rotationSchedule(groupA.players, groupB.players)) {
        drafts.push({
          groupAId: groupA.groupId,
          groupBId: groupB.groupId,
          sideAPlayers: m.sideAPlayers,
          sideBPlayers: m.sideBPlayers,
          roundNumber: wave,
          matchOrder: m.matchOrder,
          pairingIndexInWave: pairingIndex,
        });
      }
    });
  }
  return drafts;
}

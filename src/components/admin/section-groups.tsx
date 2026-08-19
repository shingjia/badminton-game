'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Group, Player, Pair, Tournament } from '@prisma/client';

type GroupWithData = Group & { players: Player[]; pairs: Pair[] };

export function SectionGroups({
  tournament,
  revision,
}: {
  tournament: Tournament;
  revision: number;
}) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupWithData[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  const canGenerate = tournament.status === 'draft' || tournament.status === 'grouping';
  const canEdit = tournament.status === 'grouping';

  useEffect(() => {
    api<GroupWithData[]>(`/api/tournaments/${tournament.id}/groups`).then(setGroups);
    api<Player[]>(`/api/tournaments/${tournament.id}/players`).then(setPlayers);
  }, [tournament.id, revision]);

  function byLevelBuckets() {
    const byLevel = new Map<string, string[]>();
    for (const p of players) {
      const lvl = p.level ?? 'unassigned';
      const arr = byLevel.get(lvl) ?? [];
      arr.push(p.id);
      byLevel.set(lvl, arr);
    }
    return byLevel;
  }

  const GROUP_ERR: Record<string, string> = {
    no_groups: '沒有可分組的球員',
    group_too_small: '有一組人數少於 2 人，請調整組數或增加球員',
    odd_players_in_group: '有一組人數是奇數（雙打需要偶數），請調整「組數」設定或增減球員人數後再試一次',
    duplicate_player: '同一位球員被分到多組，請重新整理後再試一次',
  };

  async function submitGroups(groupsPayload: { levelCode: string; playerIds: string[] }[]) {
    try {
      await api(`/api/tournaments/${tournament.id}/groups/generate`, {
        method: 'POST',
        body: { groups: groupsPayload },
      });
      toast({ title: '已產生分組' });
    } catch (e: any) {
      const code = e.body?.error;
      toast({ title: '無法產生分組', description: GROUP_ERR[code] ?? code, variant: 'destructive' });
    }
  }

  // 依等級自動分組：每個等級各自成一組
  async function generateByLevel() {
    const groupsPayload = [...byLevelBuckets().entries()].map(([levelCode, playerIds]) => ({
      levelCode,
      playerIds,
    }));
    await submitGroups(groupsPayload);
  }

  // 各組等級均分：把每個等級的球員 round-robin 分散到 groupCount 組，
  // 讓每一組都混到各等級的人，而不是一個等級一組。
  async function generateMixed() {
    const byLevel = byLevelBuckets();
    const n = tournament.groupCount;
    const buckets: string[][] = Array.from({ length: n }, () => []);
    let cursor = 0;
    for (const lvl of [...byLevel.keys()].sort()) {
      for (const pid of byLevel.get(lvl)!) {
        buckets[cursor % n].push(pid);
        cursor++;
      }
    }
    // 雙打要求每組偶數人；round-robin 有時會剛好讓每組都變奇數
    // （例如 52 人分 4 組 = 13 人一組）。不自動搬人湊數——那樣會
    // 悄悄打亂各組的等級分佈，改由後端擋下並提示，由使用者決定
    // 要調組數還是調人數。
    const groupsPayload = buckets
      .filter((playerIds) => playerIds.length > 0)
      .map((playerIds) => ({ levelCode: '混合', playerIds }));
    await submitGroups(groupsPayload);
  }

  async function movePlayer(playerId: string, toGroupId: string) {
    try {
      await api(`/api/players/${playerId}`, {
        method: 'PATCH',
        body: { groupId: toGroupId },
      });
    } catch {
      toast({ title: '移動失敗', variant: 'destructive' });
    }
  }

  async function shuffle(groupId: string) {
    try {
      await api(`/api/groups/${groupId}/pairs/shuffle`, { method: 'POST' });
      toast({ title: '配對已重抽' });
    } catch (e: any) {
      toast({ title: '重抽失敗', description: e.body?.error, variant: 'destructive' });
    }
  }

  async function lockPairing(groupId: string) {
    try {
      await api(`/api/groups/${groupId}/pairs/lock`, { method: 'POST' });
      toast({ title: '配對已鎖定' });
    } catch (e: any) {
      toast({ title: '鎖定失敗', description: e.body?.error, variant: 'destructive' });
    }
  }

  return (
    <section id="groups" className="scroll-mt-16">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-semibold">分組與配對</h2>
        {canGenerate && (
          <>
            <Button onClick={generateByLevel} size="sm" disabled={players.length === 0}>
              依等級自動分組
            </Button>
            <Button
              onClick={generateMixed}
              size="sm"
              variant="outline"
              disabled={players.length === 0}
            >
              各組等級均分
            </Button>
          </>
        )}
      </div>

      <div className="grid gap-4 border-l-4 border-l-purple-500 pl-4 md:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const isLocked = !!g.pairingLockedAt;
          return (
            <Card key={g.id} className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">
                  {g.name} 組{' '}
                  <span className="text-xs text-muted-foreground">({g.levelCode})</span>
                </div>
                {isLocked && (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                    已鎖定
                  </span>
                )}
              </div>

              <div className="mb-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">球員</div>
                <ul className="space-y-1">
                  {g.players.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {p.name}
                        {p.level && (
                          <span className="ml-1 text-xs text-muted-foreground">({p.level})</span>
                        )}
                      </span>
                      {canEdit && !isLocked && (
                        <select
                          className="h-7 rounded border px-1 text-xs"
                          value={g.id}
                          onChange={(e) => movePlayer(p.id, e.target.value)}
                        >
                          {groups.map((gg) => (
                            <option key={gg.id} value={gg.id}>
                              {gg.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              {g.pairs.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 text-xs font-medium text-muted-foreground">配對</div>
                  <ul className="space-y-1">
                    {g.pairs.map((pair, idx) => {
                      const p1 = g.players.find((p) => p.id === pair.player1Id);
                      const p2 = g.players.find((p) => p.id === pair.player2Id);
                      return (
                        <li key={pair.id} className="text-sm">
                          {idx + 1}. {p1?.name ?? '?'} / {p2?.name ?? '?'}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {canEdit && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isLocked}
                    onClick={() => shuffle(g.id)}
                  >
                    重抽配對
                  </Button>
                  <Button
                    size="sm"
                    disabled={isLocked || g.pairs.length === 0}
                    onClick={() => lockPairing(g.id)}
                  >
                    鎖定配對
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

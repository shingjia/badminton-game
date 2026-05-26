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

  async function generate() {
    // Auto-assign: group players by their level field; each distinct level = one group
    const byLevel = new Map<string, string[]>();
    for (const p of players) {
      const lvl = p.level ?? 'unassigned';
      const arr = byLevel.get(lvl) ?? [];
      arr.push(p.id);
      byLevel.set(lvl, arr);
    }
    const groupsPayload = [...byLevel.entries()].map(([levelCode, playerIds]) => ({
      levelCode,
      playerIds,
    }));
    try {
      await api(`/api/tournaments/${tournament.id}/groups/generate`, {
        method: 'POST',
        body: { groups: groupsPayload },
      });
      toast({ title: '已產生分組' });
    } catch (e: any) {
      toast({ title: '無法產生分組', description: e.body?.error, variant: 'destructive' });
    }
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
        <h2 className="text-xl font-semibold">3. 分組與配對</h2>
        {canGenerate && (
          <Button onClick={generate} size="sm" disabled={players.length === 0}>
            依等級自動分組
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                      <span>{p.name}</span>
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

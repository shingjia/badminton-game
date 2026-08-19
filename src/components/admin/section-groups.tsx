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
  // 換人＝直接改該位置的姓名，不動 group/pair/match 資料，所以不受鎖定
  // 或分組公正性影響，賽事結束前都能改。
  const canEditNames = tournament.status !== 'finished';

  useEffect(() => {
    api<GroupWithData[]>(`/api/tournaments/${tournament.id}/groups`).then(setGroups);
    api<Player[]>(`/api/tournaments/${tournament.id}/players`).then(setPlayers);
  }, [tournament.id, revision]);

  // 分組完球員預設沒有棒次；只要組內有人棒次是空的，就依目前順序
  // （棒次優先，沒有就依姓名）自動補上 1..N，讓上下移動按鈕一開始
  // 就有東西可以動，不用管理員自己一個一個手動輸入。
  useEffect(() => {
    for (const g of groups) {
      if (g.players.some((p) => p.seed == null)) {
        orderPlayers(g.players).forEach((p, i) => {
          if (p.seed !== i + 1) updatePlayer(p.id, { seed: i + 1 });
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  function orderPlayers(players: Player[]) {
    return [...players].sort(
      (a, b) => (a.seed ?? Infinity) - (b.seed ?? Infinity) || a.name.localeCompare(b.name),
    );
  }

  async function moveSeed(g: GroupWithData, playerId: string, dir: 'up' | 'down') {
    const ordered = orderPlayers(g.players);
    const i = ordered.findIndex((p) => p.id === playerId);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    await Promise.all(ordered.map((p, idx) => updatePlayer(p.id, { seed: idx + 1 })));
  }

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

  async function updatePlayer(playerId: string, patch: { name?: string; seed?: number | null }) {
    try {
      await api(`/api/players/${playerId}`, { method: 'PATCH', body: patch });
    } catch {
      toast({ title: '更新失敗', variant: 'destructive' });
    }
  }

  const PAIR_METHODS = [
    { key: 'random', label: '隨機重抽' },
    { key: 'seed', label: '依棒次配對' },
    { key: 'level', label: '依等級配對' },
  ] as const;

  async function shuffle(groupId: string, method: (typeof PAIR_METHODS)[number]['key']) {
    try {
      await api(`/api/groups/${groupId}/pairs/shuffle`, { method: 'POST', body: { method } });
      toast({ title: '配對已產生' });
    } catch (e: any) {
      const code = e.body?.error;
      const msg = code === 'group_has_scored_matches' ? '這組已經有比賽計分了，無法重新配對' : undefined;
      toast({ title: '配對失敗', description: msg ?? code, variant: 'destructive' });
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
                  {orderPlayers(g.players).map((p, idx) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      {canEditNames && (
                        <input
                          type="number"
                          min={1}
                          max={999}
                          defaultValue={p.seed ?? ''}
                          placeholder="棒次"
                          title="棒次"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            const seed = v ? Number(v) : null;
                            if (seed !== (p.seed ?? null)) updatePlayer(p.id, { seed });
                          }}
                          className="h-7 w-12 shrink-0 rounded border px-1 text-center"
                        />
                      )}
                      {canEditNames ? (
                        <input
                          defaultValue={p.name}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== p.name) updatePlayer(p.id, { name: v });
                          }}
                          className="h-7 min-w-0 flex-1 rounded border px-1"
                        />
                      ) : (
                        <span>{p.name}</span>
                      )}
                      {p.level && (
                        <span className="text-xs text-muted-foreground">({p.level})</span>
                      )}
                      {canEditNames && (
                        <span className="ml-auto flex shrink-0 gap-0.5">
                          <button
                            type="button"
                            title="上移"
                            aria-label="上移"
                            disabled={idx === 0}
                            onClick={() => moveSeed(g, p.id, 'up')}
                            className="flex h-6 w-6 items-center justify-center rounded border text-xs disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            title="下移"
                            aria-label="下移"
                            disabled={idx === g.players.length - 1}
                            onClick={() => moveSeed(g, p.id, 'down')}
                            className="flex h-6 w-6 items-center justify-center rounded border text-xs disabled:opacity-30"
                          >
                            ▼
                          </button>
                        </span>
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
                <div className="flex flex-wrap gap-2">
                  {PAIR_METHODS.map((m) => (
                    <Button
                      key={m.key}
                      size="sm"
                      variant="outline"
                      onClick={() => shuffle(g.id, m.key)}
                    >
                      {m.label}
                    </Button>
                  ))}
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

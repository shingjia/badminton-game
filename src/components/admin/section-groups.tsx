'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { useSafeEffect } from '@/lib/use-safe-effect';
import type { Group, Player, Pair, Tournament } from '@prisma/client';

type GroupWithData = Group & { players: Player[]; pairs: Pair[] };

// Fisher–Yates — 讓「各組等級均分」重複按時分出不同的組合，不是每次都
// 一樣的固定結果。
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  const [matchInfo, setMatchInfo] = useState<
    { roundNumber: number; status: string; scoreA: number; scoreB: number }[]
  >([]);
  const hasMatches = matchInfo.length > 0;

  // 進行中的循環：已開始計分（有分數或有完賽場次）但還沒全部完賽。
  // 這期間調整棒次沒有意義（該循環的配對已固定），擋下並提示。
  const waveInPlay = (() => {
    const byWave = new Map<number, typeof matchInfo>();
    for (const m of matchInfo) {
      const arr = byWave.get(m.roundNumber) ?? [];
      arr.push(m);
      byWave.set(m.roundNumber, arr);
    }
    for (const bucket of byWave.values()) {
      const started = bucket.some(
        (m) => m.status === 'completed' || m.scoreA > 0 || m.scoreB > 0,
      );
      const done = bucket.every((m) => m.status === 'completed');
      if (started && !done) return true;
    }
    return false;
  })();

  const canGenerate = tournament.status === 'draft' || tournament.status === 'grouping';
  const canEdit = tournament.status === 'grouping';
  // 換人＝直接改該位置的姓名，不動 group/pair/match 資料，所以不受鎖定
  // 或分組公正性影響，賽事結束前都能改。
  const canEditNames = tournament.status !== 'finished';

  useSafeEffect((isCancelled) => {
    api<GroupWithData[]>(`/api/tournaments/${tournament.id}/groups`).then((data) => {
      if (!isCancelled()) setGroups(data);
    });
    api<Player[]>(`/api/tournaments/${tournament.id}/players`).then((data) => {
      if (!isCancelled()) setPlayers(data);
    });
    // 組名鎖定與「循環進行中」判斷都要看比賽狀態（'match.generated' 會
    // bump revision，切回這個分頁也會重新掛載重抓保持同步）。
    api<{ roundNumber: number; status: string; scoreA: number; scoreB: number }[]>(
      `/api/tournaments/${tournament.id}/matches`,
    ).then((data) => {
      if (!isCancelled()) setMatchInfo(data);
    });
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
    if (waveInPlay) {
      toast({
        title: '循環比賽進行中，無法調整順序',
        description: '待目前循環的所有場次完賽後即可調整',
        variant: 'destructive',
      });
      return;
    }
    const ordered = orderPlayers(g.players);
    const i = ordered.findIndex((p) => p.id === playerId);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    // 樂觀更新：先本地重排再送 PATCH，畫面不依賴 socket 廣播回推
    // （廣播若沒收到，之前會看起來「按了沒反應」）。
    const seedOf = new Map(ordered.map((p, idx) => [p.id, idx + 1]));
    setGroups((gs) =>
      gs.map((gr) =>
        gr.id === g.id
          ? { ...gr, players: gr.players.map((p) => ({ ...p, seed: seedOf.get(p.id) ?? p.seed })) }
          : gr,
      ),
    );
    // 只送真的變動的棒次（正常情況一次交換只有 2 個人變），避免整組
    // N 個 PATCH＋N 次廣播重抓把連線塞滿，拖慢接下來的操作。
    await Promise.all(
      ordered
        .map((p, idx) => ({ p, seed: idx + 1 }))
        .filter(({ p, seed }) => p.seed !== seed)
        .map(({ p, seed }) => updatePlayer(p.id, { seed })),
    );
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
    club_odd_group_count: '會內賽的隊伍數必須為偶數（兩兩對戰），請調整組數讓隊伍總數為偶數',
  };

  async function submitGroups(groupsPayload: { levelCode: string; playerIds: string[] }[]) {
    try {
      const { groups: created } = await api<{ groups: { id: string }[] }>(
        `/api/tournaments/${tournament.id}/groups/generate`,
        { method: 'POST', body: { groups: groupsPayload } },
      );
      return created;
    } catch (e: any) {
      const code = e.body?.error;
      toast({ title: '無法產生分組', description: GROUP_ERR[code] ?? code, variant: 'destructive' });
      return null;
    }
  }

  // 依等級自動分組：每個等級各自成一組，分完直接隨機配對，不用再手動
  // 逐組按重抽——友誼賽只剩這一種分組方式，省掉那一步。
  async function generateByLevel() {
    const groupsPayload = [...byLevelBuckets().entries()].map(([levelCode, playerIds]) => ({
      levelCode,
      playerIds,
    }));
    const created = await submitGroups(groupsPayload);
    if (!created) return;
    await Promise.all(created.map((g) => shuffle(g.id, { silent: true })));
    toast({ title: '已產生分組並完成配對' });
  }

  // 各組等級均分：把每個等級的球員 round-robin 分散到 groupCount 組，
  // 讓每一組都混到各等級的人，而不是一個等級一組。桶內順序先隨機打散，
  // 這樣「不滿意再按一次」才會分出不同的組合，等級分佈規則不變（規則
  // 本身沒變，只是同一等級內誰先進哪一組是隨機的）。
  async function generateMixed() {
    const byLevel = byLevelBuckets();
    const n = tournament.groupCount;
    const buckets: string[][] = Array.from({ length: n }, () => []);
    let cursor = 0;
    for (const lvl of [...byLevel.keys()].sort()) {
      const ids = shuffleArray(byLevel.get(lvl)!);
      for (const pid of ids) {
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
    const created = await submitGroups(groupsPayload);
    if (created) toast({ title: '已產生分組' });
  }

  async function updateGroupName(groupId: string, name: string) {
    try {
      await api(`/api/groups/${groupId}`, { method: 'PATCH', body: { name } });
    } catch (e: any) {
      const code = e.body?.error;
      toast({
        title: '更新組名失敗',
        description: code === 'matches_already_generated' ? '賽程已產生，組名不得再修改' : code,
        variant: 'destructive',
      });
    }
  }

  async function updatePlayer(playerId: string, patch: { name?: string; seed?: number | null }) {
    try {
      await api(`/api/players/${playerId}`, { method: 'PATCH', body: patch });
    } catch {
      toast({ title: '更新失敗', variant: 'destructive' });
    }
  }

  // 配對固定隨機——不再讓使用者選棒次配對／等級配對，只留一顆可以
  // 重抽的按鈕。
  async function shuffle(groupId: string, opts: { silent?: boolean } = {}) {
    try {
      await api(`/api/groups/${groupId}/pairs/shuffle`, {
        method: 'POST',
        body: { method: 'random' },
      });
      if (!opts.silent) toast({ title: '配對已重抽' });
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

  async function confirmGrouping() {
    try {
      await api(`/api/tournaments/${tournament.id}/groups/lock`, { method: 'POST' });
      toast({ title: '分組已確認，可以到「賽程」分頁產生對戰' });
    } catch (e: any) {
      const code = e.body?.error;
      const msg =
        code === 'players_not_grouped'
          ? '還有球員沒有被分到任何一組'
          : code === 'group_too_small'
            ? '有一組人數少於 2 人'
            : undefined;
      toast({ title: '無法確認分組', description: msg ?? code, variant: 'destructive' });
    }
  }

  return (
    <section id="groups" className="scroll-mt-16">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-semibold">分組與配對</h2>
        {canGenerate && tournament.format === 'friendly' && (
          <Button onClick={generateByLevel} size="sm" disabled={players.length === 0}>
            依等級自動分組
          </Button>
        )}
        {canGenerate && tournament.format === 'club' && (
          <Button onClick={generateMixed} size="sm" disabled={players.length === 0}>
            各組等級均分
          </Button>
        )}
        {canEdit && tournament.format === 'club' && (
          <Button onClick={confirmGrouping} size="sm">
            確認分組，開始賽程
          </Button>
        )}
      </div>

      <div className="grid gap-4 border-l-4 border-l-purple-500 pl-4 md:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => {
          const isLocked = !!g.pairingLockedAt;
          return (
            <Card key={g.id} className="p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1 font-semibold">
                  {canEditNames && !hasMatches ? (
                    <input
                      defaultValue={g.name}
                      title="組別名稱"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== g.name) updateGroupName(g.id, v);
                      }}
                      className="h-7 w-20 rounded border px-1"
                    />
                  ) : (
                    <span>{g.name}</span>
                  )}
                  <span>組</span>
                  <span className="text-xs text-muted-foreground">({g.levelCode})</span>
                </div>
                {isLocked && (
                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                    已鎖定
                  </span>
                )}
              </div>

              <div className="mb-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">順序</div>
                <ul className="space-y-1">
                  {orderPlayers(g.players).map((p, idx) => (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      {canEditNames && (
                        <span
                          title="順序（用右側箭頭調整）"
                          className="flex h-7 w-12 shrink-0 items-center justify-center rounded border bg-muted text-center text-muted-foreground"
                        >
                          {idx + 1}
                        </span>
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

              {tournament.format === 'friendly' && g.pairs.length > 0 && (
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

              {canEdit && tournament.format === 'friendly' && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => shuffle(g.id)}>
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

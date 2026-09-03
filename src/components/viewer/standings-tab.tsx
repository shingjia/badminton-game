'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import { useSafeEffect } from '@/lib/use-safe-effect';
import type { Group, Player, Pair } from '@prisma/client';

type PairRow = {
  pair_id: string;
  group_id: string;
  wins: number;
  losses: number;
  played: number;
  point_diff: number;
  points_for: number;
  points_against: number;
  rank: number;
};
type GroupBlock = { groupId: string; standings: PairRow[] };

// 會內賽排名比的是組跟組，一份賽事只有一張表，沒有 pair/player 概念。
type GroupRow = {
  group_id: string;
  wins: number;
  losses: number;
  played: number;
  point_diff: number;
  points_for: number;
  points_against: number;
  rank: number;
};

type GroupWithRelations = Group & { players: Player[]; pairs: Pair[] };

function medal(rank: number, played: number) {
  const hasMedal = played > 0 && rank <= 3;
  if (!hasMedal) return { className: '', label: <span className="text-muted-foreground">{rank}</span> };
  if (rank === 1) return { className: 'bg-amber-50', label: <span className="font-bold text-amber-700">🥇 冠軍</span> };
  if (rank === 2) return { className: 'bg-slate-50', label: <span className="font-bold text-slate-700">🥈 亞軍</span> };
  return { className: 'bg-orange-50', label: <span className="font-bold text-orange-700">🥉 季軍</span> };
}

export function StandingsTab({
  tournamentId,
  revision,
  format,
}: {
  tournamentId: string;
  revision: number;
  format: 'friendly' | 'club';
}) {
  const [blocks, setBlocks] = useState<GroupBlock[]>([]);
  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);
  const [groups, setGroups] = useState<GroupWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRules, setShowRules] = useState(false);

  useSafeEffect((isCancelled) => {
    setLoading(true);
    Promise.all([
      api<GroupBlock[] | GroupRow[]>(`/api/tournaments/${tournamentId}/standings`),
      api<GroupWithRelations[]>(`/api/tournaments/${tournamentId}/groups`),
    ])
      .then(([s, g]) => {
        if (isCancelled()) return;
        if (format === 'club') setGroupRows(s as GroupRow[]);
        else setBlocks(s as GroupBlock[]);
        setGroups(g);
      })
      .finally(() => {
        if (!isCancelled()) setLoading(false);
      });
  }, [tournamentId, revision, format]);

  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? '';

  if (loading && blocks.length === 0 && groupRows.length === 0) {
    return <p className="py-6 text-muted-foreground">載入中…</p>;
  }

  if (format === 'club') {
    if (groupRows.length === 0) return <p className="py-6 text-muted-foreground">尚無排名資料</p>;
    return (
      <div className="py-4">
        <button
          type="button"
          onClick={() => setShowRules((s) => !s)}
          className="mb-3 text-sm text-primary underline-offset-2 hover:underline"
        >
          {showRules ? '隱藏規則' : '查看規則'}
        </button>
        {showRules && (
          <p className="mb-3 text-sm text-muted-foreground">
            每個循環採累計接力計分：分數逐段累計，第 N 段的換人分數為 N ×
            每局分數，任一組達到就換下一組上場。先達到最終目標分數（段數 ×
            每局分數）的一組拿下該循環 1 勝、另一組 1
            負。最終分數若剛好打平（正常接力不會發生，手動修改分數才可能），比較兩隊目前為止的總失分，較少的一方拿下這場勝；總失分也相同的話，兩隊同樣都算
            1 勝。所有循環結束後，依勝場數排名；勝場相同時比總得分（多者在前），再相同比總失分（少者在前）。總得分／總失分計的是各循環結束時的累計分數。
          </p>
        )}
        <Card className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">名次</TableHead>
                <TableHead>組別</TableHead>
                <TableHead className="text-right">勝</TableHead>
                <TableHead className="text-right">負</TableHead>
                <TableHead className="text-right">場次</TableHead>
                <TableHead className="text-right">得分差</TableHead>
                <TableHead className="text-right">總得分</TableHead>
                <TableHead className="text-right">總失分</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupRows.map((r) => {
                const m = medal(r.rank, r.played);
                return (
                  <TableRow key={r.group_id} className={m.className}>
                    <TableCell className="font-medium whitespace-nowrap">{m.label}</TableCell>
                    <TableCell>{groupName(r.group_id)} 組</TableCell>
                    <TableCell className="text-right">{r.wins}</TableCell>
                    <TableCell className="text-right">{r.losses}</TableCell>
                    <TableCell className="text-right">{r.played}</TableCell>
                    <TableCell className="text-right">{r.point_diff}</TableCell>
                    <TableCell className="text-right">{r.points_for}</TableCell>
                    <TableCell className="text-right">{r.points_against}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    );
  }

  if (blocks.length === 0) return <p className="py-6 text-muted-foreground">尚無排名資料</p>;

  const pairLabel = (pairId: string) => {
    for (const g of groups) {
      const pair = g.pairs.find((p) => p.id === pairId);
      if (!pair) continue;
      const p1 = g.players.find((pl) => pl.id === pair.player1Id)?.name ?? '?';
      const p2 = g.players.find((pl) => pl.id === pair.player2Id)?.name ?? '?';
      return `${p1} / ${p2}`;
    }
    return pairId.slice(0, 6);
  };

  return (
    <div className="space-y-6 py-4">
      {blocks.map((b) => (
        <Card key={b.groupId} className="p-4">
          <div className="mb-3 text-lg font-semibold">{groupName(b.groupId)} 組</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">名次</TableHead>
                <TableHead>配對</TableHead>
                <TableHead className="text-right">勝</TableHead>
                <TableHead className="text-right">負</TableHead>
                <TableHead className="text-right">場次</TableHead>
                <TableHead className="text-right">得分差</TableHead>
                <TableHead className="text-right">總得分</TableHead>
                <TableHead className="text-right">總失分</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.standings.map((r) => {
                const m = medal(r.rank, r.played);
                return (
                  <TableRow key={r.pair_id} className={m.className}>
                    <TableCell className="font-medium whitespace-nowrap">{m.label}</TableCell>
                    <TableCell>{pairLabel(r.pair_id)}</TableCell>
                    <TableCell className="text-right">{r.wins}</TableCell>
                    <TableCell className="text-right">{r.losses}</TableCell>
                    <TableCell className="text-right">{r.played}</TableCell>
                    <TableCell className="text-right">{r.point_diff}</TableCell>
                    <TableCell className="text-right">{r.points_for}</TableCell>
                    <TableCell className="text-right">{r.points_against}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

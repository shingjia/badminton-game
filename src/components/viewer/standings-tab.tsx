'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import type { Group, Player, Pair } from '@prisma/client';

type Row = {
  pair_id?: string;
  player_id?: string;
  group_id: string;
  wins: number;
  losses: number;
  played: number;
  point_diff: number;
  points_for: number;
  points_against: number;
  rank: number;
};
type GroupBlock = { groupId: string; standings: Row[] };
type GroupWithRelations = Group & { players: Player[]; pairs: Pair[] };

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
  const [groups, setGroups] = useState<GroupWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api<GroupBlock[]>(`/api/tournaments/${tournamentId}/standings`),
      api<GroupWithRelations[]>(`/api/tournaments/${tournamentId}/groups`),
    ])
      .then(([s, g]) => {
        setBlocks(s);
        setGroups(g);
      })
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && blocks.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
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
  const playerLabel = (playerId: string) => {
    for (const g of groups) {
      const p = g.players.find((pl) => pl.id === playerId);
      if (p) return p.name;
    }
    return playerId.slice(0, 6);
  };
  const subjectLabel = (r: Row) =>
    format === 'club' ? playerLabel(r.player_id!) : pairLabel(r.pair_id!);
  const subjectKey = (r: Row) => (format === 'club' ? r.player_id! : r.pair_id!);
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? '';

  return (
    <div className="space-y-6 py-4">
      {blocks.map((b) => (
        <Card key={b.groupId} className="p-4">
          <div className="mb-3 text-lg font-semibold">{groupName(b.groupId)} 組</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">名次</TableHead>
                <TableHead>{format === 'club' ? '球員' : '配對'}</TableHead>
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
                const hasMedal = r.played > 0 && (r.rank === 1 || r.rank === 2 || r.rank === 3);
                return (
                <TableRow
                  key={subjectKey(r)}
                  className={
                    hasMedal && r.rank === 1
                      ? 'bg-amber-50'
                      : hasMedal && r.rank === 2
                        ? 'bg-slate-50'
                        : hasMedal && r.rank === 3
                          ? 'bg-orange-50'
                          : ''
                  }
                >
                  <TableCell className="font-medium whitespace-nowrap">
                    {hasMedal && r.rank === 1 ? (
                      <span className="font-bold text-amber-700">🥇 冠軍</span>
                    ) : hasMedal && r.rank === 2 ? (
                      <span className="font-bold text-slate-700">🥈 亞軍</span>
                    ) : hasMedal && r.rank === 3 ? (
                      <span className="font-bold text-orange-700">🥉 季軍</span>
                    ) : (
                      <span className="text-muted-foreground">{r.rank}</span>
                    )}
                  </TableCell>
                  <TableCell>{subjectLabel(r)}</TableCell>
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

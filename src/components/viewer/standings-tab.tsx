'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api-client';
import type { Group, Player, Pair } from '@prisma/client';

type Row = {
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
type GroupBlock = { groupId: string; standings: Row[] };
type GroupWithRelations = Group & { players: Player[]; pairs: Pair[] };

export function StandingsTab({ tournamentId, revision }: { tournamentId: string; revision: number }) {
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
  const groupName = (id: string) => groups.find((g) => g.id === id)?.name ?? '';

  return (
    <div className="space-y-6 py-4">
      {blocks.map((b) => (
        <Card key={b.groupId} className="p-4">
          <div className="mb-3 text-lg font-semibold">{groupName(b.groupId)} 組</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
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
              {b.standings.map((r) => (
                <TableRow key={r.pair_id}>
                  <TableCell className="font-medium">{r.rank}</TableCell>
                  <TableCell>{pairLabel(r.pair_id)}</TableCell>
                  <TableCell className="text-right">{r.wins}</TableCell>
                  <TableCell className="text-right">{r.losses}</TableCell>
                  <TableCell className="text-right">{r.played}</TableCell>
                  <TableCell className="text-right">{r.point_diff}</TableCell>
                  <TableCell className="text-right">{r.points_for}</TableCell>
                  <TableCell className="text-right">{r.points_against}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}

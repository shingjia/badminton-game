'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import type { Group, Player, Pair } from '@prisma/client';

type GroupWithData = Group & { players: Player[]; pairs: Pair[] };

export function GroupsTab({
  tournamentId,
  revision,
  format,
  showLevel,
}: {
  tournamentId: string;
  revision: number;
  format: 'friendly' | 'club';
  showLevel: boolean;
}) {
  const [groups, setGroups] = useState<GroupWithData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<GroupWithData[]>(`/api/tournaments/${tournamentId}/groups`)
      .then(setGroups)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && groups.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
  if (groups.length === 0) return <p className="py-6 text-muted-foreground">尚未分組</p>;

  return (
    <div className="grid gap-4 py-4 md:grid-cols-2 lg:grid-cols-3">
      {groups
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((g) => {
          const sortedPairs = g.pairs
            .slice()
            .sort((a, b) => a.displayOrder - b.displayOrder);
          return (
            <Card key={g.id} className="overflow-hidden">
              <div className="bg-amber-400 px-3 py-1.5 text-sm font-bold text-amber-950">
                分組 {g.displayOrder}
              </div>
              <div className="space-y-3 p-3">
                <div className="text-sm">
                  <span className="font-medium text-muted-foreground">成員：</span>
                  {g.players.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && '、'}
                      {p.name}
                      {showLevel && p.level && (
                        <span className="text-muted-foreground">({p.level})</span>
                      )}
                    </span>
                  ))}
                </div>
                {format === 'friendly' && sortedPairs.length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    {sortedPairs.map((pair, i) => {
                      const p1 = g.players.find((x) => x.id === pair.player1Id);
                      const p2 = g.players.find((x) => x.id === pair.player2Id);
                      return (
                        <div
                          key={pair.id}
                          className="rounded bg-amber-50 px-2 py-1 text-sm"
                        >
                          <span className="font-medium text-amber-900">配對 {i + 1}：</span>
                          {p1?.name ?? '?'} & {p2?.name ?? '?'}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
    </div>
  );
}

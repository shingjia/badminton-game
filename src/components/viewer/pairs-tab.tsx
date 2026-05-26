'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import type { Group, Player, Pair } from '@prisma/client';

type GroupWithData = Group & { players: Player[]; pairs: Pair[] };

export function PairsTab({
  tournamentId,
  revision,
}: {
  tournamentId: string;
  revision: number;
}) {
  const [groups, setGroups] = useState<GroupWithData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<GroupWithData[]>(`/api/tournaments/${tournamentId}/groups`)
      .then(setGroups)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && groups.length === 0)
    return <p className="py-6 text-muted-foreground">載入中...</p>;

  const groupsWithPairs = groups.filter((g) => g.pairs.length > 0);
  if (groupsWithPairs.length === 0)
    return <p className="py-6 text-muted-foreground">尚未配對</p>;

  return (
    <div className="grid gap-4 py-4 md:grid-cols-2 lg:grid-cols-3">
      {groupsWithPairs.map((g) => (
        <Card key={g.id} className="p-4">
          <div className="mb-2 text-lg font-semibold">
            {g.name} 組
            {g.pairingLockedAt && (
              <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
                已鎖定
              </span>
            )}
          </div>
          <ul className="space-y-1 text-sm">
            {g.pairs
              .slice()
              .sort((a, b) => a.displayOrder - b.displayOrder)
              .map((pair, idx) => {
                const p1 = g.players.find((p) => p.id === pair.player1Id);
                const p2 = g.players.find((p) => p.id === pair.player2Id);
                return (
                  <li key={pair.id} className="flex gap-2">
                    <span className="text-muted-foreground">{idx + 1}.</span>
                    <span>
                      {p1?.name ?? '?'} / {p2?.name ?? '?'}
                    </span>
                  </li>
                );
              })}
          </ul>
        </Card>
      ))}
    </div>
  );
}

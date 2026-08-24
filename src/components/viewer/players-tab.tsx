'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import type { Player } from '@prisma/client';

export function PlayersTab({
  tournamentId,
  revision,
  showLevel,
}: {
  tournamentId: string;
  revision: number;
  showLevel: boolean;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Player[]>(`/api/tournaments/${tournamentId}/players`)
      .then(setPlayers)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && players.length === 0)
    return <p className="py-6 text-muted-foreground">載入中...</p>;
  if (players.length === 0)
    return <p className="py-6 text-muted-foreground">尚無球員報名</p>;

  return (
    <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {players.map((p) => (
        <Card key={p.id} className="p-4">
          <div className="flex items-start justify-between">
            <div className="font-medium">{p.name}</div>
            {showLevel && p.level && <Badge variant="outline">{p.level}</Badge>}
          </div>
        </Card>
      ))}
    </div>
  );
}

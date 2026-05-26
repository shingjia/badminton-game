'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import type { Group, Player } from '@prisma/client';

type GroupWithPlayers = Group & { players: Player[] };

export function GroupsTab({ tournamentId, revision }: { tournamentId: string; revision: number }) {
  const [groups, setGroups] = useState<GroupWithPlayers[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<GroupWithPlayers[]>(`/api/tournaments/${tournamentId}/groups`)
      .then(setGroups)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && groups.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
  if (groups.length === 0) return <p className="py-6 text-muted-foreground">尚未分組</p>;

  return (
    <div className="grid gap-4 py-4 md:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <Card key={g.id} className="p-4">
          <div className="mb-2 text-lg font-semibold">
            {g.name} 組
            <span className="ml-2 text-sm text-muted-foreground">({g.levelCode})</span>
          </div>
          <ul className="space-y-1 text-sm">
            {g.players.map((p) => (
              <li key={p.id} className="flex justify-between">
                <span>{p.name}</span>
                {p.level && <span className="text-muted-foreground">{p.level}</span>}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

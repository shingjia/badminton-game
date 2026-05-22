'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { seedLabel } from '@/lib/format';
import type { Team } from '@prisma/client';

export function TeamsTab({ tournamentId, revision }: { tournamentId: string; revision: number }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Team[]>(`/api/tournaments/${tournamentId}/teams`)
      .then(setTeams)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && teams.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
  if (teams.length === 0) return <p className="py-6 text-muted-foreground">尚無隊伍報名</p>;

  return (
    <div className="grid gap-3 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((t) => (
        <Card key={t.id} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-sm text-muted-foreground">
                {t.player1Name} / {t.player2Name}
              </div>
            </div>
            <Badge variant="outline" title={`種子等級 ${t.seedLevel}`}>
              {seedLabel(t.seedLevel)}
            </Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}

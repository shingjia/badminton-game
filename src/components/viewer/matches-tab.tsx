'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import type { Match, Team, Court, Group } from '@prisma/client';

type MatchFull = Match & { teamA: Team; teamB: Team; court: Court | null; group: Group };

export function MatchesTab({ tournamentId, revision }: { tournamentId: string; revision: number }) {
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<MatchFull[]>(`/api/tournaments/${tournamentId}/matches`)
      .then(setMatches)
      .finally(() => setLoading(false));
  }, [tournamentId, revision]);

  if (loading && matches.length === 0) return <p className="py-6 text-muted-foreground">載入中…</p>;
  if (matches.length === 0) return <p className="py-6 text-muted-foreground">尚無賽程</p>;

  // group by group name
  const byGroup = new Map<string, MatchFull[]>();
  for (const m of matches) {
    const k = m.group.name;
    const arr = byGroup.get(k) ?? [];
    arr.push(m);
    byGroup.set(k, arr);
  }

  return (
    <div className="space-y-6 py-4">
      {[...byGroup.entries()].map(([gname, ms]) => (
        <div key={gname}>
          <div className="mb-2 text-lg font-semibold">{gname} 組</div>
          <div className="grid gap-2 md:grid-cols-2">
            {ms.map((m) => (
              <Card key={m.id} className="flex items-center justify-between p-3">
                <div className="text-sm">
                  <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
                  <span className="font-medium">{m.teamA.name}</span>
                  <span className="mx-2">vs</span>
                  <span className="font-medium">{m.teamB.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {m.court && (
                    <Badge variant="outline" className="text-xs">
                      {m.court.name}
                    </Badge>
                  )}
                  {m.status === 'completed' ? (
                    <span className="text-sm font-mono">
                      {m.scoreA} - {m.scoreB}
                    </span>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      未開賽
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

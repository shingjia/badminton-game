'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import type { Match, Pair, Player, Court, Group } from '@prisma/client';

type PairWithPlayers = Pair & { player1: Player; player2: Player };
type MatchFull = Match & {
  pairA: PairWithPlayers;
  pairB: PairWithPlayers;
  court: Court | null;
  group: Group;
};

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

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
            {ms.map((m) => {
              const done = m.status === 'completed';
              const playing = !done && (m.scoreA > 0 || m.scoreB > 0);
              return (
                <Card
                  key={m.id}
                  className={`flex items-center justify-between p-3 ${
                    done
                      ? 'border-emerald-300 bg-emerald-50'
                      : playing
                        ? 'border-amber-300 bg-amber-50'
                        : ''
                  }`}
                >
                  <div className="text-sm">
                    <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
                    <span className="font-medium">{pairLabel(m.pairA)}</span>
                    <span className="mx-2">vs</span>
                    <span className="font-medium">{pairLabel(m.pairB)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.court && (
                      <Badge variant="outline" className="text-xs">
                        {m.court.name}
                      </Badge>
                    )}
                    {done ? (
                      <span className="rounded bg-emerald-600 px-2 py-0.5 font-mono text-sm font-bold text-white">
                        {m.scoreA} - {m.scoreB}
                      </span>
                    ) : playing ? (
                      <span className="rounded bg-amber-500 px-2 py-0.5 font-mono text-sm font-bold text-white">
                        {m.scoreA} - {m.scoreB}
                      </span>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        未開賽
                      </Badge>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

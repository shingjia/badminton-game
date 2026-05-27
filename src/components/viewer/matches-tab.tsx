'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import type { Match, Pair, Player, Court, Group } from '@prisma/client';
import { MatchGraph } from '@/components/viewer/match-graph';

type PairWithPlayers = Pair & { player1: Player; player2: Player };
type MatchFull = Match & {
  pairA: PairWithPlayers;
  pairB: PairWithPlayers;
  court: Court | null;
  group: Group;
};

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
    <div className="space-y-4 py-4">
      {[...byGroup.entries()].map(([gname, ms]) => {
        const completed = ms.filter((m) => m.status === 'completed').length;
        const total = ms.length;
        return (
          <Card key={gname} className="p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <div className="text-lg font-semibold">{gname} 組</div>
              <div className="text-xs text-muted-foreground">
                {completed} / {total} 場已完成
              </div>
            </div>
            <MatchGraph matches={ms} />
          </Card>
        );
      })}
      <div className="text-center text-xs text-muted-foreground">
        <span className="mr-3">
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-emerald-600"></span>
          已完成
        </span>
        <span className="mr-3">
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-amber-500"></span>
          進行中
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-3 border border-dashed border-gray-400"></span>
          未開賽
        </span>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

function pairLabel(p: PairWithPlayers) {
  return `${p.player1.name} / ${p.player2.name}`;
}

type ViewMode = 'graph' | 'list';

export function MatchesTab({ tournamentId, revision }: { tournamentId: string; revision: number }) {
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>('graph');

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
      <div className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
        <Button
          size="sm"
          variant={view === 'graph' ? 'default' : 'ghost'}
          onClick={() => setView('graph')}
          className="h-8 w-full"
        >
          循環圖
        </Button>
        <Button
          size="sm"
          variant={view === 'list' ? 'default' : 'ghost'}
          onClick={() => setView('list')}
          className="h-8 w-full"
        >
          列表
        </Button>
      </div>

      {[...byGroup.entries()].map(([gname, ms]) => {
        const completed = ms.filter((m) => m.status === 'completed').length;
        const total = ms.length;
        return (
          <Card key={gname} className="p-4">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="text-lg font-semibold">{gname} 組</div>
              <div className="text-xs text-muted-foreground">
                {completed} / {total} 場已完成
              </div>
            </div>
            {view === 'graph' ? (
              <MatchGraph matches={ms} />
            ) : (
              <MatchList matches={ms} />
            )}
          </Card>
        );
      })}

      {view === 'graph' && (
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
      )}
    </div>
  );
}

function MatchList({ matches }: { matches: MatchFull[] }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {matches.map((m) => {
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
            <div className="flex shrink-0 items-center gap-2">
              {m.court && (
                <Badge variant="outline" className="text-xs">
                  {m.court.name}
                </Badge>
              )}
              {done ? (
                <span className="whitespace-nowrap rounded bg-emerald-600 px-2 py-0.5 font-mono text-sm font-bold text-white">
                  {m.scoreA} - {m.scoreB}
                </span>
              ) : playing ? (
                <span className="whitespace-nowrap rounded bg-amber-500 px-2 py-0.5 font-mono text-sm font-bold text-white">
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
  );
}

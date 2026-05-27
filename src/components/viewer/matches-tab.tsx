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

type ViewMode = 'graph' | 'group' | 'court';

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

  // Group by group
  const byGroup = new Map<string, MatchFull[]>();
  for (const m of matches) {
    const k = m.group.name;
    const arr = byGroup.get(k) ?? [];
    arr.push(m);
    byGroup.set(k, arr);
  }

  // Group by court
  type CourtBlock = { key: string; courtName: string; courtOrder: number; matches: MatchFull[] };
  const byCourtMap = new Map<string, CourtBlock>();
  for (const m of matches) {
    const key = m.court?.id ?? '__none__';
    const block = byCourtMap.get(key) ?? {
      key,
      courtName: m.court?.name ?? '未排場地',
      courtOrder: m.court?.displayOrder ?? 9999,
      matches: [],
    };
    block.matches.push(m);
    byCourtMap.set(key, block);
  }
  const byCourt = Array.from(byCourtMap.values()).sort((a, b) => a.courtOrder - b.courtOrder);
  for (const c of byCourt) {
    c.matches.sort((a, b) =>
      a.roundNumber !== b.roundNumber ? a.roundNumber - b.roundNumber : a.matchOrder - b.matchOrder,
    );
  }

  return (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/40 p-1">
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
          variant={view === 'group' ? 'default' : 'ghost'}
          onClick={() => setView('group')}
          className="h-8 w-full"
        >
          分組列表
        </Button>
        <Button
          size="sm"
          variant={view === 'court' ? 'default' : 'ghost'}
          onClick={() => setView('court')}
          className="h-8 w-full"
        >
          場地列表
        </Button>
      </div>

      {view === 'graph' &&
        [...byGroup.entries()].map(([gname, ms]) => {
          const completed = ms.filter((m) => m.status === 'completed').length;
          const total = ms.length;
          return (
            <Card key={gname} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-block rounded-lg bg-slate-800 px-4 py-1.5 text-xl font-bold text-white shadow">
                  {gname} 組
                </span>
                <div className="text-xs text-muted-foreground">
                  {completed} / {total} 場已完成
                </div>
              </div>
              <MatchGraph matches={ms} />
            </Card>
          );
        })}

      {view === 'group' &&
        [...byGroup.entries()].map(([gname, ms]) => {
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
              <MatchList matches={ms} showGroup={false} />
            </Card>
          );
        })}

      {view === 'court' &&
        byCourt.map((c) => {
          const completed = c.matches.filter((m) => m.status === 'completed').length;
          const total = c.matches.length;
          return (
            <Card key={c.key} className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-lg font-semibold">{c.courtName}</div>
                <div className="text-xs text-muted-foreground">
                  {completed} / {total} 場已完成
                </div>
              </div>
              <MatchList matches={c.matches} showGroup />
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

function MatchList({ matches, showGroup }: { matches: MatchFull[]; showGroup: boolean }) {
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
              {showGroup && (
                <Badge variant="outline" className="mr-1 text-xs">
                  {m.group.name}
                </Badge>
              )}
              <span className="font-medium">{pairLabel(m.pairA)}</span>
              <span className="mx-2">vs</span>
              <span className="font-medium">{pairLabel(m.pairB)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!showGroup && m.court && (
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

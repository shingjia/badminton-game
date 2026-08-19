'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Court, Group, Match, Pair, Player, Tournament } from '@prisma/client';

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

type GroupingMode = 'group' | 'court';

export function SectionScoring({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const [mode, setMode] = useState<GroupingMode>('group');
  const editable = tournament.status === 'in_progress' || tournament.status === 'finished';

  useEffect(() => {
    api<MatchFull[]>(`/api/tournaments/${tournament.id}/matches`).then(setMatches);
  }, [tournament.id, revision]);

  // Group by group
  type Block = { key: string; title: string; order: number; matches: MatchFull[] };

  const byGroup = new Map<string, Block>();
  for (const m of matches) {
    const block = byGroup.get(m.group.id) ?? {
      key: m.group.id,
      title: `${m.group.name} 組`,
      order: m.group.displayOrder ?? 0,
      matches: [],
    };
    block.matches.push(m);
    byGroup.set(m.group.id, block);
  }
  const groupBlocks = Array.from(byGroup.values()).sort((a, b) => a.order - b.order);
  for (const b of groupBlocks) {
    b.matches.sort((a, b) =>
      a.roundNumber !== b.roundNumber ? a.roundNumber - b.roundNumber : a.matchOrder - b.matchOrder,
    );
  }

  // Group by court
  const byCourt = new Map<string, Block>();
  for (const m of matches) {
    const key = m.court?.id ?? '__none__';
    const block = byCourt.get(key) ?? {
      key,
      title: m.court?.name ?? '未排場地',
      order: m.court?.displayOrder ?? 9999,
      matches: [],
    };
    block.matches.push(m);
    byCourt.set(key, block);
  }
  const courtBlocks = Array.from(byCourt.values()).sort((a, b) => a.order - b.order);
  for (const b of courtBlocks) {
    b.matches.sort((a, b) =>
      a.roundNumber !== b.roundNumber ? a.roundNumber - b.roundNumber : a.matchOrder - b.matchOrder,
    );
  }

  const blocks = mode === 'group' ? groupBlocks : courtBlocks;

  return (
    <section id="scoring" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">5. 計分</h2>
      {!editable && <p className="text-muted-foreground">尚未進入計分階段</p>}
      {matches.length > 0 && (
        <div className="mb-3 grid max-w-xs grid-cols-2 gap-1 rounded-lg border bg-muted/40 p-1">
          <Button
            size="sm"
            variant={mode === 'group' ? 'default' : 'ghost'}
            onClick={() => setMode('group')}
            className="h-8 w-full"
          >
            依分組
          </Button>
          <Button
            size="sm"
            variant={mode === 'court' ? 'default' : 'ghost'}
            onClick={() => setMode('court')}
            className="h-8 w-full"
          >
            依場地
          </Button>
        </div>
      )}
      <div className="space-y-4">
        {blocks.map((b) => {
          const completed = b.matches.filter((m) => m.status === 'completed').length;
          return (
            <div key={b.key}>
              <div className="mb-2 flex items-baseline justify-between">
                <div className="text-base font-semibold">{b.title}</div>
                <div className="text-xs text-muted-foreground">
                  {completed} / {b.matches.length} 場已完成
                </div>
              </div>
              <div className="grid gap-2">
                {b.matches.map((m) => (
                  <ScoreRow key={m.id} match={m} revision={revision} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ScoreRow({ match, revision }: { match: MatchFull; revision: number }) {
  const { toast } = useToast();
  const [a, setA] = useState(match.scoreA);
  const [b, setB] = useState(match.scoreB);

  useEffect(() => {
    setA(match.scoreA);
    setB(match.scoreB);
  }, [match.scoreA, match.scoreB, revision]);

  function bump(side: 'A' | 'B', delta: number) {
    const nextA = side === 'A' ? Math.max(0, a + delta) : a;
    const nextB = side === 'B' ? Math.max(0, b + delta) : b;
    if (nextA === a && nextB === b) return;
    setA(nextA);
    setB(nextB);
    api(`/api/matches/${match.id}/score`, {
      method: 'PATCH',
      body: { scoreA: nextA, scoreB: nextB },
    }).catch((e) => {
      setA(match.scoreA);
      setB(match.scoreB);
      const reason = e instanceof ApiError ? e.body?.error : 'unknown';
      toast({ title: '計分失敗', description: reason, variant: 'destructive' });
    });
  }

  const isCompleted = match.status === 'completed';
  const isPlaying = !isCompleted && (match.scoreA > 0 || match.scoreB > 0);

  return (
    <Card className={`space-y-3 p-3 ${isCompleted ? 'border-emerald-300 bg-emerald-50' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{match.group.name}#{match.matchOrder}</Badge>
        {match.court && <Badge variant="outline">{match.court.name}</Badge>}
        {isCompleted ? (
          <Badge className="ml-auto bg-emerald-600 hover:bg-emerald-600">已完成</Badge>
        ) : isPlaying ? (
          <Badge className="ml-auto bg-amber-500 hover:bg-amber-500">比賽進行中</Badge>
        ) : (
          <Badge variant="secondary" className="ml-auto">未開賽</Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['A', 'B'] as const).map((side) => {
          const score = side === 'A' ? a : b;
          const pair = side === 'A' ? match.pairA : match.pairB;
          return (
            <div key={side} className="flex flex-col items-center gap-2">
              <div className="text-center text-sm font-medium">{pairLabel(pair)}</div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-12 w-12 text-2xl"
                  onClick={() => bump(side, -1)}
                  aria-label="-1"
                >
                  −
                </Button>
                <div className="w-14 text-center text-4xl font-bold tabular-nums">{score}</div>
                <Button
                  size="icon"
                  className="h-12 w-12 text-2xl"
                  onClick={() => bump(side, +1)}
                  aria-label="+1"
                >
                  +
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

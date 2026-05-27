'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export function SectionScoring({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const editable = tournament.status === 'in_progress' || tournament.status === 'finished';

  useEffect(() => {
    api<MatchFull[]>(`/api/tournaments/${tournament.id}/matches`).then(setMatches);
  }, [tournament.id, revision]);

  return (
    <section id="scoring" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">5. 計分</h2>
      {!editable && <p className="text-muted-foreground">尚未進入計分階段</p>}
      <div className="grid gap-2">
        {matches.map((m) => (
          <ScoreRow key={m.id} match={m} revision={revision} />
        ))}
      </div>
    </section>
  );
}

function ScoreRow({ match, revision }: { match: MatchFull; revision: number }) {
  const { toast } = useToast();
  const [a, setA] = useState(String(match.scoreA));
  const [b, setB] = useState(String(match.scoreB));

  useEffect(() => {
    setA(String(match.scoreA));
    setB(String(match.scoreB));
  }, [match.scoreA, match.scoreB, revision]);

  async function save() {
    try {
      await api(`/api/matches/${match.id}/score`, {
        method: 'PATCH',
        body: { scoreA: Number(a), scoreB: Number(b) },
      });
      toast({ title: '已記分' });
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error : 'unknown';
      toast({ title: '計分失敗', description: reason, variant: 'destructive' });
    }
  }

  const isCompleted = match.status === 'completed';
  const isPlaying = !isCompleted && (match.scoreA > 0 || match.scoreB > 0);

  return (
    <Card
      className={`flex flex-wrap items-center gap-3 p-3 text-sm ${
        isCompleted ? 'border-emerald-300 bg-emerald-50' : ''
      }`}
    >
      <Badge variant="outline" className="text-xs">{match.group.name}#{match.matchOrder}</Badge>
      {match.court && <Badge variant="outline" className="text-xs">{match.court.name}</Badge>}
      <span className="min-w-[8rem]">{pairLabel(match.pairA)}</span>
      <Input
        className="h-8 w-16 text-center"
        type="number"
        min={0}
        max={30}
        value={a}
        onChange={(e) => setA(e.target.value)}
      />
      <span>-</span>
      <Input
        className="h-8 w-16 text-center"
        type="number"
        min={0}
        max={30}
        value={b}
        onChange={(e) => setB(e.target.value)}
      />
      <span className="min-w-[8rem]">{pairLabel(match.pairB)}</span>
      <Button size="sm" onClick={save}>
        儲存
      </Button>
      {isCompleted ? (
        <Badge className="ml-auto bg-emerald-600 text-xs hover:bg-emerald-600">已完成</Badge>
      ) : isPlaying ? (
        <Badge className="ml-auto bg-amber-500 text-xs hover:bg-amber-500">比賽進行中</Badge>
      ) : (
        <Badge variant="secondary" className="ml-auto text-xs">未開賽</Badge>
      )}
    </Card>
  );
}

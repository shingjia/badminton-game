'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
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

export function SectionMatches({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const { toast } = useToast();
  const [matches, setMatches] = useState<MatchFull[]>([]);

  useEffect(() => {
    api<MatchFull[]>(`/api/tournaments/${tournament.id}/matches`).then(setMatches);
  }, [tournament.id, revision]);

  const ERR: Record<string, string> = {
    no_matches_to_generate: '每組至少要有 2 對才能產生對戰',
    no_groups: '尚未分組',
    unequal_sides: '有一組依等級分出的兩隊人數不相等，請調整組數或球員人數',
    side_too_small: '有一組分出的兩隊人數少於 3 人，無法輪轉搭檔，請調整組數或球員人數',
    odd_group_count: '會內賽的組數必須是偶數（組跟組要兩兩對戰），請調整組數',
    court_count_mismatch: '會內賽的場地數必須等於「組數÷2 + 1」，請調整場地或組數',
  };

  async function generate() {
    try {
      await api(`/api/tournaments/${tournament.id}/matches/generate`, { method: 'POST' });
      toast({ title: '已產生賽程' });
    } catch (e: any) {
      const code = e.body?.error;
      toast({ title: '無法產生賽程', description: ERR[code] ?? code, variant: 'destructive' });
    }
  }

  const byGroup = new Map<string, MatchFull[]>();
  for (const m of matches) {
    const k = m.group.name;
    (byGroup.get(k) ?? byGroup.set(k, []).get(k)!).push(m);
  }

  return (
    <section id="matches" className="scroll-mt-16">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-semibold">賽程</h2>
        <Button onClick={generate} size="sm" disabled={tournament.status !== 'in_progress' || matches.length > 0}>
          {matches.length > 0 ? '已產生' : '產生對戰 + 分配場地'}
        </Button>
        <span className="text-sm text-muted-foreground">{matches.length} 場</span>
      </div>
      <div className="space-y-4 border-l-4 border-l-emerald-500 pl-4">
        {[...byGroup.entries()].map(([gname, ms]) => (
          <Card key={gname} className="p-3">
            <div className="mb-2 font-semibold">{gname} 組</div>
            <div className="grid gap-2 md:grid-cols-2">
              {ms.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
                    {pairLabel(m.pairA)} <span className="mx-1">vs</span> {pairLabel(m.pairB)}
                  </div>
                  {m.court && <Badge variant="outline" className="text-xs">{m.court.name}</Badge>}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

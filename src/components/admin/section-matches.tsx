'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Court, Group, Match, Team, Tournament } from '@prisma/client';

type MatchFull = Match & { teamA: Team; teamB: Team; court: Court | null; group: Group };

export function SectionMatches({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const { toast } = useToast();
  const [matches, setMatches] = useState<MatchFull[]>([]);
  const canGenerate =
    tournament.status === 'in_progress' &&
    matches.every((m) => m.status === 'pending');

  useEffect(() => {
    api<MatchFull[]>(`/api/tournaments/${tournament.id}/matches`).then(setMatches);
  }, [tournament.id, revision]);

  async function generate() {
    try {
      await api(`/api/tournaments/${tournament.id}/matches/generate`, { method: 'POST' });
      toast({ title: '已產生賽程' });
    } catch (e: any) {
      toast({ title: '無法產生賽程', description: e.body?.error, variant: 'destructive' });
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
        <h2 className="text-xl font-semibold">4. 賽程</h2>
        <Button onClick={generate} size="sm" disabled={tournament.status !== 'in_progress' || matches.length > 0}>
          {matches.length > 0 ? '已產生' : '產生對戰 + 分配場地'}
        </Button>
        <span className="text-sm text-muted-foreground">{matches.length} 場</span>
      </div>
      <div className="space-y-4">
        {[...byGroup.entries()].map(([gname, ms]) => (
          <Card key={gname} className="p-3">
            <div className="mb-2 font-semibold">{gname} 組</div>
            <div className="grid gap-2 md:grid-cols-2">
              {ms.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">#{m.matchOrder}</span>{' '}
                    {m.teamA.name} <span className="mx-1">vs</span> {m.teamB.name}
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

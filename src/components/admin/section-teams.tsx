'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { seedLabel } from '@/lib/format';
import type { Team, Tournament } from '@prisma/client';

export function SectionTeams({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const { toast } = useToast();
  const locked = tournament.status === 'in_progress' || tournament.status === 'finished';
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState('');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [seed, setSeed] = useState(3);

  useEffect(() => {
    api<Team[]>(`/api/tournaments/${tournament.id}/teams`).then(setTeams);
  }, [tournament.id, revision]);

  async function add() {
    try {
      await api(`/api/tournaments/${tournament.id}/teams`, {
        method: 'POST',
        body: { name, player1Name: p1, player2Name: p2, seedLevel: seed },
      });
      setName('');
      setP1('');
      setP2('');
      setSeed(3);
    } catch {
      toast({ title: '新增失敗', variant: 'destructive' });
    }
  }

  async function remove(id: string) {
    await api(`/api/teams/${id}`, { method: 'DELETE' });
  }

  return (
    <section id="teams" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">2. 隊伍報名 ({teams.length})</h2>
      <Card className="p-4">
        {!locked && (
          <div className="mb-4 grid gap-3 md:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="t-name">隊名</Label>
              <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-p1">選手 1</Label>
              <Input id="t-p1" value={p1} onChange={(e) => setP1(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="t-p2">選手 2</Label>
              <Input id="t-p2" value={p2} onChange={(e) => setP2(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>種子</Label>
              <Select value={String(seed)} onValueChange={(v) => setSeed(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {seedLabel(n)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={add}
                disabled={!name.trim() || !p1.trim() || !p2.trim()}
                className="w-full"
              >
                新增
              </Button>
            </div>
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border p-2">
              <div className="flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t.player1Name} / {t.player2Name} · {seedLabel(t.seedLevel)}
                </div>
              </div>
              {!locked && (
                <Button variant="ghost" size="sm" onClick={() => remove(t.id)}>
                  刪除
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

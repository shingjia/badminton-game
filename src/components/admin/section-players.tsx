'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Player, Tournament } from '@prisma/client';

export function SectionPlayers({
  tournament,
  revision,
}: {
  tournament: Tournament;
  revision: number;
}) {
  const { toast } = useToast();
  const locked = tournament.status === 'in_progress' || tournament.status === 'finished';
  const [players, setPlayers] = useState<Player[]>([]);
  const [name, setName] = useState('');
  const [level, setLevel] = useState('');

  useEffect(() => {
    api<Player[]>(`/api/tournaments/${tournament.id}/players`).then(setPlayers);
  }, [tournament.id, revision]);

  async function add() {
    if (!name.trim()) return;
    try {
      await api(`/api/tournaments/${tournament.id}/players`, {
        method: 'POST',
        body: { name: name.trim(), level: level.trim() || undefined },
      });
      setName('');
      setLevel('');
    } catch {
      toast({ title: '新增失敗', variant: 'destructive' });
    }
  }

  async function remove(id: string) {
    try {
      await api(`/api/players/${id}`, { method: 'DELETE' });
    } catch {
      toast({ title: '刪除失敗', variant: 'destructive' });
    }
  }

  return (
    <section id="players" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">2. 球員報名 ({players.length})</h2>
      <Card className="p-4">
        {!locked && (
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="p-name">姓名</Label>
              <Input
                id="p-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="球員姓名"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-level">等級</Label>
              <Input
                id="p-level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="例：A、B、C"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={add} disabled={!name.trim()} className="w-full">
                新增
              </Button>
            </div>
          </div>
        )}
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {players.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border p-2">
              <div className="flex-1">
                <div className="font-medium">{p.name}</div>
                {p.level && (
                  <div className="text-xs text-muted-foreground">等級：{p.level}</div>
                )}
              </div>
              {!locked && (
                <Button variant="ghost" size="sm" onClick={() => remove(p.id)}>
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

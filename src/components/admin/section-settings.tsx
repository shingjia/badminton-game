'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Court, Tournament } from '@prisma/client';

export function SectionSettings({ tournament }: { tournament: Tournament }) {
  const { toast } = useToast();
  const [name, setName] = useState(tournament.name);
  const [groupCount, setGroupCount] = useState(tournament.groupCount);
  const [pointsPerGame, setPointsPerGame] = useState(tournament.pointsPerGame);
  const [courts, setCourts] = useState<Court[]>([]);
  const [newCourt, setNewCourt] = useState('');

  const lockedSettings = tournament.status !== 'draft';

  useEffect(() => {
    api<Court[]>(`/api/tournaments/${tournament.id}/courts`).then(setCourts);
  }, [tournament.id]);

  async function saveSettings() {
    try {
      await api(`/api/tournaments/${tournament.id}`, {
        method: 'PATCH',
        body: { name, groupCount, pointsPerGame },
      });
      toast({ title: '已儲存' });
    } catch {
      toast({ title: '儲存失敗', variant: 'destructive' });
    }
  }

  async function addCourt() {
    if (!newCourt.trim()) return;
    const c = await api<Court>(`/api/tournaments/${tournament.id}/courts`, {
      method: 'POST',
      body: { name: newCourt.trim() },
    });
    setCourts((cs) => [...cs, c]);
    setNewCourt('');
  }

  async function removeCourt(id: string) {
    await api(`/api/courts/${id}`, { method: 'DELETE' });
    setCourts((cs) => cs.filter((c) => c.id !== id));
  }

  return (
    <section id="settings" className="scroll-mt-16">
      <h2 className="mb-3 text-xl font-semibold">1. 賽事設定</h2>
      <Card className="space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="s-name">名稱</Label>
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-gc">組數</Label>
            <Input
              id="s-gc"
              type="number"
              min={1}
              max={26}
              value={groupCount}
              onChange={(e) => setGroupCount(Number(e.target.value))}
              disabled={lockedSettings}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-ppg">每局分數</Label>
            <Input
              id="s-ppg"
              type="number"
              min={11}
              max={31}
              value={pointsPerGame}
              onChange={(e) => setPointsPerGame(Number(e.target.value))}
              disabled={lockedSettings}
            />
          </div>
        </div>
        <Button onClick={saveSettings} size="sm">
          儲存設定
        </Button>

        <div className="border-t pt-4">
          <Label>場地</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {courts.map((c) => (
              <div key={c.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
                {c.name}
                <button
                  onClick={() => removeCourt(c.id)}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                  aria-label="刪除"
                  disabled={lockedSettings}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input
              placeholder="場地名稱（例：場地 1）"
              value={newCourt}
              onChange={(e) => setNewCourt(e.target.value)}
              className="max-w-xs"
              disabled={lockedSettings}
            />
            <Button onClick={addCourt} size="sm" disabled={lockedSettings || !newCourt.trim()}>
              新增場地
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
}

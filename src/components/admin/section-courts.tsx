'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api-client';
import { useSafeEffect } from '@/lib/use-safe-effect';
import type { Court, Tournament } from '@prisma/client';

export function SectionCourts({ tournament }: { tournament: Tournament }) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [newCourt, setNewCourt] = useState('');

  useSafeEffect((isCancelled) => {
    api<Court[]>(`/api/tournaments/${tournament.id}/courts`).then((data) => {
      if (!isCancelled()) setCourts(data);
    });
  }, [tournament.id]);

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
    <section>
      <h2 className="mb-3 text-xl font-semibold">場地</h2>
      <Card className="space-y-3 border-l-4 border-l-orange-500 p-4">
        <div className="flex flex-wrap gap-2">
          {courts.length === 0 && (
            <p className="text-sm text-muted-foreground">尚未新增場地</p>
          )}
          {courts.map((c) => (
            <div key={c.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
              {c.name}
              <button
                onClick={() => removeCourt(c.id)}
                className="ml-1 text-muted-foreground hover:text-destructive"
                aria-label="刪除"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="場地名稱（例：場地 1）"
            value={newCourt}
            onChange={(e) => setNewCourt(e.target.value)}
            className="max-w-xs"
          />
          <Button onClick={addCourt} size="sm" disabled={!newCourt.trim()}>
            新增場地
          </Button>
        </div>
      </Card>
    </section>
  );
}

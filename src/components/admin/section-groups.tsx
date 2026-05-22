'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Group, Team, Tournament } from '@prisma/client';

type GroupWithTeams = Group & { teams: Team[] };

export function SectionGroups({ tournament, revision }: { tournament: Tournament; revision: number }) {
  const { toast } = useToast();
  const [groups, setGroups] = useState<GroupWithTeams[]>([]);
  const canGenerate = tournament.status === 'draft' || tournament.status === 'grouping';
  const canEdit = tournament.status === 'grouping';
  const canLock = tournament.status === 'grouping' && groups.length > 0;

  useEffect(() => {
    api<GroupWithTeams[]>(`/api/tournaments/${tournament.id}/groups`).then(setGroups);
  }, [tournament.id, revision]);

  async function generate() {
    try {
      await api(`/api/tournaments/${tournament.id}/groups/generate`, { method: 'POST' });
      toast({ title: '已產生分組' });
    } catch (e: any) {
      toast({ title: '無法產生分組', description: e.body?.error, variant: 'destructive' });
    }
  }

  async function lock() {
    try {
      await api(`/api/tournaments/${tournament.id}/groups/lock`, { method: 'POST' });
      toast({ title: '已鎖定分組' });
    } catch (e: any) {
      toast({ title: '無法鎖定', description: e.body?.error, variant: 'destructive' });
    }
  }

  async function moveTeam(teamId: string, groupId: string) {
    try {
      await api(`/api/teams/${teamId}/move-group`, { method: 'PATCH', body: { groupId } });
    } catch {
      toast({ title: '移動失敗', variant: 'destructive' });
    }
  }

  return (
    <section id="groups" className="scroll-mt-16">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-xl font-semibold">3. 分組</h2>
        <Button onClick={generate} disabled={!canGenerate} size="sm">
          產生分組（蛇形）
        </Button>
        <Button onClick={lock} disabled={!canLock} size="sm" variant="default">
          鎖定分組
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <Card key={g.id} className="p-3">
            <div className="mb-2 font-semibold">{g.name} 組</div>
            <ul className="space-y-1">
              {g.teams.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{t.name}</span>
                  {canEdit && (
                    <Select value={g.id} onValueChange={(v) => moveTeam(t.id, v)}>
                      <SelectTrigger className="h-7 w-20 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((gg) => (
                          <SelectItem key={gg.id} value={gg.id}>
                            {gg.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}

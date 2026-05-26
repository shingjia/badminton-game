'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function CreateTournamentDialog() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [groupCount, setGroupCount] = useState(4);

  async function submit() {
    try {
      const t = await api<{ id: string }>('/api/tournaments', {
        method: 'POST',
        body: { name, groupCount },
      });
      setOpen(false);
      router.push(`/admin/t/${t.id}`);
    } catch {
      toast({ title: '建立失敗', variant: 'destructive' });
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>新增賽事</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新增賽事</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">名稱</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gc">組數</Label>
            <Input
              id="gc"
              type="number"
              min={1}
              max={26}
              value={groupCount}
              onChange={(e) => setGroupCount(Number(e.target.value))}
            />
          </div>
          <Button onClick={submit} disabled={!name.trim()} className="w-full">
            建立
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import type { Tournament } from '@prisma/client';

export function TournamentListAdmin({ tournaments }: { tournaments: Tournament[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<Tournament | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/api/tournaments/${pendingDelete.id}`, { method: 'DELETE' });
      toast({ title: '已刪除', description: pendingDelete.name });
      setPendingDelete(null);
      router.refresh();
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error ?? e.message : '未知錯誤';
      toast({ title: '刪除失敗', description: reason, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  if (tournaments.length === 0) {
    return <p className="text-muted-foreground">尚無賽事，請按右上「新增賽事」</p>;
  }

  return (
    <>
      <div className="grid gap-3">
        {tournaments.map((t) => (
          <Card key={t.id} className="relative transition hover:bg-accent/40">
            <Link href={`/admin/t/${t.id}`} className="block">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3 pr-12">
                <CardTitle className="text-base">{t.name}</CardTitle>
                <StatusBadge status={t.status} />
              </CardHeader>
              <CardContent className="py-2 text-sm text-muted-foreground">
                {t.groupCount} 組 · {new Date(t.createdAt).toLocaleString('zh-TW')}
              </CardContent>
            </Link>
            <div className="absolute right-3 top-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="更多操作"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={(e) => {
                      e.preventDefault();
                      setPendingDelete(t);
                    }}
                  >
                    刪除賽事
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        ))}
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除「{pendingDelete?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作會同時刪除該賽事下所有球員、分組、配對、比賽紀錄，且無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? '刪除中…' : '刪除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

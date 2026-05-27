'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

type AdminUserRow = {
  id: string;
  username: string;
  isOwner: boolean;
  createdAt: string;
};

export function UserManagementCard({ currentUserId }: { currentUserId: string }) {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<AdminUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const list = await api<AdminUserRow[]>('/api/admin/users');
      setUsers(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const canSubmit =
    !submitting && newUsername.trim().length >= 1 && newPassword.length >= 6;

  async function create() {
    setSubmitting(true);
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: { username: newUsername.trim(), password: newPassword },
      });
      toast({ title: '已新增管理者' });
      setNewUsername('');
      setNewPassword('');
      await refresh();
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error ?? e.message : '未知錯誤';
      toast({ title: '新增失敗', description: reason, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api(`/api/admin/users/${pendingDelete.id}`, { method: 'DELETE' });
      toast({ title: '已刪除', description: pendingDelete.username });
      setPendingDelete(null);
      await refresh();
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error ?? e.message : '未知錯誤';
      toast({ title: '刪除失敗', description: reason, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-base font-semibold">管理者帳號</h2>

      <div className="space-y-2">
        {loading && users.length === 0 ? (
          <p className="text-sm text-muted-foreground">載入中…</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無管理者</p>
        ) : (
          users.map((u) => {
            const isSelf = u.id === currentUserId;
            return (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-md border p-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{u.username}</span>
                  {u.isOwner && (
                    <Badge className="bg-amber-500 text-xs hover:bg-amber-500">擁有者</Badge>
                  )}
                  {isSelf && (
                    <Badge variant="outline" className="text-xs">
                      你
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={isSelf}
                  onClick={() => setPendingDelete(u)}
                >
                  刪除
                </Button>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 border-t pt-4">
        <h3 className="mb-2 text-sm font-semibold">新增管理者</h3>
        <div className="grid gap-2 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="new-username">帳號</Label>
            <Input
              id="new-username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="英數與 . _ -"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-password">密碼（至少 6 字）</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="flex items-end">
            <Button onClick={create} disabled={!canSubmit} size="sm" className="w-full">
              {submitting ? '新增中…' : '新增'}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          新增的管理者不具擁有者權限，無法新增/刪除其他管理者。
        </p>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除「{pendingDelete?.username}」？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作會立即移除該管理者帳號，無法復原。
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
    </Card>
  );
}

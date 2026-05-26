'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function PasswordChangeCard() {
  const { toast } = useToast();
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    oldPw.length > 0 &&
    newPw.length >= 6 &&
    newPw === confirmPw &&
    !submitting;

  async function submit() {
    setSubmitting(true);
    try {
      await api('/api/admin/password', {
        method: 'POST',
        body: { oldPassword: oldPw, newPassword: newPw },
      });
      toast({ title: '密碼已更新' });
      setOldPw('');
      setNewPw('');
      setConfirmPw('');
    } catch (e) {
      const reason = e instanceof ApiError ? e.body?.error ?? e.message : '未知錯誤';
      toast({ title: '更新失敗', description: reason, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-base font-semibold">管理者密碼</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="pw-old">舊密碼</Label>
          <Input
            id="pw-old"
            type="password"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pw-new">新密碼（至少 6 字）</Label>
          <Input
            id="pw-new"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pw-confirm">確認新密碼</Label>
          <Input
            id="pw-confirm"
            type="password"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password"
          />
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={submit} disabled={!canSubmit} size="sm">
          {submitting ? '更新中…' : '更新密碼'}
        </Button>
      </div>
    </Card>
  );
}

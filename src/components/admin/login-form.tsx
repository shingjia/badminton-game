'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function LoginForm({ redirect }: { redirect: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/api/admin/login', { method: 'POST', body: { password } });
      router.push(redirect);
      router.refresh();
    } catch (err) {
      const msg = err instanceof ApiError && err.status === 401 ? '密碼錯誤' : '登入失敗';
      toast({ title: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">密碼</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? '驗證中…' : '登入'}
        </Button>
      </form>
    </Card>
  );
}

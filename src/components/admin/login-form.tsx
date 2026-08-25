'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

export function LoginForm({ redirect }: { redirect: string }) {
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api('/api/admin/login', {
        method: 'POST',
        body: { username: username.trim(), password },
      });
      // ponytail: hard navigation, not router.push — router.push replays
      // Next's client-side Router Cache, which can hold a stale pre-login
      // middleware redirect if this path was ever prefetched while logged
      // out (e.g. the public "主辦登入" link prefetches /admin by default).
      // A full navigation always re-checks the cookie fresh, which is what
      // was causing login to sometimes need a second click. `redirect` is
      // attacker-controllable (query param) so validate it's an internal
      // path before handing it to the browser, not an open redirect.
      const safeRedirect = redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/admin';
      window.location.href = safeRedirect;
    } catch (err) {
      const msg = err instanceof ApiError && err.status === 401 ? '帳號或密碼錯誤' : '登入失敗';
      toast({ title: msg, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full p-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">帳號</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">密碼</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? '驗證中…' : '登入'}
        </Button>
      </form>
    </Card>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';

export function HeaderAction() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/admin/login') {
    return null;
  }

  if (pathname.startsWith('/admin')) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          await api('/api/admin/logout', { method: 'POST' });
          router.push('/');
          router.refresh();
        }}
      >
        登出
      </Button>
    );
  }

  return (
    <Link href="/admin">
      <Button variant="outline" size="sm">
        主辦登入
      </Button>
    </Link>
  );
}

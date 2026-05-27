'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api-client';

export function HeaderAction() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/admin/login') {
    return null;
  }

  async function doLogout() {
    await api('/api/admin/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  if (pathname.startsWith('/admin')) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="使用者選單">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href="/admin/settings">個人資料</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              void doLogout();
            }}
          >
            登出
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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

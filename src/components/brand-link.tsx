'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function BrandLink({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  // Login page: brand should escape to the public list (no auth required).
  // Other /admin/* paths: brand goes to admin list.
  // Everywhere else: brand goes to public list.
  const href =
    pathname === '/admin/login'
      ? '/'
      : pathname.startsWith('/admin')
        ? '/admin'
        : '/';
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

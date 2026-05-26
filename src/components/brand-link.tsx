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
  const href = pathname.startsWith('/admin') ? '/admin' : '/';
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

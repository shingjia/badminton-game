'use client';

import { usePathname } from 'next/navigation';

export function SiteHeader({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith('/t/')) return null;
  return <>{children}</>;
}

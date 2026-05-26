'use client';

import { usePathname } from 'next/navigation';
import { SiteHeaderInner } from '@/components/site-header-inner';

export function SiteHeader() {
  const pathname = usePathname();
  if (pathname.startsWith('/t/')) return null;
  return <SiteHeaderInner />;
}

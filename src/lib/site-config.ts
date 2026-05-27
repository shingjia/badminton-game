import { unstable_noStore as noStore } from 'next/cache';
import { prisma } from '@/lib/prisma';

export type SiteConfig = {
  siteName: string;
  siteIcon: string;
  siteIconImage: string | null;
};

/**
 * Resolve a stored icon image value to a renderable URL.
 * - starts with '/'  -> treated as a public-folder path (e.g. /olddriver.png)
 * - non-null filename -> served via the upload API
 * - null              -> null (caller falls back to emoji)
 */
export function siteIconImageUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith('/')) return value;
  return `/api/uploads/${value}`;
}

export const BUILTIN_LOGOS = [
  { key: '/olddriver.png', label: '老司機' },
] as const;

const DEFAULTS: SiteConfig = {
  siteName: '老司機羽球專業系統',
  siteIcon: '🏸',
  siteIconImage: null,
};

export async function getSiteConfig(): Promise<SiteConfig> {
  noStore();
  try {
    const row = await prisma.adminConfig.findUnique({
      where: { id: 0 },
      select: { siteName: true, siteIcon: true, siteIconImage: true },
    });
    return row ?? DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

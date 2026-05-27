import { unstable_noStore as noStore } from 'next/cache';
import { prisma } from '@/lib/prisma';

export type SiteConfig = {
  siteName: string;
  siteIcon: string;
  siteIconImage: string | null;
};

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

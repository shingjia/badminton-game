import { prisma } from '@/lib/prisma';

export type SiteConfig = { siteName: string; siteIcon: string };

const DEFAULTS: SiteConfig = { siteName: '羽球友誼賽', siteIcon: '🏸' };

export async function getSiteConfig(): Promise<SiteConfig> {
  const row = await prisma.adminConfig.findUnique({
    where: { id: 0 },
    select: { siteName: true, siteIcon: true },
  });
  return row ?? DEFAULTS;
}

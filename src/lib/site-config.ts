import { unstable_noStore as noStore } from 'next/cache';
import { prisma } from '@/lib/prisma';

export type SiteConfig = { siteName: string; siteIcon: string };

const DEFAULTS: SiteConfig = { siteName: '羽球友誼賽', siteIcon: '🏸' };

export async function getSiteConfig(): Promise<SiteConfig> {
  // Mark this call as dynamic so the result is never cached at build time.
  // Combined with the try/catch below, this lets the build succeed even when
  // the DB is unreachable (e.g. inside the build container), while runtime
  // requests always fetch the latest value.
  noStore();
  try {
    const row = await prisma.adminConfig.findUnique({
      where: { id: 0 },
      select: { siteName: true, siteIcon: true },
    });
    return row ?? DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

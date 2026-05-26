import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateSiteConfig } from '@/lib/schemas';

export async function PATCH(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, UpdateSiteConfig);
  if (!parsed.ok) return parsed.res;

  const config = await prisma.adminConfig.findUnique({ where: { id: 0 } });
  if (!config) {
    return NextResponse.json({ error: 'not_bootstrapped' }, { status: 500 });
  }

  const updated = await prisma.adminConfig.update({
    where: { id: 0 },
    data: {
      siteName: parsed.data.siteName,
      siteIcon: parsed.data.siteIcon,
    },
    select: { siteName: true, siteIcon: true },
  });

  return ok(updated);
}

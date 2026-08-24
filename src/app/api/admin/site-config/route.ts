import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateSiteConfig } from '@/lib/schemas';

export async function PATCH(req: NextRequest) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, UpdateSiteConfig);
  if (!parsed.ok) return parsed.res;

  // AdminConfig (id=0, singleton) may not exist yet — the row used to be
  // created by an old password-bootstrap flow that's since been removed
  // (passwords moved entirely to AdminUser). Self-heal with an upsert
  // instead of requiring pre-existence. passwordHash is a vestigial,
  // unused column at this point (nothing reads it for auth once at least
  // one AdminUser exists, which is guaranteed here since this route
  // requires an authenticated admin session) — any placeholder value is
  // fine on first creation.
  const updated = await prisma.adminConfig.upsert({
    where: { id: 0 },
    create: {
      id: 0,
      passwordHash: '',
      siteName: parsed.data.siteName,
      siteIcon: parsed.data.siteIcon,
      siteIconImage: parsed.data.siteIconImage ?? null,
    },
    update: {
      siteName: parsed.data.siteName,
      siteIcon: parsed.data.siteIcon,
      ...(parsed.data.siteIconImage !== undefined && {
        siteIconImage: parsed.data.siteIconImage,
      }),
    },
    select: { siteName: true, siteIcon: true, siteIconImage: true },
  });

  return ok(updated);
}

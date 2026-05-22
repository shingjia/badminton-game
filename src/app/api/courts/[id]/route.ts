import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, requireAdmin } from '@/lib/api-helpers';

type Params = { params: { id: string } };

export async function DELETE(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const c = await prisma.court
    .delete({ where: { id: params.id } })
    .catch(() => null);
  if (!c) return notFound();
  return ok({ deleted: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireOwner } from '@/lib/api-helpers';

type Params = { params: { id: string } };

export async function DELETE(req: NextRequest, { params }: Params) {
  const guard = await requireOwner(req);
  if (guard instanceof NextResponse) return guard;

  if (params.id === guard.userId) {
    return conflict('cannot_delete_self');
  }

  const target = await prisma.adminUser.findUnique({ where: { id: params.id } });
  if (!target) return notFound();

  if (target.isOwner) {
    const ownerCount = await prisma.adminUser.count({ where: { isOwner: true } });
    if (ownerCount <= 1) return conflict('cannot_delete_last_owner');
  }

  await prisma.adminUser.delete({ where: { id: params.id } });
  return ok({ deleted: true });
}

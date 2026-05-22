import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok } from '@/lib/api-helpers';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const groups = await prisma.group.findMany({
    where: { tournamentId: params.id },
    orderBy: { displayOrder: 'asc' },
    include: { teams: { orderBy: { name: 'asc' } } },
  });
  return ok(groups);
}

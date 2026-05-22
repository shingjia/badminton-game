import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok } from '@/lib/api-helpers';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const matches = await prisma.match.findMany({
    where: { tournamentId: params.id },
    orderBy: [{ groupId: 'asc' }, { matchOrder: 'asc' }],
    include: {
      teamA: true,
      teamB: true,
      court: true,
      group: true,
    },
  });
  return ok(matches);
}

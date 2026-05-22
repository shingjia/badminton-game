import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateTournament } from '@/lib/schemas';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const t = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!t) return notFound();
  return ok(t);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, UpdateTournament);
  if (!parsed.ok) return parsed.res;

  const t = await prisma.tournament
    .update({ where: { id: params.id }, data: parsed.data })
    .catch(() => null);
  if (!t) return notFound();
  return ok(t);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const t = await prisma.tournament
    .delete({ where: { id: params.id } })
    .catch(() => null);
  if (!t) return notFound();
  return ok({ deleted: true });
}

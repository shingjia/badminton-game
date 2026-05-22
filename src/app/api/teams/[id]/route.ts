import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateTeam } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, UpdateTeam);
  if (!parsed.ok) return parsed.res;

  const t = await prisma.team
    .update({ where: { id: params.id }, data: parsed.data })
    .catch(() => null);
  if (!t) return notFound();
  emitToTournament(t.tournamentId, 'team.updated', { tournamentId: t.tournamentId, team: t });
  return ok(t);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const t = await prisma.team
    .delete({ where: { id: params.id } })
    .catch(() => null);
  if (!t) return notFound();
  emitToTournament(t.tournamentId, 'team.deleted', { tournamentId: t.tournamentId, teamId: t.id });
  return ok({ deleted: true });
}

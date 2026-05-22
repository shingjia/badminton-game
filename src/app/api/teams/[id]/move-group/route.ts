import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { notFound, ok, parseJson, requireAdmin, ensureStatus, conflict } from '@/lib/api-helpers';
import { MoveTeamGroup } from '@/lib/schemas';

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;
  const parsed = await parseJson(req, MoveTeamGroup);
  if (!parsed.ok) return parsed.res;

  const team = await prisma.team.findUnique({ where: { id: params.id } });
  if (!team) return notFound('team_not_found');

  const group = await prisma.group.findUnique({ where: { id: parsed.data.groupId } });
  if (!group || group.tournamentId !== team.tournamentId) {
    return conflict('group_belongs_to_different_tournament');
  }

  const tournament = await prisma.tournament.findUnique({ where: { id: team.tournamentId } });
  if (!tournament) return notFound();
  const statusErr = ensureStatus(tournament.status, ['grouping']);
  if (statusErr) return statusErr;

  const updated = await prisma.team.update({
    where: { id: params.id },
    data: { groupId: parsed.data.groupId },
  });
  return ok(updated);
}

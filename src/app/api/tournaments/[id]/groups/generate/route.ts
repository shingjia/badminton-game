import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { snakeGroup } from '@/lib/algorithms/snake-grouping';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const statusErr = ensureStatus(tournament.status, ['draft', 'grouping']);
  if (statusErr) return statusErr;

  const teams = await prisma.team.findMany({ where: { tournamentId: params.id } });
  if (teams.length < tournament.teamsPerGroup) {
    return conflict('not_enough_teams');
  }

  const grouped = snakeGroup(teams, tournament.teamsPerGroup);

  // letters A, B, C, ... (assumes <= 26 groups; if N > 26*K we'd need rethinking but YAGNI here)
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // Replace any prior groups in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // detach teams from any existing groups
    await tx.team.updateMany({
      where: { tournamentId: params.id },
      data: { groupId: null },
    });
    // delete old groups
    await tx.group.deleteMany({ where: { tournamentId: params.id } });

    const groupRows = [];
    for (let i = 0; i < grouped.length; i++) {
      const g = await tx.group.create({
        data: {
          tournamentId: params.id,
          name: letters[i] ?? `組${i + 1}`,
          displayOrder: i + 1,
        },
      });
      // assign teams to this group
      await tx.team.updateMany({
        where: { id: { in: grouped[i].map((t) => t.id) } },
        data: { groupId: g.id },
      });
      groupRows.push(g);
    }

    await tx.tournament.update({
      where: { id: params.id },
      data: { status: 'grouping' },
    });

    return groupRows;
  });

  return ok({ groups: result });
}

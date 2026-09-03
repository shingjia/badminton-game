import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, parseJson, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { AssignGroups } from '@/lib/schemas';
import { validateGroupingInput, applyGrouping } from '@/lib/grouping';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) return notFound('tournament_not_found');

  const statusErr = ensureStatus(tournament.status, ['draft', 'grouping']);
  if (statusErr) return statusErr;

  const parsed = await parseJson(req, AssignGroups);
  if (!parsed.ok) return parsed.res;

  try {
    validateGroupingInput(parsed.data.groups);
  } catch (e: any) {
    return conflict(e.message);
  }

  // 會內賽：隊伍（組）數必須為偶數（兩兩對戰，場地數 = 隊數/2）。
  if (tournament.format === 'club' && parsed.data.groups.length % 2 !== 0) {
    return conflict('club_odd_group_count');
  }

  // Verify all playerIds belong to this tournament
  const allPlayerIds = parsed.data.groups.flatMap((g) => g.playerIds);
  const found = await prisma.player.findMany({
    where: { id: { in: allPlayerIds }, tournamentId: params.id },
    select: { id: true },
  });
  if (found.length !== allPlayerIds.length) {
    return conflict('player_not_in_tournament');
  }

  const { groups, updatedTournament } = await prisma.$transaction(async (tx) => {
    const created = await applyGrouping(tx, params.id, parsed.data.groups);
    const t = await tx.tournament.update({
      where: { id: params.id },
      data: { status: 'grouping' },
    });
    return { groups: created, updatedTournament: t };
  });

  emitToTournament(params.id, 'groups.generated', { tournamentId: params.id, groups });
  // status 剛從 draft 變 grouping，前端要吃到這個才會解鎖配對按鈕
  // （canEdit 是看 tournament.status），不然要等下次不相干的
  // tournament.updated 事件才會巧合同步到。
  emitToTournament(params.id, 'tournament.updated', {
    tournamentId: params.id,
    tournament: updatedTournament,
  });
  return ok({ groups });
}

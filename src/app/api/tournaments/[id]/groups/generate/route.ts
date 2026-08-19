import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, parseJson, requireAdmin, ensureStatus } from '@/lib/api-helpers';
import { AssignGroups } from '@/lib/schemas';
import { validateGroupingInput, applyGrouping } from '@/lib/grouping';
import { shufflePairs, writePairs } from '@/lib/pairing';
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

  // Verify all playerIds belong to this tournament
  const allPlayerIds = parsed.data.groups.flatMap((g) => g.playerIds);
  const found = await prisma.player.findMany({
    where: { id: { in: allPlayerIds }, tournamentId: params.id },
    select: { id: true },
  });
  if (found.length !== allPlayerIds.length) {
    return conflict('player_not_in_tournament');
  }

  const groups = await prisma.$transaction(async (tx) => {
    const created = await applyGrouping(tx, params.id, parsed.data.groups);
    // 分組同時直接配對，不用再逐組手動按「重抽配對」；要換配對的話
    // 原本每組卡片上的「重抽配對」按鈕還在，可以單獨重抽不影響分組。
    for (let i = 0; i < created.length; i++) {
      const drafts = shufflePairs(parsed.data.groups[i].playerIds);
      await writePairs(tx, params.id, created[i].id, drafts);
    }
    await tx.tournament.update({
      where: { id: params.id },
      data: { status: 'grouping' },
    });
    return created;
  });

  emitToTournament(params.id, 'groups.generated', { tournamentId: params.id, groups });
  return ok({ groups });
}

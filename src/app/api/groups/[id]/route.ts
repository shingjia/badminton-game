import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, parseJson, requireAdmin } from '@/lib/api-helpers';
import { UpdateGroup } from '@/lib/schemas';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const parsed = await parseJson(req, UpdateGroup);
  if (!parsed.ok) return parsed.res;

  const existing = await prisma.group.findUnique({ where: { id: params.id } });
  if (!existing) return notFound();

  // 只要任何循環的賽程已產生，組名就鎖定不得修改。
  const matchCount = await prisma.match.count({
    where: { tournamentId: existing.tournamentId },
  });
  if (matchCount > 0) return conflict('matches_already_generated');

  const group = await prisma.group.update({ where: { id: params.id }, data: parsed.data });

  // ponytail: 重用 groups.generated 事件——admin 與 viewer 都已訂閱它
  // 做整包重抓，改名不值得為此加一個新事件型別。
  emitToTournament(group.tournamentId, 'groups.generated', {
    tournamentId: group.tournamentId,
  });
  return ok(group);
}

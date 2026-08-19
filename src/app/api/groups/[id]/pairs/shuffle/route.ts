import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { conflict, notFound, ok, requireAdmin } from '@/lib/api-helpers';
import { shufflePairs, seedPairs, levelPairs, writePairs, type PairDraft } from '@/lib/pairing';
import { emitToTournament } from '@/lib/socket-server';

type Params = { params: { id: string } };

const METHODS = ['random', 'seed', 'level'] as const;
type Method = (typeof METHODS)[number];

export async function POST(req: NextRequest, { params }: Params) {
  const unauth = requireAdmin(req);
  if (unauth) return unauth;

  const body = await req.json().catch(() => ({}));
  const method: Method = METHODS.includes(body?.method) ? body.method : 'random';

  const group = await prisma.group.findUnique({
    where: { id: params.id },
    include: { players: true },
  });
  if (!group) return notFound('group_not_found');

  // 鎖定不再擋重新配對——調棒次之後要能重跑。真正該擋的是「這組已經
  // 有計分過的比賽」，因為重配對會把舊的 Pair 換掉，連帶把引用它的
  // Match 一起清掉（onDelete: Cascade），計分過的資料不能就這樣消失。
  if (group.pairingLockedAt) {
    const playedCount = await prisma.match.count({
      where: {
        groupId: group.id,
        OR: [{ status: 'completed' }, { scoreA: { gt: 0 } }, { scoreB: { gt: 0 } }],
      },
    });
    if (playedCount > 0) return conflict('group_has_scored_matches');
  }

  let drafts: PairDraft[];
  try {
    if (method === 'seed') {
      drafts = seedPairs(group.players.map((p) => ({ id: p.id, seed: p.seed })));
    } else if (method === 'level') {
      drafts = levelPairs(group.players.map((p) => ({ id: p.id, level: p.level })));
    } else {
      drafts = shufflePairs(group.players.map((p) => p.id));
    }
  } catch (e: any) {
    return conflict(e.message);
  }

  const pairs = await prisma.$transaction(async (tx) => {
    const written = await writePairs(tx, group.tournamentId, group.id, drafts);
    if (group.pairingLockedAt) {
      await tx.group.update({ where: { id: group.id }, data: { pairingLockedAt: null } });
    }
    return written;
  });

  emitToTournament(group.tournamentId, 'pairs.shuffled', {
    tournamentId: group.tournamentId,
    groupId: group.id,
    pairs,
  });

  return ok({ pairs });
}

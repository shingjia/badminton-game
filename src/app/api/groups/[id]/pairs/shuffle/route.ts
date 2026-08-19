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

  if (group.pairingLockedAt) {
    return conflict('pairing_locked');
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

  const pairs = await prisma.$transaction((tx) =>
    writePairs(tx, group.tournamentId, group.id, drafts),
  );

  emitToTournament(group.tournamentId, 'pairs.shuffled', {
    tournamentId: group.tournamentId,
    groupId: group.id,
    pairs,
  });

  return ok({ pairs });
}

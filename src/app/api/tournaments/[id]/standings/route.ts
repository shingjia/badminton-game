import { NextRequest } from 'next/server';
import { ok } from '@/lib/api-helpers';
import { getStandings } from '@/lib/standings-sql';

type Params = { params: { id: string } };

export async function GET(_req: NextRequest, { params }: Params) {
  const rows = await getStandings(params.id);
  // group rows by group_id for client convenience
  const byGroup = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byGroup.get(r.group_id) ?? [];
    arr.push(r);
    byGroup.set(r.group_id, arr);
  }
  const result = [...byGroup.entries()].map(([groupId, standings]) => ({ groupId, standings }));
  return ok(result);
}

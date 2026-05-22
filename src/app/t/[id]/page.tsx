import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/status-badge';
import { ViewerClient } from './viewer-client';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export default async function ViewerPage({ params }: Params) {
  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) notFound();
  return (
    <main className="container mx-auto max-w-5xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-muted-foreground hover:underline">
            ← 返回
          </Link>
          <h1 className="text-2xl font-semibold">{tournament.name}</h1>
          <StatusBadge status={tournament.status} />
        </div>
      </div>
      <ViewerClient tournamentId={tournament.id} initialTournament={tournament} />
    </main>
  );
}

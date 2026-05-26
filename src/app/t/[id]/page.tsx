import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { ViewerClient } from './viewer-client';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export default async function ViewerPage({ params }: Params) {
  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) notFound();
  return (
    <div className="min-h-screen bg-amber-50/40">
      <ViewerClient tournamentId={tournament.id} initialTournament={tournament} />
    </div>
  );
}

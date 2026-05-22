import { prisma } from '@/lib/prisma';
import { TournamentListAdmin } from '@/components/admin/tournament-list-admin';
import { CreateTournamentDialog } from '@/components/admin/create-tournament-dialog';

export const dynamic = 'force-dynamic';

export default async function AdminHomePage() {
  const tournaments = await prisma.tournament.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">管理 — 賽事列表</h1>
        <CreateTournamentDialog />
      </div>
      <TournamentListAdmin tournaments={tournaments} />
    </main>
  );
}

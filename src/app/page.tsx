import { prisma } from '@/lib/prisma';
import { TournamentList } from '@/components/home/tournament-list';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const tournaments = await prisma.tournament.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <h2 className="mb-6 text-2xl font-semibold">賽事列表</h2>
      <TournamentList tournaments={tournaments} />
    </div>
  );
}

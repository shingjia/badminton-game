import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { TournamentList } from '@/components/home/tournament-list';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const tournaments = await prisma.tournament.findMany({ orderBy: { createdAt: 'desc' } });
  return (
    <main className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-semibold">🏸 羽球友誼賽</h1>
        <Link href="/admin">
          <Button variant="outline">主辦登入</Button>
        </Link>
      </div>
      <TournamentList tournaments={tournaments} />
    </main>
  );
}

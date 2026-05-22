import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { prisma } from '@/lib/prisma';
import { StatusBadge } from '@/components/status-badge';
import { WorkspaceClient } from './workspace-client';

export const dynamic = 'force-dynamic';

type Params = { params: { id: string } };

export default async function WorkspacePage({ params }: Params) {
  const tournament = await prisma.tournament.findUnique({ where: { id: params.id } });
  if (!tournament) notFound();
  return (
    <main className="container mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm text-muted-foreground hover:underline">
            ← 賽事列表
          </Link>
          <h1 className="text-2xl font-semibold">{tournament.name}</h1>
          <StatusBadge status={tournament.status} />
        </div>
        <form action="/api/admin/logout" method="POST">
          <Button type="submit" variant="outline" size="sm">
            登出
          </Button>
        </form>
      </div>
      <WorkspaceClient tournamentId={tournament.id} initialTournament={tournament} />
    </main>
  );
}

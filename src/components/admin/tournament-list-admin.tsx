import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import type { Tournament } from '@prisma/client';

export function TournamentListAdmin({ tournaments }: { tournaments: Tournament[] }) {
  if (tournaments.length === 0) {
    return <p className="text-muted-foreground">尚無賽事，請按右上「新增賽事」</p>;
  }
  return (
    <div className="grid gap-3">
      {tournaments.map((t) => (
        <Link key={t.id} href={`/admin/t/${t.id}`}>
          <Card className="transition hover:bg-accent/40">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
              <CardTitle className="text-base">{t.name}</CardTitle>
              <StatusBadge status={t.status} />
            </CardHeader>
            <CardContent className="py-2 text-sm text-muted-foreground">
              {t.groupCount} 組 · {new Date(t.createdAt).toLocaleString('zh-TW')}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

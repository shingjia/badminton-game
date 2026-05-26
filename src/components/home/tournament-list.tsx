import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import type { Tournament } from '@prisma/client';

export function TournamentList({ tournaments }: { tournaments: Tournament[] }) {
  if (tournaments.length === 0) {
    return <p className="text-muted-foreground">目前沒有賽事</p>;
  }
  return (
    <div className="grid gap-4">
      {tournaments.map((t) => (
        <Link key={t.id} href={`/t/${t.id}`}>
          <Card className="transition hover:bg-accent/40">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t.name}</CardTitle>
              <StatusBadge status={t.status} />
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {t.groupCount} 組 · {new Date(t.createdAt).toLocaleDateString('zh-TW')}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
import { statusLabel } from '@/lib/format';
import type { TournamentStatus } from '@prisma/client';

const variantByStatus: Record<TournamentStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'outline',
  grouping: 'secondary',
  in_progress: 'default',
  finished: 'secondary',
};

export function StatusBadge({ status }: { status: TournamentStatus }) {
  return <Badge variant={variantByStatus[status]}>{statusLabel[status]}</Badge>;
}

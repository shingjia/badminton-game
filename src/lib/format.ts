import type { TournamentStatus } from '@prisma/client';

export const statusLabel: Record<TournamentStatus, string> = {
  draft: '草稿',
  grouping: '分組中',
  in_progress: '進行中',
  finished: '已完賽',
};

export const seedLabel = (n: number) => `★`.repeat(n) + `☆`.repeat(Math.max(0, 5 - n));

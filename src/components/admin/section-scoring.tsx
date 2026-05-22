'use client';
import type { Tournament } from '@prisma/client';
export function SectionScoring({ tournament, revision }: { tournament: Tournament; revision: number }) {
  void tournament; void revision;
  return <section id="scoring" className="py-4 text-muted-foreground">5. 計分 — 即將推出</section>;
}

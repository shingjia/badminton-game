'use client';
import type { Tournament } from '@prisma/client';
export function SectionMatches({ tournament, revision }: { tournament: Tournament; revision: number }) {
  void tournament; void revision;
  return <section id="matches" className="py-4 text-muted-foreground">4. 賽程 — 即將推出</section>;
}

'use client';
import type { Tournament } from '@prisma/client';
export function SectionTeams({ tournament, revision }: { tournament: Tournament; revision: number }) {
  void tournament; void revision;
  return <section id="teams" className="py-4 text-muted-foreground">2. 隊伍報名 — 即將推出</section>;
}

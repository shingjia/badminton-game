'use client';
import type { Tournament } from '@prisma/client';
export function SectionGroups({ tournament, revision }: { tournament: Tournament; revision: number }) {
  void tournament; void revision;
  return <section id="groups" className="py-4 text-muted-foreground">3. 分組 — 即將推出</section>;
}

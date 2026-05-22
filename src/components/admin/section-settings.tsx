'use client';
import type { Tournament } from '@prisma/client';
export function SectionSettings({ tournament }: { tournament: Tournament }) {
  void tournament;
  return <section id="settings" className="py-4 text-muted-foreground">1. 賽事設定 — 即將推出</section>;
}

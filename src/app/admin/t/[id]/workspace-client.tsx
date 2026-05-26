'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTournamentSocket } from '@/lib/use-socket';
import { WorkspaceNav } from '@/components/admin/workspace-nav';
import { SectionSettings } from '@/components/admin/section-settings';
import { SectionPlayers } from '@/components/admin/section-players';
import { SectionGroups } from '@/components/admin/section-groups';
import { SectionMatches } from '@/components/admin/section-matches';
import { SectionScoring } from '@/components/admin/section-scoring';
import type { Tournament } from '@prisma/client';

export function WorkspaceClient({
  tournamentId,
  initialTournament,
}: {
  tournamentId: string;
  initialTournament: Tournament;
}) {
  const router = useRouter();
  const [tournament, setTournament] = useState(initialTournament);
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((r) => r + 1);

  useTournamentSocket(tournamentId, {
    'player.added': bump,
    'player.updated': bump,
    'player.deleted': bump,
    'groups.generated': bump,
    'pairs.shuffled': bump,
    'pairing.locked': () => {
      bump();
      router.refresh();
    },
    'match.generated': bump,
    'match.scored': bump,
    'tournament.updated': (payload: { tournament: Tournament }) => {
      setTournament(payload.tournament);
      bump();
    },
  });

  return (
    <div className="space-y-12">
      <WorkspaceNav />
      <SectionSettings tournament={tournament} />
      <SectionPlayers tournament={tournament} revision={revision} />
      <SectionGroups tournament={tournament} revision={revision} />
      <SectionMatches tournament={tournament} revision={revision} />
      <SectionScoring tournament={tournament} revision={revision} />
    </div>
  );
}

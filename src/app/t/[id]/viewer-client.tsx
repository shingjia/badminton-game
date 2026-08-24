'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTournamentSocket } from '@/lib/use-socket';
import { TournamentBanner } from '@/components/viewer/tournament-banner';
import { PlayersTab } from '@/components/viewer/players-tab';
import { GroupsTab } from '@/components/viewer/groups-tab';
import { MatchesTab } from '@/components/viewer/matches-tab';
import { StandingsTab } from '@/components/viewer/standings-tab';
import type { Tournament } from '@prisma/client';

export function ViewerClient({
  tournamentId,
  initialTournament,
}: {
  tournamentId: string;
  initialTournament: Tournament;
}) {
  const [tournament, setTournament] = useState(initialTournament);
  const [revision, setRevision] = useState(0);
  const bump = () => setRevision((r) => r + 1);

  useTournamentSocket(tournamentId, {
    'player.added': bump,
    'player.updated': bump,
    'player.deleted': bump,
    'groups.generated': bump,
    'pairs.shuffled': bump,
    'pairing.locked': bump,
    'match.generated': bump,
    'tournament.updated': (payload: { tournament: Tournament }) => {
      setTournament(payload.tournament);
      bump();
    },
    'match.scored': bump,
  });

  return (
    <>
      <TournamentBanner tournament={tournament} />
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <Tabs defaultValue="players">
          <TabsList>
            <TabsTrigger value="players">報名</TabsTrigger>
            <TabsTrigger value="groups">分組</TabsTrigger>
            <TabsTrigger value="matches">賽程計分</TabsTrigger>
            <TabsTrigger value="standings">排名</TabsTrigger>
          </TabsList>
          <TabsContent value="players">
            <PlayersTab tournamentId={tournamentId} revision={revision} showLevel={tournament.showPlayerLevel} />
          </TabsContent>
          <TabsContent value="groups">
            <GroupsTab
              tournamentId={tournamentId}
              revision={revision}
              format={tournament.format}
              showLevel={tournament.showPlayerLevel}
            />
          </TabsContent>
          <TabsContent value="matches">
            <MatchesTab tournamentId={tournamentId} revision={revision} format={tournament.format} />
          </TabsContent>
          <TabsContent value="standings">
            <StandingsTab tournamentId={tournamentId} revision={revision} format={tournament.format} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

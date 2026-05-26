'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTournamentSocket } from '@/lib/use-socket';
import { PlayersTab } from '@/components/viewer/players-tab';
import { GroupsTab } from '@/components/viewer/groups-tab';
import { PairsTab } from '@/components/viewer/pairs-tab';
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
    'tournament.updated': bump,
    'match.scored': bump,
  });

  return (
    <Tabs defaultValue="standings">
      <TabsList>
        <TabsTrigger value="players">球員名單</TabsTrigger>
        <TabsTrigger value="groups">分組</TabsTrigger>
        <TabsTrigger value="pairs">配對</TabsTrigger>
        <TabsTrigger value="matches">賽程</TabsTrigger>
        <TabsTrigger value="standings">即時排名</TabsTrigger>
      </TabsList>
      <TabsContent value="players">
        <PlayersTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
      <TabsContent value="groups">
        <GroupsTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
      <TabsContent value="pairs">
        <PairsTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
      <TabsContent value="matches">
        <MatchesTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
      <TabsContent value="standings">
        <StandingsTab tournamentId={tournamentId} revision={revision} />
      </TabsContent>
    </Tabs>
  );
}

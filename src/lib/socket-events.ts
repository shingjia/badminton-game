import type { Tournament, Player, Group, Pair, Match } from '@prisma/client';

export type ServerEvent =
  | { type: 'player.added'; tournamentId: string; player: Player }
  | { type: 'player.updated'; tournamentId: string; player: Player }
  | { type: 'player.deleted'; tournamentId: string; playerId: string }
  | { type: 'groups.generated'; tournamentId: string; groups: Group[] }
  | { type: 'pairs.shuffled'; tournamentId: string; groupId: string; pairs: Pair[] }
  | { type: 'pairing.locked'; tournamentId: string; groupId: string }
  | { type: 'match.generated'; tournamentId: string; matches: Match[] }
  | { type: 'match.scored'; tournamentId: string; match: Match }
  | { type: 'tournament.updated'; tournamentId: string; tournament: Tournament }
  | { type: 'tournament.deleted'; tournamentId: string };

import type { Tournament, Team, Group, Match } from '@prisma/client';

export type ServerEvent =
  | { type: 'team.added'; tournamentId: string; team: Team }
  | { type: 'team.updated'; tournamentId: string; team: Team }
  | { type: 'team.deleted'; tournamentId: string; teamId: string }
  | { type: 'groups.generated'; tournamentId: string; groups: Group[] }
  | { type: 'groups.locked'; tournamentId: string }
  | { type: 'match.generated'; tournamentId: string; matches: Match[] }
  | { type: 'match.scored'; tournamentId: string; match: Match }
  | { type: 'tournament.updated'; tournamentId: string; tournament: Tournament }
  | { type: 'tournament.deleted'; tournamentId: string };

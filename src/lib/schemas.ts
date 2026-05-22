import { z } from 'zod';

export const TournamentStatusEnum = z.enum(['draft', 'grouping', 'in_progress', 'finished']);

export const CreateTournament = z.object({
  name: z.string().trim().min(1).max(100),
  teamsPerGroup: z.number().int().min(2).max(16).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
});

export const UpdateTournament = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: TournamentStatusEnum.optional(),
  teamsPerGroup: z.number().int().min(2).max(16).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
});

export const CreateTeam = z.object({
  name: z.string().trim().min(1).max(50),
  player1Name: z.string().trim().min(1).max(50),
  player2Name: z.string().trim().min(1).max(50),
  seedLevel: z.number().int().min(1).max(5),
});

export const UpdateTeam = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  player1Name: z.string().trim().min(1).max(50).optional(),
  player2Name: z.string().trim().min(1).max(50).optional(),
  seedLevel: z.number().int().min(1).max(5).optional(),
});

export const MoveTeamGroup = z.object({
  groupId: z.string().min(1),
});

export const CreateCourt = z.object({
  name: z.string().trim().min(1).max(30),
});

export const UpdateMatchScore = z.object({
  scoreA: z.number().int().min(0).max(30),
  scoreB: z.number().int().min(0).max(30),
});

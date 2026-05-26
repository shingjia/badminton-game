import { z } from 'zod';

export const TournamentStatusEnum = z.enum(['draft', 'grouping', 'in_progress', 'finished']);

export const CreateTournament = z.object({
  name: z.string().trim().min(1).max(100),
  groupCount: z.number().int().min(1).max(26).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
});

export const UpdateTournament = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  status: TournamentStatusEnum.optional(),
  groupCount: z.number().int().min(1).max(26).optional(),
  pointsPerGame: z.number().int().min(11).max(31).optional(),
});

export const CreatePlayer = z.object({
  name: z.string().trim().min(1).max(50),
  level: z.string().trim().min(1).max(10).optional(),
});

export const UpdatePlayer = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  level: z.string().trim().min(1).max(10).optional(),
  groupId: z.string().nullable().optional(),
});

// Used in POST /api/tournaments/:id/groups/generate
// Each entry maps a levelCode label to an ordered list of playerIds
export const AssignGroups = z.object({
  groups: z
    .array(
      z.object({
        levelCode: z.string().trim().min(1).max(10),
        playerIds: z.array(z.string().min(1)).min(2),
      }),
    )
    .min(1),
});

export const CreateCourt = z.object({
  name: z.string().trim().min(1).max(30),
});

export const UpdateMatchScore = z.object({
  scoreA: z.number().int().min(0).max(30),
  scoreB: z.number().int().min(0).max(30),
});

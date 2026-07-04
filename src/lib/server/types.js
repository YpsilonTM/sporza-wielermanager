import { z } from "zod";

export const TeamSchema = z.object({
  id: z.number(),
  jerseyUrl: z.string().optional(),
  name: z.string(),
  shortName: z.string().optional(),
  sanitizedName: z.string().optional()
});

export const CyclistSchema = z.object({
  id: z.number(),
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string().optional(),
  sanitizedFullName: z.string().optional(),
  teamId: z.number().optional(),
  price: z.number(),
  participating: z.boolean().optional(),
  nationality: z.string().optional(),
  popularity: z.number().optional(),
  uciRanking: z.number().optional(),
  dateOfBirth: z.string().optional(),
  riderTypes: z.array(z.string()).optional(),
  totalBasePoints: z.number().optional(),
  sportserviceRefId: z.number().optional(),
  team: TeamSchema.optional()
});

export const MatchSchema = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().optional(),
  sportserviceRefId: z.number().optional(),
  slugName: z.string().optional(),
  distance: z.number().optional(),
  matchNumber: z.number().optional(),
  matchType: z
    .enum(["GENERAL", "ITT", "TTT", "MONUMENT", "NONE_WORLD_TOUR", "WORLD_TOUR"])
    .optional(),
  terrainType: z.enum(["FLAT", "HILLY", "MOUNTAIN"]).optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  deadline: z.string().optional(),
  stageProfileUrl: z.string().optional(),
  stageProfileCoordinatesUrl: z.string().optional(),
  status: z.string().optional(),
  startLocation: z.string().optional(),
  finishLocation: z.string().optional(),
  singleRace: z.boolean().optional()
});

export const GameTeamSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  teamCode: z.string().optional(),
  teamType: z.enum(["INCOMPLETE", "COMPLETED_ONCE", "LOCKED"]).optional()
});

export const RankingSchema = z.object({
  overallScore: z.number().optional(),
  rank: z.number().optional(),
  amountOfPlayers: z.number().optional(),
  matchScores: z.record(z.string(), z.number()).optional()
});

export const GameStatusSchema = z.object({
  user: z
    .object({
      id: z.number().optional(),
      name: z.string().optional(),
      hideName: z.boolean().optional()
    })
    .nullable()
    .optional(),
  gameTeam: GameTeamSchema.nullable().optional(),
  roster: z.array(CyclistSchema).nullable().optional(),
  lastMatch: z
    .object({
      match: MatchSchema.optional(),
      matchScore: z.number().optional()
    })
    .nullable()
    .optional(),
  nextMatch: z
    .object({
      match: MatchSchema.optional()
    })
    .nullable()
    .optional(),
  ranking: RankingSchema.nullable().optional()
});

export const CyclistsResponseSchema = z.object({
  cyclists: z.array(CyclistSchema),
  teams: z.array(TeamSchema),
  budgets: z
    .array(
      z.object({
        price: z.number(),
        label: z.string()
      })
    )
    .optional()
});

export const LineupEntrySchema = z.object({
  id: z.number(),
  lineupType: z.enum(["CAPTAIN", "NORMAL", "SUBSTITUTE"])
});

export const ManagerDecisionSchema = z.object({
  lineup: z.array(
    z.object({
      cyclistId: z.number(),
      lineupType: z.enum(["CAPTAIN", "NORMAL", "SUBSTITUTE"]),
      reasoning: z.string().optional()
    })
  ),
  transfers: z
    .array(
      z.object({
        ridersIn: z.array(z.number()),
        ridersOut: z.array(z.number()),
        reasoning: z.string().optional()
      })
    )
    .optional(),
  confidence: z.enum(["high", "medium", "low"]),
  summary: z.string().optional()
});

export function parseCyclistsResponse(payload) {
  return CyclistsResponseSchema.parse(payload);
}

export function parseGameStatus(payload) {
  return GameStatusSchema.parse(payload);
}

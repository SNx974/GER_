import { z } from "zod";

export const playerStatSchema = z.object({
  playerId: z.string().min(1),
  kills: z.coerce.number().int().min(0).max(200),
  deaths: z.coerce.number().int().min(0).max(200),
  assists: z.coerce.number().int().min(0).max(200),
  score: z.coerce.number().int().min(0).max(100000),
});

export const mapResultSchema = z.object({
  matchMapId: z.string().min(1),
  scoreA: z.coerce.number().int().min(0).max(100),
  scoreB: z.coerce.number().int().min(0).max(100),
  stats: z.array(playerStatSchema),
});

export const submitResultSchema = z.object({
  screenshots: z.array(z.string().url("URL invalide")).max(10),
  maps: z.array(mapResultSchema).min(1),
});

export type PlayerStatValues = z.infer<typeof playerStatSchema>;
export type MapResultValues = z.infer<typeof mapResultSchema>;
export type SubmitResultValues = z.infer<typeof submitResultSchema>;

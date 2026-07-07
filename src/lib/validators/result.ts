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
  // Chemins internes (/api/uploads/xxx) issus de l'upload, ou URL externe.
  screenshots: z.array(z.string().min(1)).max(10),
  maps: z.array(mapResultSchema).min(1),
});

export type PlayerStatValues = z.infer<typeof playerStatSchema>;
export type MapResultValues = z.infer<typeof mapResultSchema>;
export type SubmitResultValues = z.infer<typeof submitResultSchema>;

/** Snapshot brut de la soumission d'une équipe, conservé pour comparaison. */
export type SubmissionSnapshot = {
  submittedAt: string;
  screenshots: string[];
  maps: MapResultValues[];
};

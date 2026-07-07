import type { MatchFormat } from "@prisma/client";

// Système de points du leaderboard
export const POINTS_WIN = 3;
export const POINTS_LOSS = 0;

// Durée estimée d'un match (pour la détection de conflit de planning)
export const MATCH_DURATION_MS = 2 * 60 * 60 * 1000; // 2 h

// Nombre de maps à jouer selon le format (picks + decider)
export const MAPS_TO_PLAY: Record<MatchFormat, number> = {
  BO1: 1,
  BO3: 3,
  BO5: 5,
};

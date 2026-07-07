import { prisma } from "@/lib/prisma";
import { MATCH_DURATION_MS } from "@/lib/constants";

export type ConflictReason = "match" | "unavailable" | null;

/**
 * Détecte un conflit de planning pour un créneau donné.
 * Bloque si l'une des équipes a déjà un match proche (±durée) ou est marquée
 * indisponible sur ce créneau.
 */
export async function findConflict(
  teamIds: string[],
  date: Date
): Promise<ConflictReason> {
  const windowStart = new Date(date.getTime() - MATCH_DURATION_MS);
  const windowEnd = new Date(date.getTime() + MATCH_DURATION_MS);

  const nearbyMatch = await prisma.match.findFirst({
    where: {
      status: { in: ["SCHEDULED", "MAPBAN", "READY"] },
      scheduledAt: { gt: windowStart, lt: windowEnd },
      OR: [{ teamAId: { in: teamIds } }, { teamBId: { in: teamIds } }],
    },
    select: { id: true },
  });
  if (nearbyMatch) return "match";

  const unavailable = await prisma.availability.findFirst({
    where: {
      teamId: { in: teamIds },
      status: "UNAVAILABLE",
      startTime: { lte: date },
      endTime: { gte: date },
    },
    select: { id: true },
  });
  if (unavailable) return "unavailable";

  return null;
}

export function conflictMessage(reason: Exclude<ConflictReason, null>): string {
  return reason === "match"
    ? "Un match est déjà planifié sur ce créneau pour l'une des équipes."
    : "L'une des équipes est marquée indisponible sur ce créneau.";
}

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { POINTS_WIN, POINTS_LOSS } from "@/lib/constants";

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Construit les opérations Prisma qui appliquent (sign=1) ou annulent
 * (sign=-1) l'impact d'un match sur les compteurs dénormalisés : points/V-D
 * des équipes et stats cumulées des joueurs (à partir des PlayerMatchStat
 * déjà enregistrées pour ce match).
 *
 * Utilisé par la validation d'un résultat, sa modification par un admin
 * (annule puis réapplique), et la suppression d'un match déjà validé.
 */
export async function buildMatchImpactOps(
  params: {
    matchId: string;
    teamAId: string;
    teamBId: string;
    winnerId: string | null;
    sign: 1 | -1;
  },
  client: Client = prisma
): Promise<Prisma.PrismaPromise<unknown>[]> {
  const { matchId, teamAId, teamBId, winnerId, sign } = params;

  const agg = await client.playerMatchStat.groupBy({
    by: ["playerId"],
    where: { matchMap: { matchId } },
    _sum: { kills: true, deaths: true, assists: true },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (const row of agg) {
    ops.push(
      client.player.update({
        where: { id: row.playerId },
        data: {
          totalKills: { increment: sign * (row._sum.kills ?? 0) },
          totalDeaths: { increment: sign * (row._sum.deaths ?? 0) },
          totalAssists: { increment: sign * (row._sum.assists ?? 0) },
          matchesPlayed: { increment: sign * 1 },
        },
      })
    );
  }

  if (winnerId) {
    const loserId = winnerId === teamAId ? teamBId : teamAId;
    ops.push(
      client.team.update({
        where: { id: winnerId },
        data: { wins: { increment: sign * 1 }, points: { increment: sign * POINTS_WIN } },
      }),
      client.team.update({
        where: { id: loserId },
        data: { losses: { increment: sign * 1 }, points: { increment: sign * POINTS_LOSS } },
      })
    );
  }

  return ops;
}

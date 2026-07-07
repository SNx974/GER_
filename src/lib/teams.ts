import { prisma } from "@/lib/prisma";

/** Position de l'équipe au classement (1 = meilleure), + nombre total d'équipes. */
export async function getTeamRank(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { points: true },
  });
  if (!team) return { rank: null as number | null, total: 0 };

  const [better, total] = await Promise.all([
    prisma.team.count({ where: { points: { gt: team.points } } }),
    prisma.team.count(),
  ]);

  return { rank: better + 1, total };
}

/** Historique des matchs terminés d'une équipe, avec issue Win/Loss/Draw. */
export async function getTeamMatchHistory(teamId: string, take = 10) {
  const matches = await prisma.match.findMany({
    where: {
      status: "COMPLETED",
      OR: [{ teamAId: teamId }, { teamBId: teamId }],
    },
    include: {
      teamA: { select: { id: true, name: true, tag: true } },
      teamB: { select: { id: true, name: true, tag: true } },
      result: { select: { seriesScoreA: true, seriesScoreB: true } },
    },
    orderBy: { scheduledAt: "desc" },
    take,
  });

  return matches.map((m) => {
    const isTeamA = m.teamAId === teamId;
    const opponent = isTeamA ? m.teamB : m.teamA;

    let outcome: "WIN" | "LOSS" | "DRAW" = "DRAW";
    if (m.winnerId) {
      outcome = m.winnerId === teamId ? "WIN" : "LOSS";
    }

    // Score du point de vue de l'équipe
    const scoreFor = isTeamA ? m.result?.seriesScoreA : m.result?.seriesScoreB;
    const scoreAgainst = isTeamA ? m.result?.seriesScoreB : m.result?.seriesScoreA;

    return {
      matchId: m.id,
      date: m.scheduledAt,
      format: m.format,
      opponent,
      outcome,
      scoreFor: scoreFor ?? null,
      scoreAgainst: scoreAgainst ?? null,
    };
  });
}

"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/session";
import { getCaptainContext } from "@/lib/guards";
import { notify, notifyAdmins } from "@/lib/notifications";
import { analyzeResult, type MapStatInput } from "@/lib/ai";
import { POINTS_WIN, POINTS_LOSS } from "@/lib/constants";
import {
  submitResultSchema,
  type SubmitResultValues,
} from "@/lib/validators/result";
import { ok, fail, type ActionResult } from "@/lib/actions";

// ─── Soumission d'un résultat ───

export async function submitResult(
  token: string,
  values: SubmitResultValues
): Promise<ActionResult> {
  const ctx = await getCaptainContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = submitResultSchema.safeParse(values);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }

  const match = await prisma.match.findUnique({
    where: { roomToken: token },
    include: {
      maps: { select: { id: true } },
      result: { select: { id: true } },
      teamA: {
        select: { id: true, captainId: true, players: { select: { id: true } } },
      },
      teamB: {
        select: { id: true, captainId: true, players: { select: { id: true } } },
      },
    },
  });
  if (!match) return fail("Match introuvable.");

  const isParticipant =
    ctx.teamId === match.teamAId || ctx.teamId === match.teamBId;
  if (!isParticipant) return fail("Vous ne participez pas à ce match.");
  if (match.status !== "READY") {
    return fail("Le résultat ne peut être soumis qu'une fois le mapban terminé.");
  }
  if (match.result) return fail("Un résultat a déjà été soumis pour ce match.");

  // Cohérence des maps et des joueurs
  const validMapIds = new Set(match.maps.map((m) => m.id));
  const validPlayerIds = new Set([
    ...match.teamA.players.map((p) => p.id),
    ...match.teamB.players.map((p) => p.id),
  ]);

  for (const map of parsed.data.maps) {
    if (!validMapIds.has(map.matchMapId)) {
      return fail("Une des maps ne correspond pas à ce match.");
    }
    for (const s of map.stats) {
      if (!validPlayerIds.has(s.playerId)) {
        return fail("Un joueur ne fait pas partie des équipes du match.");
      }
    }
  }

  // Calcul des scores de série (maps gagnées) + issue par map
  let seriesScoreA = 0;
  let seriesScoreB = 0;
  const mapUpdates = parsed.data.maps.map((map) => {
    let winnerId: string | null = null;
    if (map.scoreA > map.scoreB) {
      winnerId = match.teamAId;
      seriesScoreA++;
    } else if (map.scoreB > map.scoreA) {
      winnerId = match.teamBId;
      seriesScoreB++;
    }
    return { ...map, winnerId };
  });

  // Analyse IA (hors transaction : appel externe)
  const aiInput: MapStatInput[] = parsed.data.maps.map((m, i) => ({
    mapName: `Map ${i + 1}`,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    stats: m.stats,
  }));
  const ai = await analyzeResult(parsed.data.screenshots, aiInput);

  const submitterIsA = ctx.teamId === match.teamAId;

  // Écriture atomique : maps + stats + résultat
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const map of mapUpdates) {
    ops.push(
      prisma.matchMap.update({
        where: { id: map.matchMapId },
        data: {
          scoreTeamA: map.scoreA,
          scoreTeamB: map.scoreB,
          winnerId: map.winnerId,
        },
      })
    );
    if (map.stats.length > 0) {
      ops.push(
        prisma.playerMatchStat.createMany({
          data: map.stats.map((s) => ({
            matchMapId: map.matchMapId,
            playerId: s.playerId,
            kills: s.kills,
            deaths: s.deaths,
            assists: s.assists,
            score: s.score,
          })),
        })
      );
    }
  }
  ops.push(
    prisma.matchResult.create({
      data: {
        matchId: match.id,
        submittedByTeamId: ctx.teamId,
        seriesScoreA,
        seriesScoreB,
        screenshots: parsed.data.screenshots,
        aiAnalysis: ai as unknown as Prisma.InputJsonValue,
        aiFlagged: ai.flagged,
        aiSummary: ai.summary,
        status: "PENDING",
        teamAValidated: submitterIsA,
        teamBValidated: !submitterIsA,
      },
    })
  );

  await prisma.$transaction(ops);

  // Notifie l'équipe adverse + les admins
  const opponentCaptainId = submitterIsA
    ? match.teamB.captainId
    : match.teamA.captainId;
  await notify(opponentCaptainId, "RESULT_SUBMITTED", { token });
  await notifyAdmins("RESULT_SUBMITTED", { token, aiFlagged: ai.flagged });

  revalidatePath(`/match/${token}/result`);
  revalidatePath(`/match/${token}`);
  return ok();
}

// ─── Validation / litige ───

export async function validateResult(
  matchId: string,
  approve: boolean
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return fail("Non authentifié");

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      result: true,
      teamA: { select: { id: true, captainId: true } },
      teamB: { select: { id: true, captainId: true } },
    },
  });
  if (!match || !match.result) return fail("Résultat introuvable.");
  if (match.result.status === "VALIDATED") {
    return fail("Ce résultat est déjà validé.");
  }

  const isAdmin = session.user.role === "ADMIN";
  const myTeamId = session.user.teamId;
  const isA = myTeamId === match.teamAId;
  const isB = myTeamId === match.teamBId;
  const isParticipantCaptain =
    session.user.role === "CAPTAIN" && (isA || isB);

  if (!isAdmin && !isParticipantCaptain) {
    return fail("Vous n'êtes pas autorisé à valider ce résultat.");
  }

  // Litige : bascule en DISPUTED et alerte les admins
  if (!approve) {
    await prisma.matchResult.update({
      where: { id: match.result.id },
      data: { status: "DISPUTED" },
    });
    await notifyAdmins("RESULT_SUBMITTED", { matchId, disputed: true });
    revalidatePath(`/match/${match.roomToken}/result`);
    return ok();
  }

  // Un admin valide directement
  if (isAdmin) {
    await finalizeResult(matchId, session.user.id);
    return ok();
  }

  // Un capitaine valide son côté
  const teamAValidated = isA ? true : match.result.teamAValidated;
  const teamBValidated = isB ? true : match.result.teamBValidated;

  // Si l'IA a signalé une anomalie, l'accord des capitaines ne suffit pas :
  // un admin doit obligatoirement trancher (le résultat reste PENDING).
  const bothAgree = teamAValidated && teamBValidated;
  if (bothAgree && !match.result.aiFlagged) {
    await finalizeResult(matchId, null);
  } else {
    await prisma.matchResult.update({
      where: { id: match.result.id },
      data: { teamAValidated, teamBValidated },
    });
    revalidatePath(`/match/${match.roomToken}/result`);
  }
  return ok();
}

/**
 * Rejet d'un résultat par un admin : supprime le résultat et les stats
 * associées, réinitialise les scores des maps, et laisse le match en READY
 * pour permettre une nouvelle soumission.
 */
export async function rejectResult(matchId: string): Promise<ActionResult> {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return fail("Action réservée aux administrateurs.");
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      result: { select: { id: true } },
      maps: { select: { id: true } },
      teamA: { select: { captainId: true } },
      teamB: { select: { captainId: true } },
    },
  });
  if (!match || !match.result) return fail("Résultat introuvable.");
  if (match.status === "COMPLETED") {
    return fail("Un match validé ne peut plus être rejeté.");
  }

  const mapIds = match.maps.map((m) => m.id);

  await prisma.$transaction([
    prisma.playerMatchStat.deleteMany({
      where: { matchMapId: { in: mapIds } },
    }),
    prisma.matchMap.updateMany({
      where: { id: { in: mapIds } },
      data: { scoreTeamA: null, scoreTeamB: null, winnerId: null },
    }),
    prisma.matchResult.delete({ where: { id: match.result.id } }),
  ]);

  await notify(match.teamA.captainId, "RESULT_SUBMITTED", { matchId, rejected: true });
  await notify(match.teamB.captainId, "RESULT_SUBMITTED", { matchId, rejected: true });

  revalidatePath(`/match/${match.roomToken}/result`);
  revalidatePath("/admin/results");
  return ok();
}

/**
 * Finalise un résultat : statut VALIDATED, match COMPLETED, mise à jour des
 * compteurs dénormalisés (points/V/D des équipes, totaux des joueurs).
 */
async function finalizeResult(
  matchId: string,
  validatedById: string | null
): Promise<void> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      result: true,
      teamA: { select: { id: true, captainId: true } },
      teamB: { select: { id: true, captainId: true } },
    },
  });
  if (!match || !match.result) return;

  const { seriesScoreA, seriesScoreB } = match.result;
  let winnerId: string | null = null;
  let loserId: string | null = null;
  if (seriesScoreA > seriesScoreB) {
    winnerId = match.teamAId;
    loserId = match.teamBId;
  } else if (seriesScoreB > seriesScoreA) {
    winnerId = match.teamBId;
    loserId = match.teamAId;
  }

  // Agrégation des stats joueurs sur ce match
  const agg = await prisma.playerMatchStat.groupBy({
    by: ["playerId"],
    where: { matchMap: { matchId } },
    _sum: { kills: true, deaths: true, assists: true },
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.matchResult.update({
      where: { id: match.result.id },
      data: {
        status: "VALIDATED",
        validatedAt: new Date(),
        validatedById,
        teamAValidated: true,
        teamBValidated: true,
      },
    }),
    prisma.match.update({
      where: { id: matchId },
      data: { status: "COMPLETED", winnerId },
    }),
  ];

  if (winnerId && loserId) {
    ops.push(
      prisma.team.update({
        where: { id: winnerId },
        data: { wins: { increment: 1 }, points: { increment: POINTS_WIN } },
      }),
      prisma.team.update({
        where: { id: loserId },
        data: { losses: { increment: 1 }, points: { increment: POINTS_LOSS } },
      })
    );
  }

  for (const row of agg) {
    ops.push(
      prisma.player.update({
        where: { id: row.playerId },
        data: {
          totalKills: { increment: row._sum.kills ?? 0 },
          totalDeaths: { increment: row._sum.deaths ?? 0 },
          totalAssists: { increment: row._sum.assists ?? 0 },
          matchesPlayed: { increment: 1 },
        },
      })
    );
  }

  await prisma.$transaction(ops);

  await notify(match.teamA.captainId, "RESULT_VALIDATED", { matchId });
  await notify(match.teamB.captainId, "RESULT_VALIDATED", { matchId });

  revalidatePath(`/match/${match.roomToken}/result`);
  revalidatePath("/leaderboard");
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/session";
import { getCaptainContext, getAdminContext } from "@/lib/guards";
import { notify, notifyAdmins } from "@/lib/notifications";
import { analyzeResult, type MapStatInput } from "@/lib/ai";
import { buildMatchImpactOps } from "@/lib/leaderboard-adjust";
import {
  submitResultSchema,
  mapResultSchema,
  type SubmitResultValues,
  type MapResultValues,
  type SubmissionSnapshot,
} from "@/lib/validators/result";
import { ok, fail, type ActionResult } from "@/lib/actions";

// ─── Soumission d'un résultat (chaque équipe peut soumettre la sienne) ───

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
      result: true,
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

  const isTeamA = ctx.teamId === match.teamAId;
  const alreadySubmitted = match.result
    ? isTeamA
      ? match.result.teamASubmission
      : match.result.teamBSubmission
    : null;
  if (alreadySubmitted) {
    return fail(
      "Votre équipe a déjà soumis un résultat pour ce match. Un administrateur peut le modifier si besoin."
    );
  }

  // Cohérence des maps ; les stats ne peuvent porter que sur les joueurs de
  // SA PROPRE équipe (chaque équipe ne rapporte que ses propres statistiques,
  // jamais celles de l'adversaire).
  const validMapIds = new Set(match.maps.map((m) => m.id));
  const myTeam = isTeamA ? match.teamA : match.teamB;
  const myPlayerIds = new Set(myTeam.players.map((p) => p.id));

  for (const map of parsed.data.maps) {
    if (!validMapIds.has(map.matchMapId)) {
      return fail("Une des maps ne correspond pas à ce match.");
    }
    for (const s of map.stats) {
      if (!myPlayerIds.has(s.playerId)) {
        return fail("Vous ne pouvez saisir que les statistiques de vos propres joueurs.");
      }
    }
  }

  // Analyse IA sur cette soumission (désactivée par défaut — voir isResultAnalysisEnabled)
  const aiInput: MapStatInput[] = parsed.data.maps.map((m, i) => ({
    mapName: `Map ${i + 1}`,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    stats: m.stats,
  }));
  const ai = await analyzeResult(parsed.data.screenshots, aiInput);

  const snapshot: SubmissionSnapshot = {
    submittedAt: new Date().toISOString(),
    screenshots: parsed.data.screenshots,
    maps: parsed.data.maps,
  };

  // Stats des joueurs de CETTE équipe pour chaque map — jamais de conflit
  // possible avec l'autre soumission puisque chaque équipe ne possède que
  // ses propres joueurs (contrainte unique matchMapId+playerId toujours
  // respectée, que ce soit la 1ère ou la 2e équipe à soumettre).
  const statOps: Prisma.PrismaPromise<unknown>[] = parsed.data.maps
    .filter((m) => m.stats.length > 0)
    .map((m) =>
      prisma.playerMatchStat.createMany({
        data: m.stats.map((s) => ({
          matchMapId: m.matchMapId,
          playerId: s.playerId,
          kills: s.kills,
          deaths: s.deaths,
          assists: s.assists,
          score: s.score,
        })),
      })
    );

  if (!match.result) {
    // Première soumission pour ce match : fixe les scores provisoires des
    // maps (comparés à la soumission de l'autre équipe le cas échéant).
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

    const ops: Prisma.PrismaPromise<unknown>[] = mapUpdates.map((map) =>
      prisma.matchMap.update({
        where: { id: map.matchMapId },
        data: {
          scoreTeamA: map.scoreA,
          scoreTeamB: map.scoreB,
          winnerId: map.winnerId,
        },
      })
    );
    ops.push(...statOps);
    ops.push(
      prisma.matchResult.create({
        data: {
          matchId: match.id,
          submittedByTeamId: ctx.teamId,
          seriesScoreA,
          seriesScoreB,
          screenshots: parsed.data.screenshots,
          teamASubmission: isTeamA
            ? (snapshot as unknown as Prisma.InputJsonValue)
            : undefined,
          teamBSubmission: !isTeamA
            ? (snapshot as unknown as Prisma.InputJsonValue)
            : undefined,
          aiAnalysis: ai as unknown as Prisma.InputJsonValue,
          aiFlagged: ai.flagged,
          aiSummary: ai.summary,
          status: "PENDING",
          teamAValidated: isTeamA,
          teamBValidated: !isTeamA,
        },
      })
    );

    await prisma.$transaction(ops);

    const opponentCaptainId = isTeamA
      ? match.teamB.captainId
      : match.teamA.captainId;
    await notify(opponentCaptainId, "RESULT_SUBMITTED", { token });
    await notifyAdmins("RESULT_SUBMITTED", { token, aiFlagged: ai.flagged });
  } else {
    // Deuxième soumission (l'autre équipe) : ajoute les stats de SES joueurs
    // (absentes jusqu'ici) et compare le score de map rapporté à celui déjà
    // enregistré — s'ils divergent, l'admin devra trancher.
    const currentMaps = await prisma.matchMap.findMany({
      where: { matchId: match.id },
      select: { id: true, scoreTeamA: true, scoreTeamB: true },
    });
    const differs = parsed.data.maps.some((m) => {
      const current = currentMaps.find((c) => c.id === m.matchMapId);
      return !current || current.scoreTeamA !== m.scoreA || current.scoreTeamB !== m.scoreB;
    });

    const alreadyValidated = match.result.status === "VALIDATED";

    const ops: Prisma.PrismaPromise<unknown>[] = [...statOps];
    ops.push(
      prisma.matchResult.update({
        where: { id: match.result.id },
        data: {
          [isTeamA ? "teamASubmission" : "teamBSubmission"]:
            snapshot as unknown as Prisma.InputJsonValue,
          screenshots: Array.from(
            new Set([...match.result.screenshots, ...parsed.data.screenshots])
          ).slice(0, 20),
          status: differs && !alreadyValidated ? "DISPUTED" : match.result.status,
        },
      })
    );

    await prisma.$transaction(ops);

    await notifyAdmins("RESULT_SUBMITTED", {
      token,
      secondSubmission: true,
      differs,
    });
  }

  revalidatePath(`/match/${token}/result`);
  revalidatePath(`/match/${token}`);
  revalidatePath("/admin/results");
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

  const isAdmin = session.user.role === "ADMIN";
  const myTeamId = session.user.teamId;
  const isA = myTeamId === match.teamAId;
  const isB = myTeamId === match.teamBId;
  const isParticipantCaptain =
    session.user.role === "CAPTAIN" && (isA || isB);

  if (!isAdmin && !isParticipantCaptain) {
    return fail("Vous n'êtes pas autorisé à valider ce résultat.");
  }
  // Un résultat déjà validé ne peut plus être re-validé ici, y compris par
  // un admin (sinon l'impact sur le classement serait appliqué deux fois) :
  // pour corriger un résultat déjà validé, l'admin doit utiliser
  // « Modifier » (adminUpdateResult), qui annule puis réapplique l'impact.
  if (match.result.status === "VALIDATED") {
    return fail(
      isAdmin
        ? "Ce résultat est déjà validé. Utilisez « Modifier » pour corriger les stats si nécessaire."
        : "Ce résultat est déjà validé."
    );
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

  // Un admin valide directement : c'est toujours l'admin qui a le dernier mot.
  if (isAdmin) {
    await finalizeResult(matchId, session.user.id);
    return ok();
  }

  // Un capitaine valide son côté
  const teamAValidated = isA ? true : match.result.teamAValidated;
  const teamBValidated = isB ? true : match.result.teamBValidated;

  // L'accord des deux capitaines ne suffit pas si l'IA a signalé une
  // anomalie OU si les deux équipes ont soumis des versions divergentes :
  // un admin doit alors obligatoirement trancher (le résultat reste PENDING).
  const bothAgree = teamAValidated && teamBValidated;
  const canAutoFinalize =
    bothAgree && !match.result.aiFlagged && match.result.status !== "DISPUTED";

  if (canAutoFinalize) {
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
 * pour permettre une nouvelle soumission des deux équipes.
 */
export async function rejectResult(matchId: string): Promise<ActionResult> {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return fail("Action réservée aux administrateurs.");
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      result: { select: { id: true, status: true } },
      maps: { select: { id: true } },
      teamA: { select: { captainId: true } },
      teamB: { select: { captainId: true } },
    },
  });
  if (!match || !match.result) return fail("Résultat introuvable.");

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  // Si le résultat était déjà validé, on annule d'abord son impact sur le
  // classement avant de tout supprimer (admin a le dernier mot, y compris
  // pour revenir sur une validation antérieure).
  if (match.status === "COMPLETED" && match.result.status === "VALIDATED") {
    const reverseOps = await buildMatchImpactOps({
      matchId: match.id,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      winnerId: match.winnerId,
      sign: -1,
    });
    ops.push(...reverseOps);
    ops.push(
      prisma.match.update({
        where: { id: match.id },
        data: { status: "READY", winnerId: null },
      })
    );
  }

  const mapIds = match.maps.map((m) => m.id);
  ops.push(
    prisma.playerMatchStat.deleteMany({ where: { matchMapId: { in: mapIds } } }),
    prisma.matchMap.updateMany({
      where: { id: { in: mapIds } },
      data: { scoreTeamA: null, scoreTeamB: null, winnerId: null },
    }),
    prisma.matchResult.delete({ where: { id: match.result.id } })
  );

  await prisma.$transaction(ops);

  await notify(match.teamA.captainId, "RESULT_SUBMITTED", { matchId, rejected: true });
  await notify(match.teamB.captainId, "RESULT_SUBMITTED", { matchId, rejected: true });

  revalidatePath(`/match/${match.roomToken}/result`);
  revalidatePath("/admin/results");
  revalidatePath("/admin/matches");
  revalidatePath("/leaderboard");
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
  if (seriesScoreA > seriesScoreB) winnerId = match.teamAId;
  else if (seriesScoreB > seriesScoreA) winnerId = match.teamBId;

  const impactOps = await buildMatchImpactOps({
    matchId,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    winnerId,
    sign: 1,
  });

  await prisma.$transaction([
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
    ...impactOps,
  ]);

  await notify(match.teamA.captainId, "RESULT_VALIDATED", { matchId });
  await notify(match.teamB.captainId, "RESULT_VALIDATED", { matchId });

  revalidatePath(`/match/${match.roomToken}/result`);
  revalidatePath("/leaderboard");
}

// ─── Modification manuelle par un admin (dernier mot) ───

const adminEditSchema = z.array(mapResultSchema).min(1);

/**
 * Permet à un admin de corriger directement les scores/stats officiels
 * d'un résultat, y compris s'il est déjà validé (auquel cas son impact sur
 * le classement est annulé puis réappliqué avec les nouvelles valeurs).
 */
export async function adminUpdateResult(
  matchId: string,
  maps: MapResultValues[]
): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = adminEditSchema.safeParse(maps);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { result: true, maps: { select: { id: true } } },
  });
  if (!match || !match.result) return fail("Résultat introuvable.");

  const validMapIds = new Set(match.maps.map((m) => m.id));
  for (const map of parsed.data) {
    if (!validMapIds.has(map.matchMapId)) {
      return fail("Une des maps ne correspond pas à ce match.");
    }
  }

  const wasValidated = match.result.status === "VALIDATED";

  await prisma.$transaction(async (tx) => {
    if (wasValidated) {
      const reverseOps = await buildMatchImpactOps(
        {
          matchId,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          winnerId: match.winnerId,
          sign: -1,
        },
        tx
      );
      for (const op of reverseOps) await op;
    }

    let seriesScoreA = 0;
    let seriesScoreB = 0;
    for (const map of parsed.data) {
      let mapWinnerId: string | null = null;
      if (map.scoreA > map.scoreB) {
        mapWinnerId = match.teamAId;
        seriesScoreA++;
      } else if (map.scoreB > map.scoreA) {
        mapWinnerId = match.teamBId;
        seriesScoreB++;
      }

      await tx.matchMap.update({
        where: { id: map.matchMapId },
        data: { scoreTeamA: map.scoreA, scoreTeamB: map.scoreB, winnerId: mapWinnerId },
      });
      await tx.playerMatchStat.deleteMany({ where: { matchMapId: map.matchMapId } });
      if (map.stats.length > 0) {
        await tx.playerMatchStat.createMany({
          data: map.stats.map((s) => ({
            matchMapId: map.matchMapId,
            playerId: s.playerId,
            kills: s.kills,
            deaths: s.deaths,
            assists: s.assists,
            score: s.score,
          })),
        });
      }
    }

    let newWinnerId: string | null = null;
    if (seriesScoreA > seriesScoreB) newWinnerId = match.teamAId;
    else if (seriesScoreB > seriesScoreA) newWinnerId = match.teamBId;

    await tx.matchResult.update({
      where: { id: match.result!.id },
      data: { seriesScoreA, seriesScoreB, editedByAdmin: true },
    });

    if (wasValidated) {
      await tx.match.update({ where: { id: matchId }, data: { winnerId: newWinnerId } });
      const forwardOps = await buildMatchImpactOps(
        {
          matchId,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          winnerId: newWinnerId,
          sign: 1,
        },
        tx
      );
      for (const op of forwardOps) await op;
    }
  });

  revalidatePath(`/match/${match.roomToken}/result`);
  revalidatePath("/admin/results");
  revalidatePath(`/admin/results/${matchId}`);
  revalidatePath("/admin/matches");
  revalidatePath("/leaderboard");
  return ok();
}

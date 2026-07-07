"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/session";
import { buildVetoSequence } from "@/lib/mapban";
import {
  getRoomState,
  startMapbanIfDue,
  finalizeMapban,
  type RoomState,
} from "@/lib/match-room";
import { publishMatchEvent } from "@/lib/realtime";
import { ok, fail, type ActionResult } from "@/lib/actions";

/** Joue un tour de veto (BAN ou PICK) sur une map. */
export async function performStep(
  token: string,
  mapId: string
): Promise<ActionResult<RoomState>> {
  const session = await auth();
  if (!session?.user) return fail("Non authentifié");

  // S'assure que le mapban est ouvert si l'heure est atteinte
  await startMapbanIfDue(token);

  const match = await prisma.match.findUnique({
    where: { roomToken: token },
    include: {
      mapbanActions: { orderBy: { order: "asc" }, select: { mapId: true } },
    },
  });
  if (!match) return fail("Match introuvable");
  if (match.status !== "MAPBAN") {
    return fail("Le mapban n'est pas en cours.");
  }

  // Le joueur doit être capitaine de l'une des deux équipes
  const myTeamId = session.user.teamId;
  const isTeamA = myTeamId === match.teamAId;
  const isTeamB = myTeamId === match.teamBId;
  if (session.user.role !== "CAPTAIN" || (!isTeamA && !isTeamB)) {
    return fail("Seuls les capitaines des deux équipes peuvent agir.");
  }
  const myLetter: "A" | "B" = isTeamA ? "A" : "B";

  // Détermine l'étape courante
  const pool = await prisma.gameMap.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  const universe = new Set(pool.map((m) => m.id));
  for (const a of match.mapbanActions) universe.add(a.mapId);

  const sequence = buildVetoSequence(match.format, universe.size);
  const stepIndex = match.mapbanActions.length;
  const step = sequence[stepIndex];
  if (!step) return fail("Le mapban est déjà terminé.");

  if (step.team !== myLetter) {
    return fail("Ce n'est pas votre tour.");
  }

  // La map doit exister et ne pas déjà être bannie/pickée
  if (!universe.has(mapId)) return fail("Map invalide.");
  if (match.mapbanActions.some((a) => a.mapId === mapId)) {
    return fail("Cette map a déjà été jouée.");
  }

  // Prochaine équipe (ou null si c'était la dernière étape)
  const nextStep = sequence[stepIndex + 1];
  const nextTeamId = nextStep
    ? nextStep.team === "A"
      ? match.teamAId
      : match.teamBId
    : null;

  try {
    await prisma.$transaction([
      prisma.mapbanAction.create({
        data: {
          matchId: match.id,
          teamId: myTeamId!,
          mapId,
          action: step.action,
          order: stepIndex + 1,
        },
      }),
      prisma.match.update({
        where: { id: match.id },
        data: { currentTurnTeamId: nextTeamId },
      }),
    ]);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Course entre deux clics : on renvoie l'état à jour
      const state = await getRoomState(token);
      return state ? ok(state) : fail("Conflit, réessayez.");
    }
    throw e;
  }

  // Dernière étape ? → on finalise (création des MatchMap + statut READY)
  if (!nextStep) {
    await finalizeMapban(token);
  } else {
    const state = await getRoomState(token);
    if (state) publishMatchEvent(match.id, state);
  }

  revalidatePath(`/match/${token}`);
  const state = await getRoomState(token);
  return state ? ok(state) : fail("Erreur d'état.");
}

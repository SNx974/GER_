"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/session";
import { getMaxPlayersPerTeam, getRosterLocked } from "@/lib/settings";
import { playerSchema, type PlayerInput } from "@/lib/validators/player";
import { ok, fail, type ActionResult } from "@/lib/actions";

/** Vérifie que l'utilisateur est un capitaine et renvoie l'id de son équipe. */
async function requireCaptainTeam(): Promise<
  { ok: true; teamId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };
  if (session.user.role !== "CAPTAIN" || !session.user.teamId) {
    return { ok: false, error: "Action réservée aux capitaines d'équipe" };
  }
  return { ok: true, teamId: session.user.teamId };
}

function normalize(input: PlayerInput) {
  return {
    pseudo: input.pseudo.trim(),
    gameId: input.gameId?.trim() || null,
    role: input.role?.trim() || null,
  };
}

export async function addPlayer(input: PlayerInput): Promise<ActionResult> {
  const ctx = await requireCaptainTeam();
  if (!ctx.ok) return fail(ctx.error);

  if (await getRosterLocked()) {
    return fail("Les effectifs sont verrouillés par l'administration.");
  }

  const parsed = playerSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }

  // Application de la limite de joueurs (réglage global)
  const [max, count] = await Promise.all([
    getMaxPlayersPerTeam(),
    prisma.player.count({ where: { teamId: ctx.teamId } }),
  ]);
  if (count >= max) {
    return fail(`Limite atteinte : ${max} joueurs maximum par équipe.`);
  }

  const data = normalize(parsed.data);
  try {
    await prisma.player.create({ data: { teamId: ctx.teamId, ...data } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("Un joueur avec ce pseudo existe déjà dans l'équipe.");
    }
    throw e;
  }

  revalidatePath("/team");
  return ok();
}

export async function updatePlayer(
  playerId: string,
  input: PlayerInput
): Promise<ActionResult> {
  const ctx = await requireCaptainTeam();
  if (!ctx.ok) return fail(ctx.error);

  if (await getRosterLocked()) {
    return fail("Les effectifs sont verrouillés par l'administration.");
  }

  const parsed = playerSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }

  // On ne met à jour que si le joueur appartient bien à l'équipe du capitaine
  const player = await prisma.player.findFirst({
    where: { id: playerId, teamId: ctx.teamId },
    select: { id: true },
  });
  if (!player) return fail("Joueur introuvable dans votre équipe.");

  const data = normalize(parsed.data);
  try {
    await prisma.player.update({ where: { id: playerId }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("Un joueur avec ce pseudo existe déjà dans l'équipe.");
    }
    throw e;
  }

  revalidatePath("/team");
  return ok();
}

export async function deletePlayer(playerId: string): Promise<ActionResult> {
  const ctx = await requireCaptainTeam();
  if (!ctx.ok) return fail(ctx.error);

  if (await getRosterLocked()) {
    return fail("Les effectifs sont verrouillés par l'administration.");
  }

  const result = await prisma.player.deleteMany({
    where: { id: playerId, teamId: ctx.teamId },
  });
  if (result.count === 0) return fail("Joueur introuvable dans votre équipe.");

  revalidatePath("/team");
  return ok();
}

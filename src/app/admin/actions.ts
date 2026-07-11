"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/session";
import { getAdminContext } from "@/lib/guards";
import { createAdminSchema, type CreateAdminInput } from "@/lib/validators/auth";
import { mapSchema, type MapInput } from "@/lib/validators/map";
import { playerSchema, type PlayerInput } from "@/lib/validators/player";
import { buildMatchImpactOps } from "@/lib/leaderboard-adjust";
import { getMaxPlayersPerTeam } from "@/lib/settings";
import { ok, fail, type ActionResult } from "@/lib/actions";

export async function updateMaxPlayers(value: number): Promise<ActionResult> {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return fail("Action réservée aux administrateurs");
  }

  if (!Number.isInteger(value) || value < 1 || value > 50) {
    return fail("La limite doit être un entier entre 1 et 50.");
  }

  await prisma.globalSetting.upsert({
    where: { id: "global" },
    update: { maxPlayersPerTeam: value },
    create: { id: "global", maxPlayersPerTeam: value },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/team");
  return ok();
}

export async function updateMinPlayers(value: number): Promise<ActionResult> {
  const session = await auth();
  if (session?.user.role !== "ADMIN") {
    return fail("Action réservée aux administrateurs");
  }

  if (!Number.isInteger(value) || value < 1 || value > 20) {
    return fail("Le minimum doit être un entier entre 1 et 20.");
  }

  await prisma.globalSetting.upsert({
    where: { id: "global" },
    update: { minPlayersToPlay: value },
    create: { id: "global", minPlayersToPlay: value },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/planning");
  return ok();
}

export async function updateRosterLocked(value: boolean): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  await prisma.globalSetting.upsert({
    where: { id: "global" },
    update: { rosterLocked: value },
    create: { id: "global", rosterLocked: value },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/rosters");
  revalidatePath("/team");
  return ok();
}

/** Création d'un nouveau compte administrateur par un admin existant. */
export async function createAdmin(
  input: CreateAdminInput
): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = createAdminSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }

  const { email, name, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: Role.ADMIN,
        createdById: ctx.userId,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("Cet email est déjà utilisé.");
    }
    throw e;
  }

  revalidatePath("/admin/settings");
  return ok();
}

// ─── Gestion du pool de maps ───

export async function addMap(input: MapInput): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = mapSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }

  try {
    await prisma.gameMap.create({
      data: {
        name: parsed.data.name.trim(),
        imageUrl: parsed.data.imageUrl?.trim() || null,
        isActive: true,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("Une map porte déjà ce nom.");
    }
    throw e;
  }

  revalidatePath("/admin/maps");
  return ok();
}

export async function setMapActive(
  mapId: string,
  isActive: boolean
): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  await prisma.gameMap.update({
    where: { id: mapId },
    data: { isActive },
  });

  revalidatePath("/admin/maps");
  return ok();
}

export async function deleteMap(mapId: string): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  // Une map déjà utilisée dans un veto/match ne peut pas être supprimée
  const used = await prisma.mapbanAction.count({ where: { mapId } });
  const played = await prisma.matchMap.count({ where: { mapId } });
  if (used > 0 || played > 0) {
    return fail(
      "Cette map est utilisée dans des matchs : désactivez-la plutôt que de la supprimer."
    );
  }

  await prisma.gameMap.delete({ where: { id: mapId } });

  revalidatePath("/admin/maps");
  return ok();
}

// ─── Gestion de tous les matchs (vue admin) ───

export async function cancelMatch(matchId: string): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: { status: true },
  });
  if (!match) return fail("Match introuvable.");
  if (match.status === "COMPLETED") {
    return fail("Un match terminé ne peut pas être annulé (supprimez-le si nécessaire).");
  }

  await prisma.match.update({
    where: { id: matchId },
    data: { status: "CANCELLED", currentTurnTeamId: null },
  });

  revalidatePath("/admin/matches");
  revalidatePath("/matches");
  return ok();
}

/**
 * Suppression définitive d'un match. Si le match était validé (COMPLETED),
 * on annule d'abord son impact sur les compteurs dénormalisés (points/V/D
 * des équipes, stats cumulées des joueurs) avant de supprimer la ligne —
 * la suppression cascade sur mapban/maps/résultat/stats détaillées.
 */
export async function deleteMatch(matchId: string): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      result: { select: { status: true } },
    },
  });
  if (!match) return fail("Match introuvable.");

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  if (match.status === "COMPLETED" && match.result?.status === "VALIDATED") {
    const reverseOps = await buildMatchImpactOps({
      matchId: match.id,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      winnerId: match.winnerId,
      sign: -1,
    });
    ops.push(...reverseOps);
  }

  ops.push(prisma.match.delete({ where: { id: matchId } }));

  await prisma.$transaction(ops);

  revalidatePath("/admin/matches");
  revalidatePath("/admin/results");
  revalidatePath("/matches");
  revalidatePath("/leaderboard");
  return ok();
}

// ─── Gestion des effectifs par l'admin (bypass le verrou et la propriété) ───

function normalizePlayer(input: PlayerInput) {
  return {
    pseudo: input.pseudo.trim(),
    gameId: input.gameId?.trim() || null,
    role: input.role?.trim() || null,
  };
}

export async function adminAddPlayer(
  teamId: string,
  input: PlayerInput
): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = playerSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }

  const [max, count] = await Promise.all([
    getMaxPlayersPerTeam(),
    prisma.player.count({ where: { teamId } }),
  ]);
  if (count >= max) {
    return fail(`Limite atteinte : ${max} joueurs maximum par équipe.`);
  }

  try {
    await prisma.player.create({ data: { teamId, ...normalizePlayer(parsed.data) } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return fail("Un joueur avec ce pseudo existe déjà dans l'équipe.");
    }
    throw e;
  }

  revalidatePath("/admin/rosters");
  revalidatePath("/team");
  return ok();
}

export async function adminUpdatePlayer(
  playerId: string,
  input: PlayerInput
): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = playerSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }

  try {
    await prisma.player.update({
      where: { id: playerId },
      data: normalizePlayer(parsed.data),
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return fail("Un joueur avec ce pseudo existe déjà dans l'équipe.");
      if (e.code === "P2025") return fail("Joueur introuvable.");
    }
    throw e;
  }

  revalidatePath("/admin/rosters");
  revalidatePath("/team");
  return ok();
}

export async function adminDeletePlayer(playerId: string): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const result = await prisma.player.deleteMany({ where: { id: playerId } });
  if (result.count === 0) return fail("Joueur introuvable.");

  revalidatePath("/admin/rosters");
  revalidatePath("/team");
  return ok();
}

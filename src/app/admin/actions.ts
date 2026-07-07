"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/session";
import { getAdminContext } from "@/lib/guards";
import { createAdminSchema, type CreateAdminInput } from "@/lib/validators/auth";
import { mapSchema, type MapInput } from "@/lib/validators/map";
import { POINTS_WIN, POINTS_LOSS } from "@/lib/constants";
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
    const agg = await prisma.playerMatchStat.groupBy({
      by: ["playerId"],
      where: { matchMap: { matchId } },
      _sum: { kills: true, deaths: true, assists: true },
    });
    for (const row of agg) {
      ops.push(
        prisma.player.update({
          where: { id: row.playerId },
          data: {
            totalKills: { decrement: row._sum.kills ?? 0 },
            totalDeaths: { decrement: row._sum.deaths ?? 0 },
            totalAssists: { decrement: row._sum.assists ?? 0 },
            matchesPlayed: { decrement: 1 },
          },
        })
      );
    }
    if (match.winnerId) {
      const loserId =
        match.winnerId === match.teamAId ? match.teamBId : match.teamAId;
      ops.push(
        prisma.team.update({
          where: { id: match.winnerId },
          data: { wins: { decrement: 1 }, points: { decrement: POINTS_WIN } },
        }),
        prisma.team.update({
          where: { id: loserId },
          data: { losses: { decrement: 1 }, points: { decrement: POINTS_LOSS } },
        })
      );
    }
  }

  ops.push(prisma.match.delete({ where: { id: matchId } }));

  await prisma.$transaction(ops);

  revalidatePath("/admin/matches");
  revalidatePath("/admin/results");
  revalidatePath("/matches");
  revalidatePath("/leaderboard");
  return ok();
}

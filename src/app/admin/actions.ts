"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/session";
import { getAdminContext } from "@/lib/guards";
import { createAdminSchema, type CreateAdminInput } from "@/lib/validators/auth";
import { mapSchema, type MapInput } from "@/lib/validators/map";
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

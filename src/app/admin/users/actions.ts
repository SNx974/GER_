"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAdminContext } from "@/lib/guards";
import { sendPasswordResetEmail } from "@/lib/email";
import { ok, fail, type ActionResult } from "@/lib/actions";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 heure

/**
 * Supprime un compte utilisateur. Un capitaine ne peut être supprimé que si
 * son équipe n'a aucun match enregistré (Match.teamAId/teamBId n'ont pas de
 * cascade — la suppression échouerait sinon) ; un admin ne peut supprimer ni
 * son propre compte, ni le dernier admin restant.
 */
export async function deleteUser(userId: string): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  if (userId === ctx.userId) {
    return fail("Vous ne pouvez pas supprimer votre propre compte.");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      team: { select: { id: true, name: true } },
    },
  });
  if (!user) return fail("Utilisateur introuvable.");

  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return fail("Impossible de supprimer le dernier administrateur.");
    }
  }

  if (user.team) {
    const [matchCount, assignmentCount] = await Promise.all([
      prisma.match.count({
        where: { OR: [{ teamAId: user.team.id }, { teamBId: user.team.id }] },
      }),
      prisma.matchAssignment.count({
        where: {
          OR: [{ teamAId: user.team.id }, { teamBId: user.team.id }],
          status: { in: ["PENDING", "ESCALATED"] },
        },
      }),
    ]);
    if (matchCount > 0) {
      return fail(
        `${user.team.name} a des matchs enregistrés : supprimez-les d'abord depuis /admin/matches.`
      );
    }
    if (assignmentCount > 0) {
      return fail(
        `${user.team.name} a des matchs attribués en attente : annulez-les d'abord depuis /admin/assignments.`
      );
    }
  }

  // Cascade : User → Team → Player/Availability/MatchProposal/... (voir schema.prisma)
  await prisma.user.delete({ where: { id: userId } });

  revalidatePath("/admin/users");
  revalidatePath("/teams");
  return ok();
}

/** Envoie un email de réinitialisation de mot de passe à un utilisateur. */
export async function adminSendPasswordReset(userId: string): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, passwordHash: true },
  });
  if (!user) return fail("Utilisateur introuvable.");
  if (!user.passwordHash) {
    return fail("Ce compte n'utilise pas de mot de passe (connexion externe).");
  }

  const token = randomBytes(32).toString("hex");
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({ where: { identifier: user.email } }),
    prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token,
        expires: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password?email=${encodeURIComponent(
    user.email
  )}&token=${token}`;

  await sendPasswordResetEmail({
    to: { email: user.email, name: user.name ?? undefined },
    resetUrl,
  });

  return ok();
}

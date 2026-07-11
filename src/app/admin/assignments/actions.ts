"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAdminContext } from "@/lib/guards";
import { findConflict, conflictMessage } from "@/lib/planning";
import { getMinPlayersToPlay } from "@/lib/settings";
import { notify } from "@/lib/notifications";
import { sendMatchConfirmedEmail } from "@/lib/email";
import {
  createAssignmentSchema,
  type CreateAssignmentFormInput,
} from "@/lib/validators/assignment";
import { ok, fail, type ActionResult } from "@/lib/actions";

/** Admin attribue un match entre deux équipes, avec une fenêtre de dates à négocier. */
export async function createAssignment(input: CreateAssignmentFormInput): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = createAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }
  const { teamAId, teamBId, format, windowStart, windowEnd } = parsed.data;

  if (windowEnd.getTime() < Date.now()) {
    return fail("La fenêtre proposée est déjà passée.");
  }

  const [teamA, teamB] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamAId }, select: { id: true, name: true, captainId: true } }),
    prisma.team.findUnique({ where: { id: teamBId }, select: { id: true, name: true, captainId: true } }),
  ]);
  if (!teamA || !teamB) return fail("Équipe introuvable.");

  const minPlayers = await getMinPlayersToPlay();
  const [aCount, bCount] = await Promise.all([
    prisma.player.count({ where: { teamId: teamAId, isActive: true } }),
    prisma.player.count({ where: { teamId: teamBId, isActive: true } }),
  ]);
  if (aCount < minPlayers || bCount < minPlayers) {
    return fail(`Chaque équipe doit compter au moins ${minPlayers} joueur(s) actif(s).`);
  }

  const assignment = await prisma.matchAssignment.create({
    data: { teamAId, teamBId, format, windowStart, windowEnd, createdById: ctx.userId },
  });

  await Promise.all([
    notify(teamA.captainId, "ASSIGNMENT_CREATED", {
      assignmentId: assignment.id,
      opponentTeam: teamB.name,
    }),
    notify(teamB.captainId, "ASSIGNMENT_CREATED", {
      assignmentId: assignment.id,
      opponentTeam: teamA.name,
    }),
  ]);

  revalidatePath("/admin/assignments");
  revalidatePath("/planning");
  return ok();
}

/** Admin tranche directement (fenêtre expirée ou intervention proactive) : crée le match. */
export async function adminResolveAssignment(
  assignmentId: string,
  date: string
): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return fail("Date invalide.");
  if (parsedDate.getTime() < Date.now()) return fail("La date doit être dans le futur.");

  const assignment = await prisma.matchAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      teamA: {
        select: {
          id: true,
          name: true,
          captainId: true,
          captain: { select: { email: true, name: true } },
        },
      },
      teamB: {
        select: {
          id: true,
          name: true,
          captainId: true,
          captain: { select: { email: true, name: true } },
        },
      },
    },
  });
  if (!assignment) return fail("Attribution introuvable.");
  if (assignment.status === "AGREED") return fail("Ce match a déjà une date confirmée.");
  if (assignment.status === "CANCELLED") return fail("Cette attribution a été annulée.");

  const conflict = await findConflict([assignment.teamAId, assignment.teamBId], parsedDate);
  if (conflict) return fail(conflictMessage(conflict));

  const match = await prisma.$transaction(async (tx) => {
    const created = await tx.match.create({
      data: {
        teamAId: assignment.teamAId,
        teamBId: assignment.teamBId,
        scheduledAt: parsedDate,
        format: assignment.format,
        status: "SCHEDULED",
      },
    });
    await tx.matchAssignment.update({
      where: { id: assignmentId },
      data: { status: "AGREED", matchId: created.id, proposedDate: parsedDate },
    });
    return created;
  });

  await sendMatchConfirmedEmail({
    to: [
      { email: assignment.teamA.captain.email, name: assignment.teamA.captain.name ?? undefined },
      { email: assignment.teamB.captain.email, name: assignment.teamB.captain.name ?? undefined },
    ],
    teamAName: assignment.teamA.name,
    teamBName: assignment.teamB.name,
    scheduledAt: parsedDate,
    format: assignment.format,
  });
  await Promise.all([
    notify(assignment.teamA.captainId, "ASSIGNMENT_AGREED", { matchId: match.id }),
    notify(assignment.teamB.captainId, "ASSIGNMENT_AGREED", { matchId: match.id }),
  ]);

  revalidatePath("/admin/assignments");
  revalidatePath("/planning");
  revalidatePath("/matches");
  return ok();
}

export async function cancelAssignment(assignmentId: string): Promise<ActionResult> {
  const ctx = await getAdminContext();
  if (!ctx.ok) return fail(ctx.error);

  const res = await prisma.matchAssignment.updateMany({
    where: { id: assignmentId, status: { in: ["PENDING", "ESCALATED"] } },
    data: { status: "CANCELLED" },
  });
  if (res.count === 0) {
    return fail("Attribution introuvable ou déjà résolue.");
  }

  revalidatePath("/admin/assignments");
  revalidatePath("/planning");
  return ok();
}

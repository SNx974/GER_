"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCaptainContext } from "@/lib/guards";
import { findConflict, conflictMessage } from "@/lib/planning";
import { notify } from "@/lib/notifications";
import {
  availabilitySchema,
  proposalSchema,
  type AvailabilityFormInput,
  type ProposalFormInput,
} from "@/lib/validators/planning";
import { ok, fail, type ActionResult } from "@/lib/actions";

// ─── Disponibilités ───

export async function addAvailability(
  input: AvailabilityFormInput
): Promise<ActionResult> {
  const ctx = await getCaptainContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = availabilitySchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }

  const { startTime, endTime, status, note } = parsed.data;
  await prisma.availability.create({
    data: {
      teamId: ctx.teamId,
      startTime,
      endTime,
      status,
      note: note?.trim() || null,
    },
  });

  revalidatePath("/planning");
  return ok();
}

export async function deleteAvailability(id: string): Promise<ActionResult> {
  const ctx = await getCaptainContext();
  if (!ctx.ok) return fail(ctx.error);

  const res = await prisma.availability.deleteMany({
    where: { id, teamId: ctx.teamId },
  });
  if (res.count === 0) return fail("Créneau introuvable.");

  revalidatePath("/planning");
  return ok();
}

// ─── Propositions de match ───

export async function createProposal(
  input: ProposalFormInput
): Promise<ActionResult> {
  const ctx = await getCaptainContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }

  const { opponentTeamId, proposedDate, format, message } = parsed.data;

  if (opponentTeamId === ctx.teamId) {
    return fail("Vous ne pouvez pas vous proposer un match à vous-même.");
  }
  if (proposedDate.getTime() < Date.now()) {
    return fail("La date proposée doit être dans le futur.");
  }

  const opponent = await prisma.team.findUnique({
    where: { id: opponentTeamId },
    select: { id: true, captainId: true, name: true },
  });
  if (!opponent) return fail("Équipe adverse introuvable.");

  const conflict = await findConflict([ctx.teamId, opponentTeamId], proposedDate);
  if (conflict) return fail(conflictMessage(conflict));

  const myTeam = await prisma.team.findUnique({
    where: { id: ctx.teamId },
    select: { name: true },
  });

  const proposal = await prisma.matchProposal.create({
    data: {
      proposingTeamId: ctx.teamId,
      opponentTeamId,
      proposedDate,
      format,
      message: message?.trim() || null,
    },
  });

  await notify(opponent.captainId, "PROPOSAL_RECEIVED", {
    proposalId: proposal.id,
    fromTeam: myTeam?.name ?? "Une équipe",
    date: proposedDate.toISOString(),
    format,
  });

  revalidatePath("/planning");
  return ok();
}

export async function respondProposal(
  proposalId: string,
  accept: boolean
): Promise<ActionResult> {
  const ctx = await getCaptainContext();
  if (!ctx.ok) return fail(ctx.error);

  const proposal = await prisma.matchProposal.findUnique({
    where: { id: proposalId },
    include: {
      proposingTeam: { select: { id: true, captainId: true, name: true } },
      opponentTeam: { select: { id: true, name: true } },
    },
  });
  if (!proposal) return fail("Proposition introuvable.");
  if (proposal.opponentTeamId !== ctx.teamId) {
    return fail("Seule l'équipe destinataire peut répondre.");
  }
  if (proposal.status !== "PENDING") {
    return fail("Cette proposition a déjà été traitée.");
  }

  if (!accept) {
    await prisma.matchProposal.update({
      where: { id: proposalId },
      data: { status: "REFUSED", respondedAt: new Date() },
    });
    await notify(proposal.proposingTeam.captainId, "PROPOSAL_REFUSED", {
      byTeam: proposal.opponentTeam.name,
    });
    revalidatePath("/planning");
    return ok();
  }

  // Re-vérification du conflit au moment de l'acceptation
  const conflict = await findConflict(
    [proposal.proposingTeamId, proposal.opponentTeamId],
    proposal.proposedDate
  );
  if (conflict) return fail(conflictMessage(conflict));

  // Acceptation + création du match (proposant = équipe A)
  await prisma.$transaction([
    prisma.matchProposal.update({
      where: { id: proposalId },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    }),
    prisma.match.create({
      data: {
        proposalId: proposal.id,
        teamAId: proposal.proposingTeamId,
        teamBId: proposal.opponentTeamId,
        scheduledAt: proposal.proposedDate,
        format: proposal.format,
        status: "SCHEDULED",
      },
    }),
  ]);

  await notify(proposal.proposingTeam.captainId, "PROPOSAL_ACCEPTED", {
    byTeam: proposal.opponentTeam.name,
    date: proposal.proposedDate.toISOString(),
  });

  revalidatePath("/planning");
  revalidatePath("/matches");
  return ok();
}

export async function cancelProposal(proposalId: string): Promise<ActionResult> {
  const ctx = await getCaptainContext();
  if (!ctx.ok) return fail(ctx.error);

  const res = await prisma.matchProposal.updateMany({
    where: { id: proposalId, proposingTeamId: ctx.teamId, status: "PENDING" },
    data: { status: "CANCELLED" },
  });
  if (res.count === 0) return fail("Proposition introuvable ou déjà traitée.");

  revalidatePath("/planning");
  return ok();
}

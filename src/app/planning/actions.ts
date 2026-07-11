"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCaptainContext } from "@/lib/guards";
import { findConflict, conflictMessage } from "@/lib/planning";
import { notify } from "@/lib/notifications";
import { getMinPlayersToPlay } from "@/lib/settings";
import { sendProposalReceivedEmail, sendMatchConfirmedEmail } from "@/lib/email";
import {
  availabilitySchema,
  proposalSchema,
  type AvailabilityFormInput,
  type ProposalFormInput,
} from "@/lib/validators/planning";
import { proposeAssignmentDateSchema } from "@/lib/validators/assignment";
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
    select: {
      id: true,
      captainId: true,
      name: true,
      captain: { select: { email: true, name: true } },
    },
  });
  if (!opponent) return fail("Équipe adverse introuvable.");

  const minPlayers = await getMinPlayersToPlay();
  const [myCount, oppCount] = await Promise.all([
    prisma.player.count({ where: { teamId: ctx.teamId, isActive: true } }),
    prisma.player.count({ where: { teamId: opponentTeamId, isActive: true } }),
  ]);
  if (myCount < minPlayers) {
    return fail(
      `Votre équipe doit compter au moins ${minPlayers} joueur(s) actif(s) pour proposer un match (actuellement ${myCount}).`
    );
  }
  if (oppCount < minPlayers) {
    return fail(
      `${opponent.name} n'a pas encore assez de joueurs actifs (minimum ${minPlayers}).`
    );
  }

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
  await sendProposalReceivedEmail({
    to: { email: opponent.captain.email, name: opponent.captain.name ?? undefined },
    opponentTeamName: myTeam?.name ?? "Une équipe",
    proposedDate,
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
      proposingTeam: {
        select: {
          id: true,
          captainId: true,
          name: true,
          captain: { select: { email: true, name: true } },
        },
      },
      opponentTeam: {
        select: {
          id: true,
          name: true,
          captain: { select: { email: true, name: true } },
        },
      },
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

  // Re-vérification du minimum de joueurs et du conflit au moment de l'acceptation
  const minPlayers = await getMinPlayersToPlay();
  const [aCount, bCount] = await Promise.all([
    prisma.player.count({ where: { teamId: proposal.proposingTeamId, isActive: true } }),
    prisma.player.count({ where: { teamId: proposal.opponentTeamId, isActive: true } }),
  ]);
  if (aCount < minPlayers || bCount < minPlayers) {
    return fail(
      `Chaque équipe doit compter au moins ${minPlayers} joueur(s) actif(s) pour démarrer un match.`
    );
  }

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
  await sendMatchConfirmedEmail({
    to: [
      {
        email: proposal.proposingTeam.captain.email,
        name: proposal.proposingTeam.captain.name ?? undefined,
      },
      {
        email: proposal.opponentTeam.captain.email,
        name: proposal.opponentTeam.captain.name ?? undefined,
      },
    ],
    teamAName: proposal.proposingTeam.name,
    teamBName: proposal.opponentTeam.name,
    scheduledAt: proposal.proposedDate,
    format: proposal.format,
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

// ─── Matchs attribués par l'admin (négociation d'une date dans une fenêtre) ───

export async function proposeAssignmentDate(
  input: { assignmentId: string; date: string }
): Promise<ActionResult> {
  const ctx = await getCaptainContext();
  if (!ctx.ok) return fail(ctx.error);

  const parsed = proposeAssignmentDateSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Données invalides");
  }
  const { assignmentId, date } = parsed.data;

  const assignment = await prisma.matchAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      teamA: { select: { id: true, captainId: true, name: true } },
      teamB: { select: { id: true, captainId: true, name: true } },
    },
  });
  if (!assignment) return fail("Attribution introuvable.");
  if (assignment.teamAId !== ctx.teamId && assignment.teamBId !== ctx.teamId) {
    return fail("Ce match attribué ne concerne pas votre équipe.");
  }
  if (assignment.status !== "PENDING") {
    return fail("Cette attribution n'est plus ouverte à la négociation.");
  }
  if (date.getTime() < assignment.windowStart.getTime() || date.getTime() > assignment.windowEnd.getTime()) {
    return fail("La date doit être comprise dans la fenêtre proposée par l'admin.");
  }

  const isTeamA = ctx.teamId === assignment.teamAId;
  const myTeam = isTeamA ? assignment.teamA : assignment.teamB;
  const otherTeam = isTeamA ? assignment.teamB : assignment.teamA;

  await prisma.matchAssignment.update({
    where: { id: assignmentId },
    data: { proposedDate: date, proposedByTeamId: ctx.teamId },
  });

  await notify(otherTeam.captainId, "ASSIGNMENT_DATE_PROPOSED", {
    assignmentId,
    byTeam: myTeam.name,
  });

  revalidatePath("/planning");
  return ok();
}

/** Accepte la date actuellement proposée par l'AUTRE équipe → crée le match. */
export async function acceptAssignmentDate(assignmentId: string): Promise<ActionResult> {
  const ctx = await getCaptainContext();
  if (!ctx.ok) return fail(ctx.error);

  const assignment = await prisma.matchAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      teamA: {
        select: { id: true, captainId: true, name: true, captain: { select: { email: true, name: true } } },
      },
      teamB: {
        select: { id: true, captainId: true, name: true, captain: { select: { email: true, name: true } } },
      },
    },
  });
  if (!assignment) return fail("Attribution introuvable.");
  if (assignment.teamAId !== ctx.teamId && assignment.teamBId !== ctx.teamId) {
    return fail("Ce match attribué ne concerne pas votre équipe.");
  }
  if (assignment.status !== "PENDING") {
    return fail("Cette attribution n'est plus ouverte à la négociation.");
  }
  if (!assignment.proposedDate || !assignment.proposedByTeamId) {
    return fail("Aucune date n'a encore été proposée.");
  }
  if (assignment.proposedByTeamId === ctx.teamId) {
    return fail("Vous ne pouvez pas accepter votre propre proposition.");
  }

  const minPlayers = await getMinPlayersToPlay();
  const [aCount, bCount] = await Promise.all([
    prisma.player.count({ where: { teamId: assignment.teamAId, isActive: true } }),
    prisma.player.count({ where: { teamId: assignment.teamBId, isActive: true } }),
  ]);
  if (aCount < minPlayers || bCount < minPlayers) {
    return fail(`Chaque équipe doit compter au moins ${minPlayers} joueur(s) actif(s) pour démarrer un match.`);
  }

  const conflict = await findConflict([assignment.teamAId, assignment.teamBId], assignment.proposedDate);
  if (conflict) return fail(conflictMessage(conflict));

  const match = await prisma.$transaction(async (tx) => {
    const created = await tx.match.create({
      data: {
        teamAId: assignment.teamAId,
        teamBId: assignment.teamBId,
        scheduledAt: assignment.proposedDate!,
        format: assignment.format,
        status: "SCHEDULED",
      },
    });
    await tx.matchAssignment.update({
      where: { id: assignmentId },
      data: { status: "AGREED", matchId: created.id },
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
    scheduledAt: assignment.proposedDate,
    format: assignment.format,
  });
  await Promise.all([
    notify(assignment.teamA.captainId, "ASSIGNMENT_AGREED", { matchId: match.id }),
    notify(assignment.teamB.captainId, "ASSIGNMENT_AGREED", { matchId: match.id }),
  ]);

  revalidatePath("/planning");
  revalidatePath("/matches");
  return ok();
}

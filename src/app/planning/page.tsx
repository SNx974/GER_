import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { AvailabilityManager } from "./availability-manager";
import { ProposeDialog } from "./propose-dialog";
import { ProposalsPanel } from "./proposals-panel";
import { AssignmentsPanel, type AssignmentRow } from "./assignments-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function PlanningPage() {
  const session = await requireAuth();
  if (session.user.role !== "CAPTAIN" || !session.user.teamId) {
    redirect("/dashboard");
  }
  const teamId = session.user.teamId;

  const [availabilities, received, sent, opponents, assignments] = await Promise.all([
    prisma.availability.findMany({
      where: { teamId },
      orderBy: { startTime: "asc" },
    }),
    prisma.matchProposal.findMany({
      where: { opponentTeamId: teamId, status: "PENDING" },
      include: { proposingTeam: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.matchProposal.findMany({
      where: { proposingTeamId: teamId },
      include: { opponentTeam: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.team.findMany({
      where: { id: { not: teamId } },
      select: { id: true, name: true, tag: true },
      orderBy: { name: "asc" },
    }),
    prisma.matchAssignment.findMany({
      where: {
        OR: [{ teamAId: teamId }, { teamBId: teamId }],
        status: { in: ["PENDING", "ESCALATED"] },
      },
      include: {
        teamA: { select: { name: true } },
        teamB: { select: { name: true } },
      },
      orderBy: { windowStart: "asc" },
    }),
  ]);

  const assignmentRows: AssignmentRow[] = assignments.map((a) => ({
    id: a.id,
    opponentName: a.teamAId === teamId ? a.teamB.name : a.teamA.name,
    format: a.format,
    windowStart: a.windowStart.toISOString(),
    windowEnd: a.windowEnd.toISOString(),
    status: a.status,
    proposedDate: a.proposedDate ? a.proposedDate.toISOString() : null,
    proposedByMe: a.proposedByTeamId === teamId,
  }));

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Planning</h1>
          <p className="text-muted-foreground">
            Gérez vos disponibilités et vos propositions de match.
          </p>
        </div>
        <ProposeDialog opponents={opponents} />
      </div>

      {assignmentRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Matchs attribués par l&apos;admin</CardTitle>
            <CardDescription>
              Mettez-vous d&apos;accord avec l&apos;adversaire sur une date
              dans la fenêtre proposée.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AssignmentsPanel assignments={assignmentRows} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Propositions</CardTitle>
          <CardDescription>
            Répondez aux demandes reçues et suivez vos envois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProposalsPanel
            received={received.map((p) => ({
              id: p.id,
              fromTeam: p.proposingTeam.name,
              proposedDate: p.proposedDate.toISOString(),
              format: p.format,
              message: p.message,
            }))}
            sent={sent.map((p) => ({
              id: p.id,
              toTeam: p.opponentTeam.name,
              proposedDate: p.proposedDate.toISOString(),
              format: p.format,
              status: p.status,
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calendrier de disponibilité</CardTitle>
          <CardDescription>
            Les créneaux « indisponible » bloquent les propositions de match.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityManager
            items={availabilities.map((a) => ({
              id: a.id,
              startTime: a.startTime.toISOString(),
              endTime: a.endTime.toISOString(),
              status: a.status,
              note: a.note,
            }))}
          />
        </CardContent>
      </Card>
      </main>
    </AppShell>
  );
}

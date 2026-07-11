import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format-date";
import { AppShell } from "@/components/app-shell";
import { CreateAssignmentForm } from "./create-assignment-form";
import { AssignmentActions } from "./assignment-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<
  string,
  { label: string; variant: "secondary" | "success" | "destructive" }
> = {
  PENDING: { label: "En négociation", variant: "secondary" },
  AGREED: { label: "Accordé", variant: "success" },
  ESCALATED: { label: "Signalé — intervention requise", variant: "destructive" },
  CANCELLED: { label: "Annulé", variant: "secondary" },
};

export default async function AdminAssignmentsPage() {
  await requireRole("ADMIN");

  const [teams, assignments] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, tag: true },
    }),
    prisma.matchAssignment.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        teamA: { select: { name: true, tag: true } },
        teamB: { select: { name: true, tag: true } },
        proposedByTeam: { select: { name: true } },
      },
    }),
  ]);

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold">Matchs attribués</h1>
          <p className="text-muted-foreground">
            Attribuez un match entre deux équipes avec une fenêtre de dates ;
            elles se mettent d&apos;accord sur une date précise dans cette
            fenêtre. Sans accord à temps, le match est signalé ici pour
            intervention.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Nouvelle attribution</CardTitle>
          </CardHeader>
          <CardContent>
            <CreateAssignmentForm teams={teams} />
          </CardContent>
        </Card>

        {assignments.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Aucune attribution pour l&apos;instant.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => {
              const st = STATUS_LABEL[a.status] ?? STATUS_LABEL.PENDING!;
              return (
                <Card key={a.id} className={a.status === "ESCALATED" ? "border-destructive/50" : undefined}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">
                        {a.teamA.name}
                        {a.teamA.tag ? ` [${a.teamA.tag}]` : ""} vs {a.teamB.name}
                        {a.teamB.tag ? ` [${a.teamB.tag}]` : ""}
                      </CardTitle>
                      <CardDescription>
                        {a.format} · Fenêtre : {formatDateTime(a.windowStart)} →{" "}
                        {formatDateTime(a.windowEnd)}
                      </CardDescription>
                    </div>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {a.proposedDate && a.status !== "AGREED" && (
                      <p className="text-sm">
                        Proposition en cours par <strong>{a.proposedByTeam?.name}</strong> :{" "}
                        {formatDateTime(a.proposedDate)}
                      </p>
                    )}
                    {(a.status === "PENDING" || a.status === "ESCALATED") && (
                      <AssignmentActions assignmentId={a.id} />
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </AppShell>
  );
}

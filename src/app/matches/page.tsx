import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format-date";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; variant: "secondary" | "default" | "success" }> = {
  SCHEDULED: { label: "Planifié", variant: "secondary" },
  MAPBAN: { label: "Mapban en cours", variant: "default" },
  READY: { label: "Prêt à jouer", variant: "default" },
  COMPLETED: { label: "Terminé", variant: "success" },
  CANCELLED: { label: "Annulé", variant: "secondary" },
};

export default async function MatchesPage() {
  const session = await requireAuth();
  if (session.user.role !== "CAPTAIN" || !session.user.teamId) {
    redirect("/dashboard");
  }
  const teamId = session.user.teamId;

  const matches = await prisma.match.findMany({
    where: { OR: [{ teamAId: teamId }, { teamBId: teamId }] },
    include: {
      teamA: { select: { id: true, name: true, tag: true } },
      teamB: { select: { id: true, name: true, tag: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Mes matchs</h1>
        <p className="text-muted-foreground">
          Accédez aux salles de match et au mapban.
        </p>
      </div>

      {matches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun match planifié. Proposez un match depuis le{" "}
          <Link href="/planning" className="text-primary hover:underline">
            planning
          </Link>
          .
        </p>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => {
            const opponent = m.teamAId === teamId ? m.teamB : m.teamA;
            const st = STATUS[m.status] ?? STATUS.SCHEDULED!;
            return (
              <Card key={m.id}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">
                      vs {opponent.name}
                      {opponent.tag ? ` [${opponent.tag}]` : ""}
                    </CardTitle>
                    <CardDescription>
                      {formatDateTime(m.scheduledAt)} · {m.format}
                    </CardDescription>
                  </div>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </CardHeader>
                <CardContent>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/match/${m.roomToken}`}>
                      Salle de match <ArrowRight />
                    </Link>
                  </Button>
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

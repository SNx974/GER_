import Link from "next/link";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { AdminMatchActions } from "./match-actions";
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
  { label: string; variant: "secondary" | "default" | "success" | "destructive" }
> = {
  SCHEDULED: { label: "Planifié", variant: "secondary" },
  MAPBAN: { label: "Mapban en cours", variant: "default" },
  READY: { label: "Prêt à jouer", variant: "default" },
  COMPLETED: { label: "Terminé", variant: "success" },
  CANCELLED: { label: "Annulé", variant: "destructive" },
};

export default async function AdminMatchesPage() {
  await requireRole("ADMIN");

  const matches = await prisma.match.findMany({
    orderBy: { scheduledAt: "desc" },
    include: {
      teamA: { select: { name: true, tag: true } },
      teamB: { select: { name: true, tag: true } },
      result: { select: { status: true } },
    },
  });

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold">Tous les matchs</h1>
          <p className="text-muted-foreground">
            Vue d&apos;ensemble des matchs proposés par les équipes.
            Annulez ou supprimez si nécessaire.
          </p>
        </div>

        {matches.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Aucun match pour l&apos;instant.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => {
              const st = STATUS_LABEL[m.status] ?? STATUS_LABEL.SCHEDULED!;
              return (
                <Card key={m.id}>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">
                        {m.teamA.name}
                        {m.teamA.tag ? ` [${m.teamA.tag}]` : ""} vs{" "}
                        {m.teamB.name}
                        {m.teamB.tag ? ` [${m.teamB.tag}]` : ""}
                      </CardTitle>
                      <CardDescription>
                        {m.scheduledAt.toLocaleString("fr-FR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}{" "}
                        · {m.format}
                      </CardDescription>
                    </div>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/match/${m.roomToken}`}
                      className="text-sm text-primary hover:underline"
                    >
                      Salle de match
                    </Link>
                    {m.result && (
                      <Link
                        href={`/admin/results/${m.id}`}
                        className="text-sm text-primary hover:underline"
                      >
                        Résultat ({m.result.status}) — détail
                      </Link>
                    )}
                    <AdminMatchActions matchId={m.id} status={m.status} />
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

import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { AdminResultActions } from "./result-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; variant: "secondary" | "destructive" }> = {
  PENDING: { label: "En attente", variant: "secondary" },
  DISPUTED: { label: "Contesté", variant: "destructive" },
};

export default async function AdminResultsPage() {
  await requireRole("ADMIN");

  const results = await prisma.matchResult.findMany({
    where: { status: { in: ["PENDING", "DISPUTED"] } },
    orderBy: [{ createdAt: "desc" }],
    include: {
      match: {
        select: {
          id: true,
          roomToken: true,
          format: true,
          teamA: { select: { name: true } },
          teamB: { select: { name: true } },
        },
      },
    },
  });

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold">Résultats à valider</h1>
          <p className="text-muted-foreground">
            Seul un admin peut valider définitivement un résultat.
          </p>
        </div>

        {results.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Aucun résultat en attente de validation. 🎉
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {results.map((r) => {
              const st = STATUS[r.status] ?? STATUS.PENDING!;
              return (
                <Card key={r.id}>
                  <CardHeader className="flex-row items-start justify-between space-y-0">
                    <div>
                      <CardTitle className="text-lg">
                        {r.match.teamA.name} {r.seriesScoreA} – {r.seriesScoreB}{" "}
                        {r.match.teamB.name}
                      </CardTitle>
                      <CardDescription>
                        {r.match.format} ·{" "}
                        {r.createdAt.toLocaleString("fr-FR", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </CardDescription>
                    </div>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {r.screenshots.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {r.screenshots.map((url, i) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="block h-20 w-20 overflow-hidden rounded-md border transition-opacity hover:opacity-80"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Screenshot ${i + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        Confirmation capitaines : {r.teamAValidated ? "✅" : "⏳"}{" "}
                        {r.match.teamA.name} · {r.teamBValidated ? "✅" : "⏳"}{" "}
                        {r.match.teamB.name}
                      </span>
                    </div>
                    <AdminResultActions
                      matchId={r.match.id}
                      token={r.match.roomToken}
                    />
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

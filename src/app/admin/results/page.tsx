import { AlertTriangle } from "lucide-react";
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

type AiShape = { summary?: string; anomalies?: string[] };

export default async function AdminResultsPage() {
  await requireRole("ADMIN");

  const results = await prisma.matchResult.findMany({
    where: { status: { in: ["PENDING", "DISPUTED"] } },
    orderBy: [{ aiFlagged: "desc" }, { createdAt: "desc" }],
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
            Statuez sur les résultats en attente. Les anomalies détectées par
            l&apos;IA sont mises en avant.
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
              const ai = r.aiAnalysis as AiShape | null;
              return (
                <Card
                  key={r.id}
                  className={r.aiFlagged ? "border-destructive/50" : undefined}
                >
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
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      {r.aiFlagged && (
                        <Badge variant="destructive">
                          <AlertTriangle className="mr-1 h-3 w-3" /> Anomalie IA
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {ai?.summary && (
                      <p className="text-sm text-muted-foreground">
                        {ai.summary}
                      </p>
                    )}
                    {ai?.anomalies && ai.anomalies.length > 0 && (
                      <ul className="list-inside list-disc text-sm text-destructive">
                        {ai.anomalies.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    )}
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
                        Validation capitaines : {r.teamAValidated ? "✅" : "⏳"}{" "}
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

import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ResultForm } from "./result-form";
import { ResultValidation } from "./result-validation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const RESULT_STATUS: Record<string, { label: string; variant: "secondary" | "success" | "destructive" }> = {
  PENDING: { label: "En attente de validation", variant: "secondary" },
  VALIDATED: { label: "Validé", variant: "success" },
  DISPUTED: { label: "Contesté", variant: "destructive" },
  REJECTED: { label: "Rejeté", variant: "destructive" },
};

type AiShape = {
  provider?: string;
  summary?: string;
  anomalies?: string[];
  flagged?: boolean;
};

export default async function ResultPage({
  params,
}: {
  params: { token: string };
}) {
  const match = await prisma.match.findUnique({
    where: { roomToken: params.token },
    include: {
      maps: { include: { map: true }, orderBy: { order: "asc" } },
      result: true,
      teamA: {
        select: {
          id: true,
          name: true,
          captainId: true,
          players: {
            where: { isActive: true },
            select: { id: true, pseudo: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      teamB: {
        select: {
          id: true,
          name: true,
          captainId: true,
          players: {
            where: { isActive: true },
            select: { id: true, pseudo: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!match) notFound();

  const session = await auth();
  const myTeamId = session?.user.teamId ?? null;
  const isA = myTeamId === match.teamAId;
  const isB = myTeamId === match.teamBId;
  const isParticipantCaptain =
    session?.user.role === "CAPTAIN" && (isA || isB);
  const isAdmin = session?.user.role === "ADMIN";

  const result = match.result;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div>
        <Link
          href={`/match/${params.token}`}
          className="text-sm text-primary hover:underline"
        >
          ← Retour à la salle
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Résultat du match</h1>
        <p className="text-muted-foreground">
          {match.teamA.name} vs {match.teamB.name} · {match.format}
        </p>
      </div>

      {/* Cas 1 : pas encore de résultat */}
      {!result && (
        <>
          {match.status !== "READY" ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Le mapban doit être terminé avant de pouvoir soumettre un
                résultat.
              </CardContent>
            </Card>
          ) : isParticipantCaptain ? (
            <ResultForm
              token={params.token}
              maps={match.maps.map((m) => ({
                matchMapId: m.id,
                mapName: m.map.name,
                isDecider: m.isDecider,
              }))}
              teamA={{ name: match.teamA.name, players: match.teamA.players }}
              teamB={{ name: match.teamB.name, players: match.teamB.players }}
            />
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                En attente de la soumission du résultat par l&apos;un des
                capitaines.
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Cas 2 : résultat soumis */}
      {result && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-2xl">
                  {match.teamA.name} {result.seriesScoreA} – {result.seriesScoreB}{" "}
                  {match.teamB.name}
                </CardTitle>
                <CardDescription>Score de la série</CardDescription>
              </div>
              <Badge variant={(RESULT_STATUS[result.status] ?? RESULT_STATUS.PENDING!).variant}>
                {(RESULT_STATUS[result.status] ?? RESULT_STATUS.PENDING!).label}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {match.maps.map((m, i) => (
                <div key={m.id} className="flex justify-between border-b py-1">
                  <span>
                    Map {i + 1} — {m.map.name}
                    {m.isDecider && (
                      <span className="ml-1 text-xs text-emerald-500">
                        (Decider)
                      </span>
                    )}
                  </span>
                  <span className="font-mono">
                    {m.scoreTeamA ?? "–"} : {m.scoreTeamB ?? "–"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Analyse IA */}
          <AiCard ai={result.aiAnalysis as AiShape | null} flagged={result.aiFlagged} />

          {/* Screenshots */}
          {result.screenshots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Screenshots</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {result.screenshots.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Image {i + 1}
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Validation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Validation</CardTitle>
              <CardDescription>
                Le résultat est comptabilisé une fois validé par les deux
                capitaines ou par un administrateur.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4 text-sm">
                <ValidationTag label={match.teamA.name} ok={result.teamAValidated} />
                <ValidationTag label={match.teamB.name} ok={result.teamBValidated} />
              </div>

              {result.status !== "VALIDATED" && result.aiFlagged && (
                <p className="text-sm text-destructive">
                  ⚠️ Anomalie détectée par l&apos;IA : la validation d&apos;un
                  administrateur est requise pour comptabiliser ce résultat.
                </p>
              )}

              {result.status !== "VALIDATED" && (
                <ResultValidation
                  matchId={match.id}
                  canValidate={
                    isAdmin ||
                    (!!isParticipantCaptain &&
                      ((isA && !result.teamAValidated) ||
                        (isB && !result.teamBValidated)))
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}

function ValidationTag({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span className="flex items-center gap-1">
      {ok ? (
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
      )}
      {label} : {ok ? "validé" : "en attente"}
    </span>
  );
}

function AiCard({ ai, flagged }: { ai: AiShape | null; flagged: boolean }) {
  return (
    <Card className={flagged ? "border-destructive/50" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Analyse IA
          {flagged ? (
            <Badge variant="destructive">Anomalies détectées</Badge>
          ) : (
            <Badge variant="success">RAS</Badge>
          )}
        </CardTitle>
        {ai?.provider && (
          <CardDescription>Moteur : {ai.provider}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{ai?.summary ?? "Analyse indisponible."}</p>
        {ai?.anomalies && ai.anomalies.length > 0 && (
          <ul className="list-inside list-disc text-muted-foreground">
            {ai.anomalies.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

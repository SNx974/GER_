import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AiAnalysisCard, type AiShape } from "@/components/ai-analysis-card";
import { SubmissionCompare } from "@/app/admin/results/[matchId]/submission-compare";
import type { SubmissionSnapshot } from "@/lib/validators/result";
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
  const teamASubmission = (result?.teamASubmission as SubmissionSnapshot | null) ?? null;
  const teamBSubmission = (result?.teamBSubmission as SubmissionSnapshot | null) ?? null;

  // Chaque capitaine peut soumettre sa propre version tant qu'il ne l'a pas
  // déjà fait — la soumission de l'autre équipe ne bloque plus la sienne.
  const myOwnSubmission = isA ? teamASubmission : isB ? teamBSubmission : undefined;
  const canSubmitMyself =
    isParticipantCaptain && match.status === "READY" && !myOwnSubmission;

  const bothSubmitted = Boolean(teamASubmission && teamBSubmission);
  const mapNames = Object.fromEntries(
    match.maps.map((m, i) => [m.id, `Map ${i + 1} — ${m.map.name}`])
  );
  const allPlayers = [...match.teamA.players, ...match.teamB.players];

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

      {match.status !== "READY" && !result && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Le mapban doit être terminé avant de pouvoir soumettre un résultat.
          </CardContent>
        </Card>
      )}

      {/* Formulaire de soumission : visible tant que CE capitaine n'a pas
          encore soumis sa propre version, même si l'autre équipe l'a déjà fait. */}
      {canSubmitMyself && (
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
      )}

      {!result && !isParticipantCaptain && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            En attente de la soumission du résultat par l&apos;une des équipes.
          </CardContent>
        </Card>
      )}

      {isParticipantCaptain && match.status === "READY" && myOwnSubmission && (
        <p className="text-sm text-muted-foreground">
          Vous avez déjà soumis votre résultat pour ce match.
        </p>
      )}

      {/* Résultat officiel */}
      {result && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-2xl">
                  {match.teamA.name} {result.seriesScoreA} – {result.seriesScoreB}{" "}
                  {match.teamB.name}
                </CardTitle>
                <CardDescription>Score officiel de la série</CardDescription>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={(RESULT_STATUS[result.status] ?? RESULT_STATUS.PENDING!).variant}>
                  {(RESULT_STATUS[result.status] ?? RESULT_STATUS.PENDING!).label}
                </Badge>
                {result.editedByAdmin && (
                  <Badge variant="secondary">Corrigé par un admin</Badge>
                )}
              </div>
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

          {!bothSubmitted && (teamASubmission || teamBSubmission) && (
            <p className="text-sm text-muted-foreground">
              En attente de la soumission de l&apos;autre équipe pour comparer
              les deux versions.
            </p>
          )}
          {bothSubmitted && (
            <SubmissionCompare
              teamAName={match.teamA.name}
              teamBName={match.teamB.name}
              teamASubmission={teamASubmission}
              teamBSubmission={teamBSubmission}
              players={allPlayers}
              mapNames={mapNames}
            />
          )}

          {/* Analyse IA */}
          <AiAnalysisCard ai={result.aiAnalysis as AiShape | null} flagged={result.aiFlagged} />

          {/* Screenshots */}
          {result.screenshots.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Screenshots</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3">
                {result.screenshots.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-28 w-28 overflow-hidden rounded-md border transition-opacity hover:opacity-80"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Screenshot ${i + 1}`}
                      className="h-full w-full object-cover"
                    />
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
                capitaines, ou à tout moment par un administrateur (dernier
                mot).
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
              {result.status === "DISPUTED" && !result.aiFlagged && (
                <p className="text-sm text-destructive">
                  ⚠️ Les deux équipes ont soumis des versions différentes : un
                  administrateur doit trancher.
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
              {isAdmin && (
                <Link
                  href={`/admin/results/${match.id}`}
                  className="inline-block text-sm text-primary hover:underline"
                >
                  Ouvrir le détail admin (modifier les stats)
                </Link>
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

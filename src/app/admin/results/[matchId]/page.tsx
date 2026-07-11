import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { ResultValidation } from "@/app/match/[token]/result/result-validation";
import type { SubmissionSnapshot } from "@/lib/validators/result";
import { EditResultForm } from "./edit-result-form";
import { SubmissionCompare } from "./submission-compare";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

const RESULT_STATUS: Record<
  string,
  { label: string; variant: "secondary" | "success" | "destructive" }
> = {
  PENDING: { label: "En attente de validation", variant: "secondary" },
  VALIDATED: { label: "Validé", variant: "success" },
  DISPUTED: { label: "Contesté", variant: "destructive" },
  REJECTED: { label: "Rejeté", variant: "destructive" },
};

export default async function AdminResultDetailPage({
  params,
}: {
  params: { matchId: string };
}) {
  await requireRole("ADMIN");

  const match = await prisma.match.findUnique({
    where: { id: params.matchId },
    include: {
      maps: { include: { map: true }, orderBy: { order: "asc" } },
      result: true,
      teamA: {
        select: {
          id: true,
          name: true,
          tag: true,
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
          tag: true,
          players: {
            where: { isActive: true },
            select: { id: true, pseudo: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });
  if (!match || !match.result) notFound();

  const result = match.result;
  const allPlayers = [...match.teamA.players, ...match.teamB.players];

  const existingStats = await prisma.playerMatchStat.findMany({
    where: { matchMap: { matchId: match.id } },
    select: { matchMapId: true, playerId: true, kills: true, deaths: true, assists: true, score: true },
  });

  const initialStats: Record<string, Record<string, { kills: string; deaths: string; assists: string; score: string }>> =
    Object.fromEntries(
      match.maps.map((m) => [
        m.id,
        Object.fromEntries(
          allPlayers.map((p) => {
            const s = existingStats.find(
              (row) => row.matchMapId === m.id && row.playerId === p.id
            );
            return [
              p.id,
              {
                kills: String(s?.kills ?? 0),
                deaths: String(s?.deaths ?? 0),
                assists: String(s?.assists ?? 0),
                score: String(s?.score ?? 0),
              },
            ];
          })
        ),
      ])
    );

  const mapNames = Object.fromEntries(
    match.maps.map((m, i) => [m.id, `Map ${i + 1} — ${m.map.name}`])
  );

  const teamASubmission = result.teamASubmission as SubmissionSnapshot | null;
  const teamBSubmission = result.teamBSubmission as SubmissionSnapshot | null;

  const st = RESULT_STATUS[result.status] ?? RESULT_STATUS.PENDING!;

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div>
          <Link
            href="/admin/results"
            className="text-sm text-primary hover:underline"
          >
            ← Résultats à valider
          </Link>
          <h1 className="mt-2 text-3xl font-bold">Détail du résultat</h1>
          <p className="text-muted-foreground">
            {match.teamA.name}
            {match.teamA.tag ? ` [${match.teamA.tag}]` : ""} vs{" "}
            {match.teamB.name}
            {match.teamB.tag ? ` [${match.teamB.tag}]` : ""} · {match.format}
          </p>
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-2xl">
                {match.teamA.name} {result.seriesScoreA} – {result.seriesScoreB}{" "}
                {match.teamB.name}
              </CardTitle>
              <CardDescription>Score officiel actuel</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={st.variant}>{st.label}</Badge>
              {result.editedByAdmin && (
                <Badge variant="secondary">Déjà corrigé par un admin</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex items-center gap-4 text-sm text-muted-foreground">
            <ValidationTag label={match.teamA.name} ok={result.teamAValidated} />
            <ValidationTag label={match.teamB.name} ok={result.teamBValidated} />
          </CardContent>
        </Card>

        <SubmissionCompare
          teamAName={match.teamA.name}
          teamBName={match.teamB.name}
          teamASubmission={teamASubmission}
          teamBSubmission={teamBSubmission}
          players={allPlayers}
          mapNames={mapNames}
        />

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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Corriger le résultat</CardTitle>
            <CardDescription>
              Modifiez directement les scores et statistiques officiels si
              vous constatez un problème. Fonctionne même si le résultat est
              déjà validé — le classement est automatiquement recalculé.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditResultForm
              matchId={match.id}
              maps={match.maps.map((m) => ({
                matchMapId: m.id,
                mapName: m.map.name,
                isDecider: m.isDecider,
                scoreA: m.scoreTeamA ?? 0,
                scoreB: m.scoreTeamB ?? 0,
              }))}
              teamA={{ name: match.teamA.name, players: match.teamA.players }}
              teamB={{ name: match.teamB.name, players: match.teamB.players }}
              initialStats={initialStats}
            />
          </CardContent>
        </Card>

        {result.status !== "VALIDATED" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Décision finale</CardTitle>
              <CardDescription>
                Seul un administrateur peut valider définitivement ce
                résultat, quel que soit l&apos;état des confirmations des
                capitaines.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResultValidation matchId={match.id} canValidate isAdmin />
            </CardContent>
          </Card>
        )}
      </main>
    </AppShell>
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

import { AlertTriangle, ShieldCheck } from "lucide-react";
import type { SubmissionSnapshot } from "@/lib/validators/result";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PlayerLite = { id: string; pseudo: string };

function pseudoOf(players: PlayerLite[], id: string) {
  return players.find((p) => p.id === id)?.pseudo ?? id;
}

function SnapshotCard({
  title,
  snapshot,
  players,
  mapNames,
}: {
  title: string;
  snapshot: SubmissionSnapshot;
  players: PlayerLite[];
  mapNames: Record<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          Soumis le{" "}
          {new Date(snapshot.submittedAt).toLocaleString("fr-FR", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {snapshot.maps.map((m, i) => (
          <div key={m.matchMapId}>
            <div className="mb-1 flex items-center justify-between font-medium">
              <span>{mapNames[m.matchMapId] ?? `Map ${i + 1}`}</span>
              <span className="font-mono">
                {m.scoreA} – {m.scoreB}
              </span>
            </div>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {m.stats
                .filter((s) => s.kills || s.deaths || s.assists || s.score)
                .map((s) => (
                  <li key={s.playerId} className="flex justify-between">
                    <span>{pseudoOf(players, s.playerId)}</span>
                    <span className="font-mono">
                      {s.kills}/{s.deaths}/{s.assists} · {s.score}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function SubmissionCompare({
  teamAName,
  teamBName,
  teamASubmission,
  teamBSubmission,
  players,
  mapNames,
}: {
  teamAName: string;
  teamBName: string;
  teamASubmission: SubmissionSnapshot | null;
  teamBSubmission: SubmissionSnapshot | null;
  players: PlayerLite[];
  mapNames: Record<string, string>;
}) {
  if (!teamASubmission && !teamBSubmission) return null;

  const bothSubmitted = Boolean(teamASubmission && teamBSubmission);
  let matches = true;
  if (bothSubmitted) {
    matches = teamASubmission!.maps.every((m) => {
      const other = teamBSubmission!.maps.find((o) => o.matchMapId === m.matchMapId);
      return other && other.scoreA === m.scoreA && other.scoreB === m.scoreB;
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold uppercase text-muted-foreground">
          Soumissions des équipes
        </h3>
        {bothSubmitted &&
          (matches ? (
            <Badge variant="success">
              <ShieldCheck className="mr-1 h-3 w-3" /> Versions identiques
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertTriangle className="mr-1 h-3 w-3" /> Versions divergentes
            </Badge>
          ))}
        {!bothSubmitted && (
          <Badge variant="secondary">Une seule équipe a soumis</Badge>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {teamASubmission ? (
          <SnapshotCard
            title={teamAName}
            snapshot={teamASubmission}
            players={players}
            mapNames={mapNames}
          />
        ) : (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {teamAName} n&apos;a pas encore soumis de résultat.
            </CardContent>
          </Card>
        )}
        {teamBSubmission ? (
          <SnapshotCard
            title={teamBName}
            snapshot={teamBSubmission}
            players={players}
            mapNames={mapNames}
          />
        ) : (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              {teamBName} n&apos;a pas encore soumis de résultat.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

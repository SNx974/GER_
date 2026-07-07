"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Ban, Check, Swords, Trophy } from "lucide-react";
import { performStep } from "./actions";
import type { RoomState, RoomMap } from "@/lib/match-room";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  token: string;
  initialState: RoomState;
  viewerLetter: "A" | "B" | null;
};

function teamName(state: RoomState, letter: "A" | "B") {
  const t = letter === "A" ? state.teamA : state.teamB;
  return t.tag ? `${t.name} [${t.tag}]` : t.name;
}

export function MatchRoom({ token, initialState, viewerLetter }: Props) {
  const [state, setState] = useState<RoomState>(initialState);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Temps réel : on écoute le flux SSE
  useEffect(() => {
    const es = new EventSource(`/api/match/${token}/stream`);
    es.onmessage = (e) => {
      try {
        setState(JSON.parse(e.data) as RoomState);
      } catch {
        /* ignore keep-alive / parsing */
      }
    };
    // Ne PAS fermer la connexion ici : EventSource retente automatiquement
    // sa connexion après une erreur réseau/proxy. La fermer forçait un
    // rechargement manuel de la page pour retrouver le temps réel.
    es.onerror = () => {
      /* le navigateur gère la reconnexion automatique */
    };
    return () => es.close();
  }, [token]);

  const myTurn =
    viewerLetter !== null &&
    state.currentTurn === viewerLetter &&
    state.status === "MAPBAN";

  function pick(map: RoomMap) {
    if (!myTurn || map.state !== "AVAILABLE" || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await performStep(token, map.id);
      if (!res.ok) setError(res.error);
      else if (res.data) setState(res.data);
    });
  }

  const scheduled = new Date(state.scheduledAt);
  const notStarted =
    state.status === "SCHEDULED" && Date.now() < scheduled.getTime();

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-center gap-6 text-center">
        <div className="flex-1">
          <div className="text-2xl font-bold">{teamName(state, "A")}</div>
          <TurnTag active={state.currentTurn === "A"} letter="A" state={state} />
        </div>
        <div className="text-muted-foreground">
          <Swords className="mx-auto h-6 w-6" />
          <div className="mt-1 text-sm font-semibold">{state.format}</div>
        </div>
        <div className="flex-1">
          <div className="text-2xl font-bold">{teamName(state, "B")}</div>
          <TurnTag active={state.currentTurn === "B"} letter="B" state={state} />
        </div>
      </div>

      {/* Bannière d'état */}
      {notStarted ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-muted-foreground">
            La salle ouvrira à l&apos;heure du match :
          </p>
          <p className="text-lg font-semibold">
            {scheduled.toLocaleString("fr-FR", {
              dateStyle: "full",
              timeStyle: "short",
            })}
          </p>
        </div>
      ) : state.status === "MAPBAN" ? (
        <div className="rounded-lg bg-secondary p-3 text-center text-sm">
          {state.currentTurn ? (
            <>
              Au tour de{" "}
              <span className="font-bold">
                {teamName(state, state.currentTurn)}
              </span>{" "}
              de{" "}
              <span className="font-bold">
                {state.currentAction === "BAN" ? "bannir" : "choisir"}
              </span>{" "}
              une map.
              {myTurn && (
                <span className="ml-1 text-primary">C&apos;est à vous !</span>
              )}
            </>
          ) : (
            "Mapban en cours…"
          )}
        </div>
      ) : null}

      {error && (
        <p className="text-center text-sm text-destructive">{error}</p>
      )}

      {/* Grille des maps */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {state.maps.map((m) => (
          <button
            key={m.id}
            onClick={() => pick(m)}
            disabled={!myTurn || m.state !== "AVAILABLE" || pending}
            className={cn(
              "relative overflow-hidden rounded-lg border p-4 text-left transition",
              m.state === "AVAILABLE" &&
                myTurn &&
                "cursor-pointer hover:border-primary hover:bg-accent",
              m.state === "BANNED" && "opacity-40 grayscale",
              m.state === "PICKED" && "border-primary",
              m.state === "DECIDER" && "border-emerald-500 bg-emerald-500/10"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{m.name}</span>
              {m.state === "BANNED" && (
                <Ban className="h-4 w-4 text-destructive" />
              )}
              {m.state === "PICKED" && (
                <Check className="h-4 w-4 text-primary" />
              )}
              {m.state === "DECIDER" && (
                <Trophy className="h-4 w-4 text-emerald-500" />
              )}
            </div>
            {m.state === "PICKED" && m.byTeam && (
              <div className="mt-1 text-xs text-muted-foreground">
                Choisie par {teamName(state, m.byTeam)}
              </div>
            )}
            {m.state === "DECIDER" && (
              <div className="mt-1 text-xs text-emerald-500">Decider</div>
            )}
            {m.state === "BANNED" && (
              <div className="mt-1 text-xs text-destructive">Bannie</div>
            )}
          </button>
        ))}
      </div>

      {/* Historique du veto */}
      {state.actions.length > 0 && (
        <div className="rounded-lg border p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase text-muted-foreground">
            Déroulé du veto
          </h3>
          <ol className="space-y-1 text-sm">
            {state.actions.map((a) => (
              <li key={a.order} className="flex items-center gap-2">
                <span className="text-muted-foreground">{a.order}.</span>
                <Badge variant={a.action === "BAN" ? "destructive" : "default"}>
                  {a.action === "BAN" ? "BAN" : "PICK"}
                </Badge>
                <span className="font-medium">{teamName(state, a.team)}</span>
                <span>→ {a.mapName}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Récapitulatif final */}
      {state.finished && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6">
          <h3 className="mb-3 text-lg font-bold">Récapitulatif du match</h3>
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Adversaires :</span>{" "}
              {teamName(state, "A")} vs {teamName(state, "B")}
            </p>
            <p>
              <span className="text-muted-foreground">Date :</span>{" "}
              {scheduled.toLocaleString("fr-FR", {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </p>
            <div>
              <span className="text-muted-foreground">
                Map(s) à jouer :
              </span>
              <ul className="mt-1 space-y-1">
                {state.playedMaps.map((pm) => (
                  <li key={pm.order} className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">
                      {pm.order}.
                    </span>
                    <span className="font-semibold">{pm.name}</span>
                    {pm.isDecider ? (
                      <Badge variant="success">Decider</Badge>
                    ) : (
                      pm.pickedBy && (
                        <Badge variant="outline">
                          Pick {teamName(state, pm.pickedBy)}
                        </Badge>
                      )
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {viewerLetter !== null && !state.hasResult && (
            <Button asChild className="mt-4">
              <Link href={`/match/${token}/result`}>
                Soumettre le résultat
              </Link>
            </Button>
          )}
          {state.hasResult && (
            <p className="mt-4 text-sm text-muted-foreground">
              Un résultat a été soumis pour ce match.{" "}
              <Link
                href={`/match/${token}/result`}
                className="text-primary hover:underline"
              >
                Voir / valider
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TurnTag({
  active,
  letter,
  state,
}: {
  active: boolean;
  letter: "A" | "B";
  state: RoomState;
}) {
  if (state.status !== "MAPBAN" || !active) return null;
  return (
    <Badge className="mt-1" variant="default">
      À {state.currentAction === "BAN" ? "bannir" : "choisir"}
    </Badge>
  );
}

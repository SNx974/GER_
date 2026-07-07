"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { submitResult } from "./actions";
import type { SubmitResultValues } from "@/lib/validators/result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PlayerLite = { id: string; pseudo: string };
export type MapLite = { matchMapId: string; mapName: string; isDecider: boolean };

type Props = {
  token: string;
  maps: MapLite[];
  teamA: { name: string; players: PlayerLite[] };
  teamB: { name: string; players: PlayerLite[] };
};

type StatState = { kills: string; deaths: string; assists: string; score: string };
const EMPTY_STAT: StatState = { kills: "0", deaths: "0", assists: "0", score: "0" };

export function ResultForm({ token, maps, teamA, teamB }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [screenshots, setScreenshots] = useState("");

  // scores[matchMapId] = { a, b }
  const [scores, setScores] = useState<Record<string, { a: string; b: string }>>(
    Object.fromEntries(maps.map((m) => [m.matchMapId, { a: "0", b: "0" }]))
  );

  // stats[matchMapId][playerId] = StatState
  const allPlayers = [...teamA.players, ...teamB.players];
  const [stats, setStats] = useState<
    Record<string, Record<string, StatState>>
  >(
    Object.fromEntries(
      maps.map((m) => [
        m.matchMapId,
        Object.fromEntries(allPlayers.map((p) => [p.id, { ...EMPTY_STAT }])),
      ])
    )
  );

  function setScore(mapId: string, side: "a" | "b", value: string) {
    setScores((prev) => ({ ...prev, [mapId]: { ...prev[mapId]!, [side]: value } }));
  }

  function setStat(
    mapId: string,
    playerId: string,
    field: keyof StatState,
    value: string
  ) {
    setStats((prev) => ({
      ...prev,
      [mapId]: {
        ...prev[mapId]!,
        [playerId]: { ...prev[mapId]![playerId]!, [field]: value },
      },
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: SubmitResultValues = {
      screenshots: screenshots
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean),
      maps: maps.map((m) => ({
        matchMapId: m.matchMapId,
        scoreA: Number(scores[m.matchMapId]!.a),
        scoreB: Number(scores[m.matchMapId]!.b),
        stats: allPlayers.map((p) => {
          const s = stats[m.matchMapId]![p.id]!;
          return {
            playerId: p.id,
            kills: Number(s.kills),
            deaths: Number(s.deaths),
            assists: Number(s.assists),
            score: Number(s.score),
          };
        }),
      })),
    };

    startTransition(async () => {
      const res = await submitResult(token, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      {maps.map((m, i) => (
        <div key={m.matchMapId} className="rounded-lg border p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">
              Map {i + 1} — {m.mapName}
              {m.isDecider && (
                <span className="ml-2 text-xs text-emerald-500">(Decider)</span>
              )}
            </h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Score</span>
              <Input
                type="number"
                min={0}
                className="w-16"
                value={scores[m.matchMapId]!.a}
                onChange={(e) => setScore(m.matchMapId, "a", e.target.value)}
                aria-label={`Score ${teamA.name}`}
              />
              <span>–</span>
              <Input
                type="number"
                min={0}
                className="w-16"
                value={scores[m.matchMapId]!.b}
                onChange={(e) => setScore(m.matchMapId, "b", e.target.value)}
                aria-label={`Score ${teamB.name}`}
              />
            </div>
          </div>

          <StatTable
            teamName={teamA.name}
            players={teamA.players}
            mapId={m.matchMapId}
            stats={stats}
            onChange={setStat}
          />
          <div className="mt-4">
            <StatTable
              teamName={teamB.name}
              players={teamB.players}
              mapId={m.matchMapId}
              stats={stats}
              onChange={setStat}
            />
          </div>
        </div>
      ))}

      <div className="space-y-2">
        <Label htmlFor="screenshots">
          Screenshots des tableaux des scores (URLs, une par ligne)
        </Label>
        <textarea
          id="screenshots"
          value={screenshots}
          onChange={(e) => setScreenshots(e.target.value)}
          rows={3}
          placeholder="https://i.imgur.com/xxxx.png"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Ces images seront analysées par l&apos;IA pour détecter d&apos;éventuelles
          anomalies.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        <Send /> {pending ? "Envoi & analyse IA…" : "Soumettre le résultat"}
      </Button>
    </form>
  );
}

function StatTable({
  teamName,
  players,
  mapId,
  stats,
  onChange,
}: {
  teamName: string;
  players: PlayerLite[];
  mapId: string;
  stats: Record<string, Record<string, StatState>>;
  onChange: (
    mapId: string,
    playerId: string,
    field: keyof StatState,
    value: string
  ) => void;
}) {
  if (players.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {teamName} — aucun joueur enregistré.
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 text-sm font-medium">{teamName}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left font-normal">Joueur</th>
              <th className="w-16 font-normal">K</th>
              <th className="w-16 font-normal">D</th>
              <th className="w-16 font-normal">A</th>
              <th className="w-20 font-normal">Score</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const s = stats[mapId]![p.id]!;
              return (
                <tr key={p.id}>
                  <td className="py-1 pr-2">{p.pseudo}</td>
                  {(["kills", "deaths", "assists", "score"] as const).map(
                    (field) => (
                      <td key={field} className="py-1 pr-1">
                        <Input
                          type="number"
                          min={0}
                          className="h-8"
                          value={s[field]}
                          onChange={(e) =>
                            onChange(mapId, p.id, field, e.target.value)
                          }
                        />
                      </td>
                    )
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

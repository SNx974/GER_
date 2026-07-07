"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, Upload, X } from "lucide-react";
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

type ExtractedStat = {
  playerId: string;
  kills: number;
  deaths: number;
  assists: number;
  score: number;
};

export function ResultForm({ token, maps, teamA, teamB }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [extracting, setExtracting] = useState<Record<string, boolean>>({});
  const [extractMsg, setExtractMsg] = useState<Record<string, string>>({});

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

  async function uploadFiles(files: FileList | File[]) {
    setUploadError(null);
    const remaining = Math.max(0, 10 - screenshots.length);
    const list = Array.from(files).slice(0, remaining);
    if (list.length === 0) return;

    setUploading(true);
    try {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setUploadError(data.error ?? "Échec de l'envoi du fichier.");
          continue;
        }
        const data = (await res.json()) as { url: string };
        setScreenshots((prev) => [...prev, data.url]);
      }
    } finally {
      setUploading(false);
    }
  }

  function removeScreenshot(url: string) {
    setScreenshots((prev) => prev.filter((u) => u !== url));
  }

  async function extractForMap(mapId: string) {
    if (screenshots.length === 0) {
      setExtractMsg((m) => ({
        ...m,
        [mapId]: "Ajoutez au moins un screenshot avant d'extraire.",
      }));
      return;
    }
    setExtracting((s) => ({ ...s, [mapId]: true }));
    setExtractMsg((m) => ({ ...m, [mapId]: "" }));

    try {
      const res = await fetch(`/api/match/${token}/result/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ screenshots }),
      });
      const data = (await res.json()) as {
        stats?: ExtractedStat[];
        found?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setExtractMsg((m) => ({ ...m, [mapId]: data.error ?? "Extraction impossible." }));
        return;
      }
      if (!data.stats || data.stats.length === 0) {
        setExtractMsg((m) => ({
          ...m,
          [mapId]:
            "L'IA n'a détecté aucune statistique exploitable — merci de saisir les scores manuellement.",
        }));
        return;
      }

      setStats((prev) => {
        const next = { ...prev };
        const mapStats = { ...next[mapId]! };
        for (const s of data.stats!) {
          if (mapStats[s.playerId]) {
            mapStats[s.playerId] = {
              kills: String(s.kills),
              deaths: String(s.deaths),
              assists: String(s.assists),
              score: String(s.score),
            };
          }
        }
        next[mapId] = mapStats;
        return next;
      });
      setExtractMsg((m) => ({
        ...m,
        [mapId]: `${data.stats!.length} joueur(s) rempli(s) automatiquement — vérifiez avant d'envoyer.`,
      }));
    } catch {
      setExtractMsg((m) => ({ ...m, [mapId]: "Erreur réseau pendant l'extraction." }));
    } finally {
      setExtracting((s) => ({ ...s, [mapId]: false }));
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: SubmitResultValues = {
      screenshots,
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
      <div className="space-y-3">
        <Label>Screenshots des tableaux des scores</Label>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <Upload className="h-6 w-6" />
          <p>
            Glissez-déposez vos screenshots ici, ou cliquez pour parcourir
            votre PC.
          </p>
          <p className="text-xs">PNG, JPG, WEBP — 8 Mo max par fichier</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {uploading && (
          <p className="text-sm text-muted-foreground">Envoi en cours…</p>
        )}
        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}

        {screenshots.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {screenshots.map((url) => (
              <div
                key={url}
                className="group relative h-24 w-24 overflow-hidden rounded-md border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Screenshot" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeScreenshot(url)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  aria-label="Retirer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Ces images seront analysées par l&apos;IA pour détecter d&apos;éventuelles
          anomalies, et peuvent servir à pré-remplir les statistiques
          ci-dessous.
        </p>
      </div>

      {maps.map((m, i) => (
        <div key={m.matchMapId} className="rounded-lg border p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => extractForMap(m.matchMapId)}
              disabled={extracting[m.matchMapId]}
            >
              <Sparkles className="h-4 w-4" />
              {extracting[m.matchMapId] ? "Analyse…" : "Extraire avec l'IA"}
            </Button>
          </div>
          {extractMsg[m.matchMapId] && (
            <p className="mb-3 text-xs text-muted-foreground">
              {extractMsg[m.matchMapId]}
            </p>
          )}

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

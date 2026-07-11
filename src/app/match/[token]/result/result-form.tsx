"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Upload, X } from "lucide-react";
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
  myTeam: { name: string; players: PlayerLite[] };
  opponentTeamName: string;
  /** Position de mon équipe dans le match — détermine où placer mon score (scoreA/scoreB). */
  myLetter: "A" | "B";
};

type StatState = { kills: string; deaths: string; assists: string; score: string };
const EMPTY_STAT: StatState = { kills: "0", deaths: "0", assists: "0", score: "0" };

export function ResultForm({ token, maps, myTeam, opponentTeamName, myLetter }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // scores[matchMapId] = { my, opponent }
  const [scores, setScores] = useState<Record<string, { my: string; opponent: string }>>(
    Object.fromEntries(maps.map((m) => [m.matchMapId, { my: "0", opponent: "0" }]))
  );

  // stats[matchMapId][playerId] = StatState — uniquement mes propres joueurs
  const [stats, setStats] = useState<Record<string, Record<string, StatState>>>(
    Object.fromEntries(
      maps.map((m) => [
        m.matchMapId,
        Object.fromEntries(myTeam.players.map((p) => [p.id, { ...EMPTY_STAT }])),
      ])
    )
  );

  function setScore(mapId: string, side: "my" | "opponent", value: string) {
    setScores((prev) => ({ ...prev, [mapId]: { ...prev[mapId]!, [side]: value } }));
  }

  function setStat(mapId: string, playerId: string, field: keyof StatState, value: string) {
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: SubmitResultValues = {
      screenshots,
      maps: maps.map((m) => {
        const s = scores[m.matchMapId]!;
        const scoreA = myLetter === "A" ? s.my : s.opponent;
        const scoreB = myLetter === "A" ? s.opponent : s.my;
        return {
          matchMapId: m.matchMapId,
          scoreA: Number(scoreA),
          scoreB: Number(scoreB),
          stats: myTeam.players.map((p) => {
            const st = stats[m.matchMapId]![p.id]!;
            return {
              playerId: p.id,
              kills: Number(st.kills),
              deaths: Number(st.deaths),
              assists: Number(st.assists),
              score: Number(st.score),
            };
          }),
        };
      }),
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
      <p className="text-sm text-muted-foreground">
        Saisissez uniquement le score et les statistiques de{" "}
        <strong>{myTeam.name}</strong>. {opponentTeamName} soumettra les
        siennes séparément.
      </p>

      <div className="space-y-3">
        <Label>Screenshot (optionnel)</Label>
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
            Glissez-déposez le tableau des scores de votre équipe, ou cliquez
            pour parcourir votre PC.
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

        {uploading && <p className="text-sm text-muted-foreground">Envoi en cours…</p>}
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
          Sert de preuve pour l&apos;admin en cas de litige — pas d&apos;analyse
          automatique.
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
              <span className="text-muted-foreground">{myTeam.name}</span>
              <Input
                type="number"
                min={0}
                className="w-16"
                value={scores[m.matchMapId]!.my}
                onChange={(e) => setScore(m.matchMapId, "my", e.target.value)}
                aria-label={`Score ${myTeam.name}`}
              />
              <span>–</span>
              <Input
                type="number"
                min={0}
                className="w-16"
                value={scores[m.matchMapId]!.opponent}
                onChange={(e) => setScore(m.matchMapId, "opponent", e.target.value)}
                aria-label={`Score ${opponentTeamName}`}
              />
              <span className="text-muted-foreground">{opponentTeamName}</span>
            </div>
          </div>

          <StatTable
            teamName={myTeam.name}
            players={myTeam.players}
            mapId={m.matchMapId}
            stats={stats}
            onChange={setStat}
          />
        </div>
      ))}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        <Send /> {pending ? "Envoi…" : "Soumettre mon résultat"}
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
                  {(["kills", "deaths", "assists", "score"] as const).map((field) => (
                    <td key={field} className="py-1 pr-1">
                      <Input
                        type="number"
                        min={0}
                        className="h-8"
                        value={s[field]}
                        onChange={(e) => onChange(mapId, p.id, field, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

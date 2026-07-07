"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { updateMaxPlayers, updateMinPlayers } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsForm({
  initialMax,
  initialMin,
}: {
  initialMax: number;
  initialMin: number;
}) {
  const [max, setMax] = useState(String(initialMax));
  const [min, setMin] = useState(String(initialMin));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { type: "ok" | "error"; text: string } | null
  >(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const maxValue = Number(max);
    const minValue = Number(min);

    startTransition(async () => {
      const [resMax, resMin] = await Promise.all([
        updateMaxPlayers(maxValue),
        updateMinPlayers(minValue),
      ]);
      if (!resMax.ok) {
        setMessage({ type: "error", text: resMax.error });
        return;
      }
      if (!resMin.ok) {
        setMessage({ type: "error", text: resMin.error });
        return;
      }
      setMessage({ type: "ok", text: "Réglages mis à jour pour toutes les équipes." });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="maxPlayers">Nombre maximum de joueurs par équipe</Label>
        <Input
          id="maxPlayers"
          type="number"
          min={1}
          max={50}
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="max-w-[160px]"
        />
        <p className="text-xs text-muted-foreground">
          S&apos;applique à toutes les équipes. Les effectifs existants
          dépassant la limite ne sont pas supprimés, mais aucun ajout ne sera
          possible tant qu&apos;ils sont au-dessus.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="minPlayers">
          Nombre minimum de joueurs actifs pour jouer un match
        </Label>
        <Input
          id="minPlayers"
          type="number"
          min={1}
          max={20}
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="max-w-[160px]"
        />
        <p className="text-xs text-muted-foreground">
          Une équipe ne peut proposer ou accepter un match que si elle compte
          au moins ce nombre de joueurs actifs.
        </p>
      </div>

      {message && (
        <p
          className={
            message.type === "ok"
              ? "text-sm text-emerald-500"
              : "text-sm text-destructive"
          }
        >
          {message.text}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        <Save /> {pending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}

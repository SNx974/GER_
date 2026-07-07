"use client";

import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { updateMaxPlayers } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsForm({ initialMax }: { initialMax: number }) {
  const [value, setValue] = useState(String(initialMax));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { type: "ok" | "error"; text: string } | null
  >(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const parsed = Number(value);
    startTransition(async () => {
      const res = await updateMaxPlayers(parsed);
      setMessage(
        res.ok
          ? { type: "ok", text: "Limite mise à jour pour toutes les équipes." }
          : { type: "error", text: res.error }
      );
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
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="max-w-[160px]"
        />
        <p className="text-xs text-muted-foreground">
          S&apos;applique à toutes les équipes. Les effectifs existants
          dépassant la limite ne sont pas supprimés, mais aucun ajout ne sera
          possible tant qu&apos;ils sont au-dessus.
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

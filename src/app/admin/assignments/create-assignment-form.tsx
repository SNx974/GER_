"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { createAssignment } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TeamOption = { id: string; name: string; tag: string | null };

export function CreateAssignmentForm({ teams }: { teams: TeamOption[] }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    teamAId: "",
    teamBId: "",
    format: "BO1" as "BO1" | "BO3" | "BO5",
    windowStart: "",
    windowEnd: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    // Conversion en ISO côté navigateur (qui connaît le vrai fuseau de
    // l'admin) avant l'envoi — sinon le serveur réinterprète la chaîne
    // naïve du datetime-local dans son propre fuseau (souvent UTC).
    const payload = {
      ...form,
      windowStart: new Date(form.windowStart).toISOString(),
      windowEnd: new Date(form.windowEnd).toISOString(),
    };
    startTransition(async () => {
      const res = await createAssignment(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setMessage("Match attribué — les deux équipes ont été notifiées.");
      setForm({ teamAId: "", teamBId: "", format: "BO1", windowStart: "", windowEnd: "" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="teamA">Équipe A</Label>
          <select
            id="teamA"
            value={form.teamAId}
            onChange={(e) => setForm((f) => ({ ...f, teamAId: e.target.value }))}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Choisir —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.tag ? ` [${t.tag}]` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="teamB">Équipe B</Label>
          <select
            id="teamB"
            value={form.teamBId}
            onChange={(e) => setForm((f) => ({ ...f, teamBId: e.target.value }))}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Choisir —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.tag ? ` [${t.tag}]` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="format">Format</Label>
        <select
          id="format"
          value={form.format}
          onChange={(e) => setForm((f) => ({ ...f, format: e.target.value as "BO1" | "BO3" | "BO5" }))}
          className="flex h-10 w-full max-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="BO1">BO1</option>
          <option value="BO3">BO3</option>
          <option value="BO5">BO5</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="windowStart">Début de la fenêtre</Label>
          <Input
            id="windowStart"
            type="datetime-local"
            value={form.windowStart}
            onChange={(e) => setForm((f) => ({ ...f, windowStart: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="windowEnd">Fin de la fenêtre</Label>
          <Input
            id="windowEnd"
            type="datetime-local"
            value={form.windowEnd}
            onChange={(e) => setForm((f) => ({ ...f, windowEnd: e.target.value }))}
            required
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Ex : du 11 juillet 00:00 au 13 juillet 23:59 — les équipes devront
        trouver une date/heure précise dans cet intervalle.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-emerald-500">{message}</p>}

      <Button type="submit" disabled={pending}>
        <Send /> {pending ? "Envoi…" : "Attribuer le match"}
      </Button>
    </form>
  );
}

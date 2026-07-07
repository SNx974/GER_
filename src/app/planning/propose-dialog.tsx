"use client";

import { useState, useTransition } from "react";
import { Swords } from "lucide-react";
import { createProposal } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type OpponentOption = { id: string; name: string; tag: string | null };

export function ProposeDialog({ opponents }: { opponents: OpponentOption[] }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    opponentTeamId: "",
    proposedDate: "",
    format: "BO1" as "BO1" | "BO3" | "BO5",
    message: "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // Le champ datetime-local renvoie une heure "naïve" (sans fuseau).
      // On la convertit en ISO ici, dans le navigateur, qui connaît le vrai
      // fuseau de l'utilisateur — sinon le serveur la réinterprète dans le
      // sien (souvent UTC), ce qui décale l'heure du match.
      const payload = {
        ...form,
        proposedDate: new Date(form.proposedDate).toISOString(),
      };
      const res = await createProposal(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setForm({ opponentTeamId: "", proposedDate: "", format: "BO1", message: "" });
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={opponents.length === 0}>
          <Swords /> Proposer un match
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Proposer un match</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="opponent">Adversaire</Label>
              <select
                id="opponent"
                value={form.opponentTeamId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, opponentTeamId: e.target.value }))
                }
                required
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— Choisir une équipe —</option>
                {opponents.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.tag ? ` [${o.tag}]` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date et heure</Label>
              <Input
                id="date"
                type="datetime-local"
                value={form.proposedDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, proposedDate: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="format">Format</Label>
              <select
                id="format"
                value={form.format}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    format: e.target.value as "BO1" | "BO3" | "BO5",
                  }))
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="BO1">BO1</option>
                <option value="BO3">BO3</option>
                <option value="BO5">BO5</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message (optionnel)</Label>
              <Input
                id="message"
                value={form.message}
                onChange={(e) =>
                  setForm((f) => ({ ...f, message: e.target.value }))
                }
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Envoi…" : "Envoyer la proposition"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Trash2 } from "lucide-react";
import { addAvailability, deleteAvailability } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type AvailabilityRow = {
  id: string;
  startTime: string; // ISO
  endTime: string; // ISO
  status: "AVAILABLE" | "UNAVAILABLE";
  note: string | null;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AvailabilityManager({ items }: { items: AvailabilityRow[] }) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    startTime: "",
    endTime: "",
    status: "AVAILABLE" as "AVAILABLE" | "UNAVAILABLE",
    note: "",
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      // cf. propose-dialog.tsx : conversion en ISO côté navigateur pour ne
      // pas laisser le serveur réinterpréter l'heure dans son propre fuseau.
      const payload = {
        ...form,
        startTime: new Date(form.startTime).toISOString(),
        endTime: new Date(form.endTime).toISOString(),
      };
      const res = await addAvailability(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setForm({ startTime: "", endTime: "", status: "AVAILABLE", note: "" });
      setOpen(false);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteAvailability(id);
      if (!res.ok) alert(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <CalendarPlus /> Ajouter un créneau
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>Nouveau créneau</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="start">Début</Label>
                  <Input
                    id="start"
                    type="datetime-local"
                    value={form.startTime}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, startTime: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">Fin</Label>
                  <Input
                    id="end"
                    type="datetime-local"
                    value={form.endTime}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, endTime: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Statut</Label>
                  <select
                    id="status"
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status: e.target.value as "AVAILABLE" | "UNAVAILABLE",
                      }))
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="AVAILABLE">Disponible</option>
                    <option value="UNAVAILABLE">Indisponible</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="note">Note (optionnel)</Label>
                  <Input
                    id="note"
                    value={form.note}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, note: e.target.value }))
                    }
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? "Ajout…" : "Ajouter"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun créneau défini. Ajoutez vos disponibilités et indisponibilités.
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <Badge variant={a.status === "AVAILABLE" ? "success" : "destructive"}>
                  {a.status === "AVAILABLE" ? "Dispo" : "Indispo"}
                </Badge>
                <div className="text-sm">
                  <div>
                    {fmt(a.startTime)} → {fmt(a.endTime)}
                  </div>
                  {a.note && (
                    <div className="text-xs text-muted-foreground">{a.note}</div>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(a.id)}
                disabled={pending}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

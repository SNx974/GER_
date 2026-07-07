"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { addMap, setMapActive, deleteMap } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export type MapRow = {
  id: string;
  name: string;
  imageUrl: string | null;
  isActive: boolean;
};

export function MapManager({ maps }: { maps: MapRow[] }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", imageUrl: "" });
  const [error, setError] = useState<string | null>(null);

  const activeCount = maps.filter((m) => m.isActive).length;

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addMap(form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setForm({ name: "", imageUrl: "" });
    });
  }

  function toggle(m: MapRow) {
    startTransition(async () => {
      const res = await setMapActive(m.id, !m.isActive);
      if (!res.ok) alert(res.error);
    });
  }

  function remove(m: MapRow) {
    if (!confirm(`Supprimer définitivement la map « ${m.name} » ?`)) return;
    startTransition(async () => {
      const res = await deleteMap(m.id);
      if (!res.ok) alert(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor="map-name">Nom de la map</Label>
          <Input
            id="map-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Ascent"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="map-img">Image (URL, optionnel)</Label>
          <Input
            id="map-img"
            value={form.imageUrl}
            onChange={(e) =>
              setForm((f) => ({ ...f, imageUrl: e.target.value }))
            }
            placeholder="https://…"
            className="w-64"
          />
        </div>
        <Button type="submit" disabled={pending}>
          <Plus /> Ajouter
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <p className="text-sm text-muted-foreground">
        {activeCount} map(s) active(s) dans le pool de mapban.
      </p>

      {maps.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune map.</p>
      ) : (
        <ul className="divide-y">
          {maps.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-3">
                <span className="font-medium">{m.name}</span>
                {m.isActive ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggle(m)}
                  disabled={pending}
                >
                  {m.isActive ? (
                    <>
                      <EyeOff /> Désactiver
                    </>
                  ) : (
                    <>
                      <Eye /> Activer
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(m)}
                  disabled={pending}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

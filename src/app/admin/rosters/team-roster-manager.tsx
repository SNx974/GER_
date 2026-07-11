"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { adminAddPlayer, adminDeletePlayer, adminUpdatePlayer } from "../actions";
import { PLAYER_ROLES, type PlayerInput } from "@/lib/validators/player";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type PlayerRow = {
  id: string;
  pseudo: string;
  gameId: string | null;
  role: string | null;
};

type Props = {
  teamId: string;
  teamName: string;
  teamTag: string | null;
  players: PlayerRow[];
  maxPlayers: number;
};

const EMPTY: PlayerInput = { pseudo: "", gameId: "", role: "" };

export function TeamRosterManager({ teamId, teamName, teamTag, players, maxPlayers }: Props) {
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlayerRow | null>(null);
  const [form, setForm] = useState<PlayerInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const atLimit = players.length >= maxPlayers;

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(p: PlayerRow) {
    setEditing(p);
    setForm({ pseudo: p.pseudo, gameId: p.gameId ?? "", role: p.role ?? "" });
    setError(null);
    setDialogOpen(true);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = editing
        ? await adminUpdatePlayer(editing.id, form)
        : await adminAddPlayer(teamId, form);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDialogOpen(false);
    });
  }

  function remove(p: PlayerRow) {
    if (!confirm(`Retirer ${p.pseudo} de ${teamName} ?`)) return;
    startTransition(async () => {
      const res = await adminDeletePlayer(p.id);
      if (!res.ok) alert(res.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base">
            {teamName}
            {teamTag ? ` [${teamTag}]` : ""}
          </CardTitle>
          <CardDescription>
            {players.length} / {maxPlayers} joueurs
          </CardDescription>
        </div>
        <Button size="sm" onClick={openAdd} disabled={atLimit || pending}>
          <UserPlus /> Ajouter
        </Button>
      </CardHeader>
      <CardContent>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun joueur.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pseudo</TableHead>
                <TableHead>ID en jeu</TableHead>
                <TableHead>Rôle</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.pseudo}</TableCell>
                  <TableCell className="text-muted-foreground">{p.gameId ?? "—"}</TableCell>
                  <TableCell>
                    {p.role ? <Badge variant="secondary">{p.role}</Badge> : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)} disabled={pending}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(p)} disabled={pending}>
                        <Trash2 className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {editing ? "Modifier le joueur" : `Ajouter un joueur à ${teamName}`}
              </DialogTitle>
              <DialogDescription>Renseignez les informations du joueur.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor={`pseudo-${teamId}`}>Pseudo *</Label>
                <Input
                  id={`pseudo-${teamId}`}
                  value={form.pseudo}
                  onChange={(e) => setForm((f) => ({ ...f, pseudo: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`gameId-${teamId}`}>ID en jeu (Riot ID…)</Label>
                <Input
                  id={`gameId-${teamId}`}
                  value={form.gameId}
                  onChange={(e) => setForm((f) => ({ ...f, gameId: e.target.value }))}
                  placeholder="Player#EUW"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`role-${teamId}`}>Rôle</Label>
                <select
                  id={`role-${teamId}`}
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— Aucun —</option>
                  {PLAYER_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? "Enregistrement…" : editing ? (
                  <>
                    <Pencil /> Enregistrer
                  </>
                ) : (
                  <>
                    <Plus /> Ajouter
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

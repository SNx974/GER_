"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { createAdmin } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateAdminForm() {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState<
    { type: "ok" | "error"; text: string } | null
  >(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const res = await createAdmin(form);
      if (!res.ok) {
        setMessage({ type: "error", text: res.error });
        return;
      }
      setMessage({ type: "ok", text: "Nouvel administrateur créé." });
      setForm({ name: "", email: "", password: "" });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="admin-name">Nom</Label>
          <Input
            id="admin-name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-email">Email</Label>
          <Input
            id="admin-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="admin-password">Mot de passe</Label>
        <Input
          id="admin-password"
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          required
        />
        <p className="text-xs text-muted-foreground">
          8 caractères min., une majuscule et un chiffre.
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
        <UserPlus /> {pending ? "Création…" : "Créer l'administrateur"}
      </Button>
    </form>
  );
}

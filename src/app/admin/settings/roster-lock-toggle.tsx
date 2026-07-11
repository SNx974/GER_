"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Lock, Unlock } from "lucide-react";
import { updateRosterLocked } from "../actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function RosterLockToggle({ initialLocked }: { initialLocked: boolean }) {
  const [locked, setLocked] = useState(initialLocked);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !locked;
    setError(null);
    startTransition(async () => {
      const res = await updateRosterLocked(next);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setLocked(next);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Badge variant={locked ? "destructive" : "success"}>
          {locked ? "Verrouillé" : "Déverrouillé"}
        </Badge>
        <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
          {locked ? (
            <>
              <Unlock /> Déverrouiller
            </>
          ) : (
            <>
              <Lock /> Verrouiller
            </>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Quand c&apos;est verrouillé, les capitaines ne peuvent plus ajouter,
        modifier ou supprimer de joueurs. Vous gardez la main via{" "}
        <Link href="/admin/rosters" className="underline">
          la gestion des effectifs
        </Link>
        .
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Trash2 } from "lucide-react";
import { cancelMatch, deleteMatch } from "../actions";
import { Button } from "@/components/ui/button";

export function AdminMatchActions({
  matchId,
  status,
}: {
  matchId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function cancel() {
    if (!confirm("Annuler ce match ?")) return;
    startTransition(async () => {
      const res = await cancelMatch(matchId);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  function remove() {
    const extra =
      status === "COMPLETED"
        ? " Ce match est validé : son impact sur le classement (points, V/D, stats joueurs) sera annulé."
        : "";
    if (!confirm(`Supprimer définitivement ce match ?${extra}`)) return;
    startTransition(async () => {
      const res = await deleteMatch(matchId);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="ml-auto flex gap-2">
      {status !== "COMPLETED" && status !== "CANCELLED" && (
        <Button size="sm" variant="outline" onClick={cancel} disabled={pending}>
          <Ban /> Annuler
        </Button>
      )}
      <Button size="sm" variant="destructive" onClick={remove} disabled={pending}>
        <Trash2 /> Supprimer
      </Button>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { Check, X, Ban } from "lucide-react";
import { respondProposal, cancelProposal } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export type ReceivedProposal = {
  id: string;
  fromTeam: string;
  proposedDate: string;
  format: string;
  message: string | null;
};

export type SentProposal = {
  id: string;
  toTeam: string;
  proposedDate: string;
  format: string;
  status: string;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "success" | "destructive" }> = {
  PENDING: { label: "En attente", variant: "secondary" },
  ACCEPTED: { label: "Acceptée", variant: "success" },
  REFUSED: { label: "Refusée", variant: "destructive" },
  CANCELLED: { label: "Annulée", variant: "secondary" },
};

export function ProposalsPanel({
  received,
  sent,
}: {
  received: ReceivedProposal[];
  sent: SentProposal[];
}) {
  const [pending, startTransition] = useTransition();

  function respond(id: string, accept: boolean) {
    startTransition(async () => {
      const res = await respondProposal(id, accept);
      if (!res.ok) alert(res.error);
    });
  }

  function cancel(id: string) {
    startTransition(async () => {
      const res = await cancelProposal(id);
      if (!res.ok) alert(res.error);
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Reçues
        </h3>
        {received.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune proposition reçue.</p>
        ) : (
          <ul className="space-y-3">
            {received.map((p) => (
              <li key={p.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.fromTeam}</span>
                  <Badge variant="outline">{p.format}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {fmt(p.proposedDate)}
                </div>
                {p.message && (
                  <p className="mt-1 text-sm italic text-muted-foreground">
                    « {p.message} »
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => respond(p.id, true)}
                    disabled={pending}
                  >
                    <Check /> Accepter
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respond(p.id, false)}
                    disabled={pending}
                  >
                    <X /> Refuser
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
          Envoyées
        </h3>
        {sent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune proposition envoyée.</p>
        ) : (
          <ul className="space-y-3">
            {sent.map((p) => {
              const st = STATUS_LABEL[p.status] ?? STATUS_LABEL.PENDING!;
              return (
                <li key={p.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.toTeam}</span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {fmt(p.proposedDate)} · {p.format}
                  </div>
                  {p.status === "PENDING" && (
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      onClick={() => cancel(p.id)}
                      disabled={pending}
                    >
                      <Ban /> Annuler
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

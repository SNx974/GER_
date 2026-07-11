"use client";

import { useState, useTransition } from "react";
import { Check, Send } from "lucide-react";
import { proposeAssignmentDate, acceptAssignmentDate } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AssignmentRow = {
  id: string;
  opponentName: string;
  format: string;
  windowStart: string;
  windowEnd: string;
  status: "PENDING" | "ESCALATED" | "AGREED" | "CANCELLED";
  proposedDate: string | null;
  proposedByMe: boolean;
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}

function toLocalInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function AssignmentCard({ a }: { a: AssignmentRow }) {
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(() => toLocalInputValue(new Date(a.windowStart)));
  const [error, setError] = useState<string | null>(null);

  function propose(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await proposeAssignmentDate({
        assignmentId: a.id,
        date: new Date(date).toISOString(),
      });
      if (!res.ok) setError(res.error);
    });
  }

  function accept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptAssignmentDate(a.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          vs {a.opponentName} · {a.format}
        </CardTitle>
        <Badge variant={a.status === "ESCALATED" ? "destructive" : "secondary"}>
          {a.status === "ESCALATED" ? "Signalé aux admins" : "À négocier"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Fenêtre : du {fmt(a.windowStart)} au {fmt(a.windowEnd)}
        </p>

        {a.proposedDate && (
          <p>
            {a.proposedByMe ? "Vous avez proposé" : "L'adversaire propose"} :{" "}
            <strong>{fmt(a.proposedDate)}</strong>
          </p>
        )}

        {a.proposedDate && !a.proposedByMe && (
          <Button size="sm" onClick={accept} disabled={pending}>
            <Check /> Accepter cette date
          </Button>
        )}

        <form onSubmit={propose} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label htmlFor={`date-${a.id}`} className="text-xs text-muted-foreground">
              {a.proposedDate ? "Proposer une autre date" : "Proposer une date"}
            </label>
            <Input
              id={`date-${a.id}`}
              type="datetime-local"
              value={date}
              min={toLocalInputValue(new Date(a.windowStart))}
              max={toLocalInputValue(new Date(a.windowEnd))}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending}>
            <Send /> Proposer
          </Button>
        </form>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export function AssignmentsPanel({ assignments }: { assignments: AssignmentRow[] }) {
  if (assignments.length === 0) return null;

  return (
    <div className="space-y-3">
      {assignments.map((a) => (
        <AssignmentCard key={a.id} a={a} />
      ))}
    </div>
  );
}

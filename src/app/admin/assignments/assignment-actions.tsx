"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { adminResolveAssignment, cancelAssignment } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AssignmentActions({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  function resolve() {
    if (!date) {
      setError("Choisissez une date.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await adminResolveAssignment(assignmentId, new Date(date).toISOString());
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function cancel() {
    if (!confirm("Annuler cette attribution ?")) return;
    startTransition(async () => {
      const res = await cancelAssignment(assignmentId);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-56"
        />
        <Button size="sm" onClick={resolve} disabled={pending}>
          <Check /> Imposer cette date
        </Button>
        <Button size="sm" variant="outline" onClick={cancel} disabled={pending}>
          <X /> Annuler l&apos;attribution
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

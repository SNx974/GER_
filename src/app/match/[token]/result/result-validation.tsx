"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, AlertTriangle } from "lucide-react";
import { validateResult } from "./actions";
import { Button } from "@/components/ui/button";

export function ResultValidation({
  matchId,
  canValidate,
}: {
  matchId: string;
  canValidate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (!canValidate) return null;

  function act(approve: boolean) {
    startTransition(async () => {
      const res = await validateResult(matchId, approve);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      <Button onClick={() => act(true)} disabled={pending}>
        <Check /> Valider le résultat
      </Button>
      <Button variant="outline" onClick={() => act(false)} disabled={pending}>
        <AlertTriangle /> Contester
      </Button>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ExternalLink, X } from "lucide-react";
import { validateResult } from "@/app/match/[token]/result/actions";
import { rejectResult } from "@/app/match/[token]/result/actions";
import { Button } from "@/components/ui/button";

export function AdminResultActions({
  matchId,
  token,
}: {
  matchId: string;
  token: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function validate() {
    startTransition(async () => {
      const res = await validateResult(matchId, true);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  function reject() {
    if (!confirm("Rejeter ce résultat ? Les équipes devront le resoumettre."))
      return;
    startTransition(async () => {
      const res = await rejectResult(matchId);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={validate} disabled={pending}>
        <Check /> Valider
      </Button>
      <Button size="sm" variant="outline" onClick={reject} disabled={pending}>
        <X /> Rejeter
      </Button>
      <Button asChild size="sm" variant="ghost">
        <Link href={`/match/${token}/result`}>
          <ExternalLink /> Détails
        </Link>
      </Button>
    </div>
  );
}

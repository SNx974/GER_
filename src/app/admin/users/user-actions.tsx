"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Trash2 } from "lucide-react";
import { deleteUser, adminSendPasswordReset } from "./actions";
import { Button } from "@/components/ui/button";

export function UserActions({
  userId,
  userLabel,
  isSelf,
}: {
  userId: string;
  userLabel: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function resetPassword() {
    startTransition(async () => {
      const res = await adminSendPasswordReset(userId);
      if (!res.ok) alert(res.error);
      else alert(`Email de réinitialisation envoyé à ${userLabel}.`);
    });
  }

  function remove() {
    if (!confirm(`Supprimer définitivement le compte de ${userLabel} ?`)) return;
    startTransition(async () => {
      const res = await deleteUser(userId);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="icon" onClick={resetPassword} disabled={pending} title="Réinitialiser le mot de passe">
        <KeyRound />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={remove}
        disabled={pending || isSelf}
        title={isSelf ? "Vous ne pouvez pas vous supprimer vous-même" : "Supprimer le compte"}
      >
        <Trash2 className="text-destructive" />
      </Button>
    </div>
  );
}

import { requireRole } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { ChatClient } from "./chat-client";

export const dynamic = "force-dynamic";

export default async function AdminChatPage() {
  await requireRole("ADMIN");

  return (
    <AppShell>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold">Tchat IA</h1>
          <p className="text-muted-foreground">
            Discutez librement avec l&apos;IA pour toute question ou demande.
          </p>
        </div>
        <ChatClient />
      </main>
    </AppShell>
  );
}

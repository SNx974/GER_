import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getMaxPlayersPerTeam, getRosterLocked } from "@/lib/settings";
import { AppShell } from "@/components/app-shell";
import { TeamRosterManager } from "./team-roster-manager";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AdminRostersPage() {
  await requireRole("ADMIN");

  const [teams, maxPlayers, locked] = await Promise.all([
    prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { players: { orderBy: { createdAt: "asc" } } },
    }),
    getMaxPlayersPerTeam(),
    getRosterLocked(),
  ]);

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Gestion des effectifs</h1>
            <p className="text-muted-foreground">
              Ajoutez, modifiez ou retirez des joueurs sur n&apos;importe quelle équipe.
            </p>
          </div>
          <Badge variant={locked ? "destructive" : "success"}>
            {locked ? "Verrouillé pour les capitaines" : "Déverrouillé"}
          </Badge>
        </div>

        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune équipe inscrite.</p>
        ) : (
          <div className="space-y-4">
            {teams.map((team) => (
              <TeamRosterManager
                key={team.id}
                teamId={team.id}
                teamName={team.name}
                teamTag={team.tag}
                players={team.players.map((p) => ({
                  id: p.id,
                  pseudo: p.pseudo,
                  gameId: p.gameId,
                  role: p.role,
                }))}
                maxPlayers={maxPlayers}
              />
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}

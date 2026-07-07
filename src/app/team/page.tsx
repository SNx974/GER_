import Link from "next/link";
import { redirect } from "next/navigation";
import { ExternalLink, Trophy } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getMaxPlayersPerTeam } from "@/lib/settings";
import { getTeamRank } from "@/lib/teams";
import { AppShell } from "@/components/app-shell";
import { PlayerManager } from "./player-manager";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function TeamManagementPage() {
  const session = await requireAuth();

  // Les admins n'ont pas d'équipe : on les renvoie vers leur espace
  if (session.user.role !== "CAPTAIN" || !session.user.teamId) {
    redirect("/dashboard");
  }

  const [team, maxPlayers, rankInfo] = await Promise.all([
    prisma.team.findUnique({
      where: { id: session.user.teamId },
      include: {
        players: { orderBy: { createdAt: "asc" } },
      },
    }),
    getMaxPlayersPerTeam(),
    getTeamRank(session.user.teamId),
  ]);

  if (!team) redirect("/dashboard");

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">
            {team.name}{" "}
            {team.tag && (
              <span className="text-muted-foreground">[{team.tag}]</span>
            )}
          </h1>
          <p className="text-muted-foreground">Gestion de votre équipe</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/teams/${team.id}`}>
            <ExternalLink /> Voir le profil public
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Classement</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <Trophy className="h-5 w-5 text-primary" />
              {rankInfo.rank ? `#${rankInfo.rank}` : "—"}
              <span className="text-sm font-normal text-muted-foreground">
                / {rankInfo.total}
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Points</CardDescription>
            <CardTitle className="text-2xl">{team.points}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bilan</CardDescription>
            <CardTitle className="text-2xl">
              {team.wins}
              <span className="text-emerald-500">V</span> · {team.losses}
              <span className="text-destructive">D</span>
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Effectif</CardTitle>
          <CardDescription>
            Ajoutez et gérez les joueurs de votre équipe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PlayerManager
            players={team.players.map((p) => ({
              id: p.id,
              pseudo: p.pseudo,
              gameId: p.gameId,
              role: p.role,
            }))}
            maxPlayers={maxPlayers}
          />
        </CardContent>
      </Card>
      </main>
    </AppShell>
  );
}

import { notFound } from "next/navigation";
import { Trophy, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getTeamRank, getTeamMatchHistory } from "@/lib/teams";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const dynamic = "force-dynamic";

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

const OUTCOME_LABEL: Record<string, { label: string; variant: "success" | "destructive" | "secondary" }> = {
  WIN: { label: "Victoire", variant: "success" },
  LOSS: { label: "Défaite", variant: "destructive" },
  DRAW: { label: "Nul", variant: "secondary" },
};

export default async function TeamProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      players: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!team) notFound();

  const [rankInfo, history] = await Promise.all([
    getTeamRank(team.id),
    getTeamMatchHistory(team.id),
  ]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      {/* En-tête équipe */}
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="h-16 w-16">
          {team.logoUrl && <AvatarImage src={team.logoUrl} alt={team.name} />}
          <AvatarFallback className="text-lg">
            {initials(team.tag ?? team.name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-3xl font-bold">
            {team.name}{" "}
            {team.tag && (
              <span className="text-muted-foreground">[{team.tag}]</span>
            )}
          </h1>
          {team.description && (
            <p className="max-w-xl text-muted-foreground">{team.description}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Fenêtre de classement */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" /> Classement
            </CardTitle>
            <CardDescription>Position actuelle au leaderboard</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-5xl font-extrabold text-primary">
                {rankInfo.rank ? `#${rankInfo.rank}` : "—"}
              </div>
              <div className="text-sm text-muted-foreground">
                sur {rankInfo.total} équipe(s)
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xl font-bold">{team.points}</div>
                <div className="text-xs text-muted-foreground">Points</div>
              </div>
              <div>
                <div className="text-xl font-bold text-emerald-500">
                  {team.wins}
                </div>
                <div className="text-xs text-muted-foreground">Victoires</div>
              </div>
              <div>
                <div className="text-xl font-bold text-destructive">
                  {team.losses}
                </div>
                <div className="text-xs text-muted-foreground">Défaites</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Effectif */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" /> Effectif ({team.players.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {team.players.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun joueur enregistré.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {team.players.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <Avatar>
                      {p.avatarUrl && (
                        <AvatarImage src={p.avatarUrl} alt={p.pseudo} />
                      )}
                      <AvatarFallback>{initials(p.pseudo)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.pseudo}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {p.role && <span>{p.role}</span>}
                        {p.gameId && <span className="truncate">{p.gameId}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Historique des matchs */}
      <Card>
        <CardHeader>
          <CardTitle>Historique des matchs</CardTitle>
          <CardDescription>Derniers matchs terminés</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun match joué pour l&apos;instant.
            </p>
          ) : (
            <ul className="divide-y">
              {history.map((h) => {
                const oc = OUTCOME_LABEL[h.outcome]!;
                return (
                  <li
                    key={h.matchId}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={oc.variant}>{oc.label}</Badge>
                      <span className="text-sm">
                        vs{" "}
                        <span className="font-medium">
                          {h.opponent.name}
                          {h.opponent.tag ? ` [${h.opponent.tag}]` : ""}
                        </span>
                      </span>
                      <Badge variant="outline">{h.format}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      {h.scoreFor !== null && h.scoreAgainst !== null && (
                        <span className="font-mono font-medium">
                          {h.scoreFor} – {h.scoreAgainst}
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {h.date.toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

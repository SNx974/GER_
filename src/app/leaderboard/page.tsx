import Link from "next/link";
import { Crosshair, Trophy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function kd(kills: number, deaths: number) {
  if (deaths === 0) return kills.toFixed(2);
  return (kills / deaths).toFixed(2);
}

export default async function LeaderboardPage() {
  const [teams, players] = await Promise.all([
    prisma.team.findMany({
      orderBy: [{ points: "desc" }, { wins: "desc" }, { name: "asc" }],
      take: 50,
    }),
    prisma.player.findMany({
      where: { matchesPlayed: { gt: 0 } },
      orderBy: [{ totalKills: "desc" }, { totalAssists: "desc" }],
      take: 50,
      include: { team: { select: { name: true, tag: true } } },
    }),
  ]);

  return (
    <AppShell>
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Classement</h1>
        <p className="text-muted-foreground">
          Mis à jour après chaque match validé.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Classement équipes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" /> Top équipes
            </CardTitle>
            <CardDescription>Par points, puis victoires</CardDescription>
          </CardHeader>
          <CardContent>
            {teams.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune équipe classée.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Équipe</TableHead>
                    <TableHead className="text-right">Pts</TableHead>
                    <TableHead className="text-right">V/D</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teams.map((t, i) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <RankBadge rank={i + 1} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={`/teams/${t.id}`}
                          className="hover:text-primary"
                        >
                          {t.name}
                          {t.tag ? ` [${t.tag}]` : ""}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {t.points}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {t.wins}/{t.losses}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Classement individuel — TOP KILLER */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crosshair className="h-5 w-5 text-primary" /> Top killers
            </CardTitle>
            <CardDescription>Meilleurs joueurs par kills</CardDescription>
          </CardHeader>
          <CardContent>
            {players.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune statistique joueur pour l&apos;instant.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Joueur</TableHead>
                    <TableHead className="text-right">Kills</TableHead>
                    <TableHead className="text-right">K/D</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {players.map((p, i) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <RankBadge rank={i + 1} />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{p.pseudo}</div>
                        <div className="text-xs text-muted-foreground">
                          {p.team.name}
                          {p.team.tag ? ` [${p.team.tag}]` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {p.totalKills}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {kd(p.totalKills, p.totalDeaths)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      </main>
    </AppShell>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const colors = ["bg-yellow-500", "bg-slate-400", "bg-amber-700"];
    return (
      <Badge className={`${colors[rank - 1]} text-white`}>{rank}</Badge>
    );
  }
  return <span className="text-muted-foreground">{rank}</span>;
}

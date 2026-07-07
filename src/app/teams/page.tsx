import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default async function TeamsDirectoryPage() {
  const teams = await prisma.team.findMany({
    orderBy: [{ points: "desc" }, { wins: "desc" }, { name: "asc" }],
    include: { _count: { select: { players: true } } },
  });

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Équipes</h1>
        <p className="text-muted-foreground">
          Toutes les équipes inscrites, classées par points.
        </p>
      </div>

      {teams.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune équipe inscrite pour l&apos;instant.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((team, i) => (
            <Link key={team.id} href={`/teams/${team.id}`}>
              <Card className="transition-colors hover:border-primary">
                <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                  <span className="w-6 text-center text-lg font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <Avatar>
                    {team.logoUrl && (
                      <AvatarImage src={team.logoUrl} alt={team.name} />
                    )}
                    <AvatarFallback>
                      {initials(team.tag ?? team.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-base">
                      {team.name}
                      {team.tag && (
                        <span className="ml-1 text-muted-foreground">
                          [{team.tag}]
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription>
                      {team._count.players} joueur(s)
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{team.points} pts</Badge>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
      </main>
    </AppShell>
  );
}

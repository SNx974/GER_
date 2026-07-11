import Link from "next/link";
import { Bot, ClipboardCheck, Settings, Users } from "lucide-react";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const session = await requireAuth();
  const { role, name, teamId } = session.user;

  const team = teamId
    ? await prisma.team.findUnique({
        where: { id: teamId },
        include: { _count: { select: { players: true } } },
      })
    : null;

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Bonjour {name} 👋</h1>
          <p className="text-muted-foreground">
            Connecté en tant que{" "}
            <span className="font-medium text-foreground">
              {role === "ADMIN" ? "Administrateur" : "Capitaine"}
            </span>
          </p>
        </div>

      {role === "CAPTAIN" && team && (
        <Card>
          <CardHeader>
            <CardTitle>{team.name}</CardTitle>
            <CardDescription>
              {team.tag ? `[${team.tag}] · ` : ""}
              {team._count.players} joueur(s) · {team.points} pts · {team.wins}V
              /{team.losses}D
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Gérez votre effectif, votre profil et bientôt votre planning.
          </CardContent>
          <CardFooter className="gap-2">
            <Button asChild size="sm">
              <Link href="/team">
                <Users /> Gérer mon équipe
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/teams">Voir les équipes</Link>
            </Button>
          </CardFooter>
        </Card>
      )}

      {role === "ADMIN" && (
        <Card>
          <CardHeader>
            <CardTitle>Espace administrateur</CardTitle>
            <CardDescription>
              Gestion globale : comptes admins, limite de joueurs, modération.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ajustez les réglages globaux (limite de joueurs) et consultez les
            équipes.
          </CardContent>
          <CardFooter className="flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/admin/results">
                <ClipboardCheck /> Résultats à valider
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/matches">Tous les matchs</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/assignments">Attribuer un match</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/maps">Pool de maps</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/rosters">
                <Users /> Effectifs
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/users">Comptes</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/chat">
                <Bot /> Tchat IA
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/settings">
                <Settings /> Paramètres
              </Link>
            </Button>
          </CardFooter>
        </Card>
      )}
      </main>
    </AppShell>
  );
}

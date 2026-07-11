import { requireRole, auth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { UserActions } from "./user-actions";
import { Badge } from "@/components/ui/badge";
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

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requireRole("ADMIN");
  const session = await auth();
  const myUserId = session?.user.id;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    include: { team: { select: { name: true, tag: true } } },
  });

  return (
    <AppShell>
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold">Comptes utilisateurs</h1>
          <p className="text-muted-foreground">
            Gérez les comptes capitaines et administrateurs.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Tous les comptes</CardTitle>
            <CardDescription>
              {users.length} compte(s) enregistré(s).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Équipe</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell>{u.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                        {u.role === "ADMIN" ? "Admin" : "Capitaine"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.team ? `${u.team.name}${u.team.tag ? ` [${u.team.tag}]` : ""}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <UserActions
                        userId={u.id}
                        userLabel={u.name ?? u.email}
                        isSelf={u.id === myUserId}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

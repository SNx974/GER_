import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { MapManager } from "./map-manager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminMapsPage() {
  await requireRole("ADMIN");

  const maps = await prisma.gameMap.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold">Pool de maps</h1>
          <p className="text-muted-foreground">
            Ajoutez, activez/désactivez ou supprimez les maps du mapban.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Maps</CardTitle>
            <CardDescription>
              Seules les maps actives entrent dans le veto. Prévoyez au moins
              autant de maps que le format (BO3 ≥ 3, BO5 ≥ 5).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MapManager
              maps={maps.map((m) => ({
                id: m.id,
                name: m.name,
                imageUrl: m.imageUrl,
                isActive: m.isActive,
              }))}
            />
          </CardContent>
        </Card>
      </main>
    </AppShell>
  );
}

import { requireRole } from "@/lib/session";
import { getGlobalSetting } from "@/lib/settings";
import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "./settings-form";
import { CreateAdminForm } from "./create-admin-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function AdminSettingsPage() {
  await requireRole("ADMIN");
  const setting = await getGlobalSetting();

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Paramètres globaux</h1>
        <p className="text-muted-foreground">
          Réglages appliqués à l&apos;ensemble de la plateforme.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Effectif des équipes</CardTitle>
          <CardDescription>
            Définissez la limite de joueurs autorisée par équipe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm initialMax={setting.maxPlayersPerTeam} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Administrateurs</CardTitle>
          <CardDescription>
            Créez un nouveau compte administrateur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateAdminForm />
        </CardContent>
      </Card>
      </main>
    </AppShell>
  );
}

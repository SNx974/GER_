import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatNotification } from "@/lib/notification-format";
import { AppShell } from "@/components/app-shell";
import { markAllRead } from "./actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await requireAuth();

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <AppShell>
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Notifications</h1>
        {hasUnread && (
          <form action={markAllRead}>
            <Button type="submit" variant="outline" size="sm">
              Tout marquer comme lu
            </Button>
          </form>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Récentes</CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune notification.
            </p>
          ) : (
            <ul className="divide-y">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <span className="text-sm">
                    {formatNotification(
                      n.type,
                      n.payload as Record<string, unknown> | null
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {!n.read && <Badge>Nouveau</Badge>}
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {n.createdAt.toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </main>
    </AppShell>
  );
}

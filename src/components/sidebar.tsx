import { auth } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { SidebarNav, type NavLink } from "@/components/sidebar-nav";

export async function Sidebar() {
  const session = await auth();
  if (!session?.user) return null;

  const unread = await prisma.notification.count({
    where: { userId: session.user.id, read: false },
  });

  const isCaptain = session.user.role === "CAPTAIN";
  const isAdmin = session.user.role === "ADMIN";

  const links: NavLink[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    ...(isCaptain
      ? ([
          { href: "/team", label: "Mon équipe", icon: "team" },
          { href: "/planning", label: "Planning", icon: "planning" },
          { href: "/matches", label: "Mes matchs", icon: "matches" },
        ] satisfies NavLink[])
      : []),
    { href: "/teams", label: "Équipes", icon: "teams" },
    { href: "/leaderboard", label: "Classement", icon: "leaderboard" },
    { href: "/notifications", label: "Notifications", icon: "notifications", badge: unread },
    ...(isAdmin
      ? ([
          { href: "/admin/matches", label: "Matchs", icon: "matches" },
          { href: "/admin/results", label: "Résultats", icon: "results" },
          { href: "/admin/maps", label: "Maps", icon: "maps" },
          { href: "/admin/settings", label: "Paramètres", icon: "settings" },
        ] satisfies NavLink[])
      : []),
  ];

  return <SidebarNav links={links} />;
}

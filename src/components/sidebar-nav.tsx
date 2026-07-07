"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Gamepad2,
  LayoutDashboard,
  LogOut,
  Map as MapIcon,
  Settings,
  Shield,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type NavLink = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
};

const ICONS = {
  dashboard: LayoutDashboard,
  team: Users,
  planning: CalendarDays,
  matches: Swords,
  teams: Shield,
  leaderboard: Trophy,
  notifications: Bell,
  settings: Settings,
  results: ClipboardCheck,
  maps: MapIcon,
};

export function SidebarNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col border-r bg-card/50 sm:w-60">
      <Link
        href="/dashboard"
        className="flex h-14 items-center gap-2 border-b px-4 font-bold"
      >
        <Gamepad2 className="h-6 w-6 shrink-0 text-primary" />
        <span className="hidden sm:inline">GER Esport</span>
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2 sm:p-3">
        {links.map((l) => {
          const Icon = ICONS[l.icon];
          const active =
            pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
              title={l.label}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className="hidden sm:inline">{l.label}</span>
              {l.badge && l.badge > 0 ? (
                <Badge
                  variant={active ? "secondary" : "default"}
                  className="ml-auto hidden h-5 min-w-5 justify-center px-1 sm:flex"
                >
                  {l.badge}
                </Badge>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-2 sm:p-3">
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Déconnexion"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>
    </aside>
  );
}

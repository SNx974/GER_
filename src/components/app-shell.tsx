import { Sidebar } from "@/components/sidebar";

/** Coquille applicative : sidebar verticale à gauche + contenu à droite. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

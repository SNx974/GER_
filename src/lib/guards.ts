import { auth } from "@/lib/session";

export type CaptainContext =
  | { ok: true; userId: string; teamId: string }
  | { ok: false; error: string };

/** Contexte capitaine pour les server actions (id user + id équipe). */
export async function getCaptainContext(): Promise<CaptainContext> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };
  if (session.user.role !== "CAPTAIN" || !session.user.teamId) {
    return { ok: false, error: "Action réservée aux capitaines d'équipe" };
  }
  return { ok: true, userId: session.user.id, teamId: session.user.teamId };
}

export type AdminContext =
  | { ok: true; userId: string }
  | { ok: false; error: string };

export async function getAdminContext(): Promise<AdminContext> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Non authentifié" };
  if (session.user.role !== "ADMIN") {
    return { ok: false, error: "Action réservée aux administrateurs" };
  }
  return { ok: true, userId: session.user.id };
}

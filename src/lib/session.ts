import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";

export function auth() {
  return getServerSession(authOptions);
}

/** Renvoie la session ou redirige vers /login si non connecté. */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

/** Exige un rôle précis (sinon redirige vers le dashboard). */
export async function requireRole(role: Role) {
  const session = await requireAuth();
  if (session.user.role !== role) redirect("/dashboard");
  return session;
}

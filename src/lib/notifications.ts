import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Crée une notification pour un utilisateur. */
export async function notify(
  userId: string,
  type: NotificationType,
  payload?: Prisma.InputJsonValue
) {
  await prisma.notification.create({
    data: { userId, type, payload: payload ?? undefined },
  });
}

/** Notifie tous les administrateurs (ex : résultat en attente de validation). */
export async function notifyAdmins(
  type: NotificationType,
  payload?: Prisma.InputJsonValue
) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });
  if (admins.length === 0) return;
  await prisma.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, type, payload: payload ?? undefined })),
  });
}

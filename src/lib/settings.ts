import { prisma } from "@/lib/prisma";

export const DEFAULT_MAX_PLAYERS = 7;

/** Réglages globaux (singleton). Crée l'entrée si elle n'existe pas encore. */
export async function getGlobalSetting() {
  return prisma.globalSetting.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global", maxPlayersPerTeam: DEFAULT_MAX_PLAYERS },
  });
}

export async function getMaxPlayersPerTeam(): Promise<number> {
  const setting = await prisma.globalSetting.findUnique({
    where: { id: "global" },
  });
  return setting?.maxPlayersPerTeam ?? DEFAULT_MAX_PLAYERS;
}

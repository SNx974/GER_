import { prisma } from "@/lib/prisma";

export const DEFAULT_MAX_PLAYERS = 7;
export const DEFAULT_MIN_PLAYERS_TO_PLAY = 5;

/** Réglages globaux (singleton). Crée l'entrée si elle n'existe pas encore. */
export async function getGlobalSetting() {
  return prisma.globalSetting.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      maxPlayersPerTeam: DEFAULT_MAX_PLAYERS,
      minPlayersToPlay: DEFAULT_MIN_PLAYERS_TO_PLAY,
    },
  });
}

export async function getMaxPlayersPerTeam(): Promise<number> {
  const setting = await prisma.globalSetting.findUnique({
    where: { id: "global" },
  });
  return setting?.maxPlayersPerTeam ?? DEFAULT_MAX_PLAYERS;
}

/** Nombre minimum de joueurs actifs qu'une équipe doit avoir pour jouer un match. */
export async function getMinPlayersToPlay(): Promise<number> {
  const setting = await prisma.globalSetting.findUnique({
    where: { id: "global" },
  });
  return setting?.minPlayersToPlay ?? DEFAULT_MIN_PLAYERS_TO_PLAY;
}

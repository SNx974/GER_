import { z } from "zod";

export const playerSchema = z.object({
  pseudo: z.string().min(1, "Pseudo requis").max(30, "30 caractères max"),
  gameId: z.string().max(60, "60 caractères max").optional().or(z.literal("")),
  role: z.string().max(30, "30 caractères max").optional().or(z.literal("")),
});

export type PlayerInput = z.infer<typeof playerSchema>;

// Rôles courants (FPS tactique) — proposés dans l'UI, champ reste libre
export const PLAYER_ROLES = [
  "IGL",
  "Duelliste",
  "Contrôleur",
  "Initiateur",
  "Sentinelle",
  "Flex",
  "Remplaçant",
] as const;

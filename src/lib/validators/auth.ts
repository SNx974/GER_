import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(1, "Mot de passe requis"),
});

export const registerSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z
    .string()
    .min(8, "8 caractères minimum")
    .regex(/[A-Z]/, "Au moins une majuscule")
    .regex(/[0-9]/, "Au moins un chiffre"),
  captainName: z.string().min(2, "Nom du capitaine requis").max(50),
  teamName: z.string().min(2, "Nom d'équipe requis").max(50),
  teamTag: z
    .string()
    .min(2, "2 caractères minimum")
    .max(6, "6 caractères maximum")
    .regex(/^[A-Za-z0-9]+$/, "Lettres et chiffres uniquement")
    .optional()
    .or(z.literal("")),
});

// Création d'un admin par un admin existant (module admin)
export const createAdminSchema = z.object({
  email: z.string().email("Email invalide"),
  name: z.string().min(2, "Nom requis").max(50),
  password: z
    .string()
    .min(8, "8 caractères minimum")
    .regex(/[A-Z]/, "Au moins une majuscule")
    .regex(/[0-9]/, "Au moins un chiffre"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateAdminInput = z.infer<typeof createAdminSchema>;

import { z } from "zod";

export const mapSchema = z.object({
  name: z.string().min(1, "Nom requis").max(40, "40 caractères max"),
  imageUrl: z.string().url("URL invalide").optional().or(z.literal("")),
});

export type MapInput = z.infer<typeof mapSchema>;

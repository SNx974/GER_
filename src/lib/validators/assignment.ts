import { z } from "zod";

export const createAssignmentSchema = z
  .object({
    teamAId: z.string().min(1, "Équipe requise"),
    teamBId: z.string().min(1, "Équipe requise"),
    format: z.enum(["BO1", "BO3", "BO5"]),
    windowStart: z.coerce.date(),
    windowEnd: z.coerce.date(),
  })
  .refine((d) => d.teamAId !== d.teamBId, {
    message: "Les deux équipes doivent être différentes",
    path: ["teamBId"],
  })
  .refine((d) => d.windowEnd > d.windowStart, {
    message: "La fin de la fenêtre doit être après le début",
    path: ["windowEnd"],
  });

export const proposeAssignmentDateSchema = z.object({
  assignmentId: z.string().min(1),
  date: z.coerce.date(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type ProposeAssignmentDateInput = z.infer<typeof proposeAssignmentDateSchema>;

// Forme brute envoyée par le formulaire (dates en string avant coercition)
export type CreateAssignmentFormInput = {
  teamAId: string;
  teamBId: string;
  format: "BO1" | "BO3" | "BO5";
  windowStart: string;
  windowEnd: string;
};

import { z } from "zod";

export const availabilitySchema = z
  .object({
    startTime: z.coerce.date(),
    endTime: z.coerce.date(),
    status: z.enum(["AVAILABLE", "UNAVAILABLE"]),
    note: z.string().max(120).optional().or(z.literal("")),
  })
  .refine((d) => d.endTime > d.startTime, {
    message: "La fin doit être après le début",
    path: ["endTime"],
  });

export const proposalSchema = z.object({
  opponentTeamId: z.string().min(1, "Adversaire requis"),
  proposedDate: z.coerce.date(),
  format: z.enum(["BO1", "BO3", "BO5"]),
  message: z.string().max(200).optional().or(z.literal("")),
});

export type AvailabilityInput = z.infer<typeof availabilitySchema>;
export type ProposalInput = z.infer<typeof proposalSchema>;

// Formes brutes envoyées par les formulaires (dates en string avant coercition)
export type AvailabilityFormInput = {
  startTime: string;
  endTime: string;
  status: "AVAILABLE" | "UNAVAILABLE";
  note?: string;
};

export type ProposalFormInput = {
  opponentTeamId: string;
  proposedDate: string;
  format: "BO1" | "BO3" | "BO5";
  message?: string;
};

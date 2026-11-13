import { z } from "zod";

export const emailInput = z.string().trim().toLowerCase().email().max(254);
export const passwordInput = z.string().min(12, "Use at least 12 characters.").max(128);
export const acceptInvitationInput = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/),
    name: z.string().trim().min(1).max(100),
    password: passwordInput,
  })
  .strict();
export const preferencesInput = z
  .object({
    level: z.enum(["professional", "subprofessional"]),
    days: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((v) => new Set(v).size === v.length, "Choose each day once."),
    dailyMinutes: z.number().int().min(5).max(240),
    targetDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
        "Enter a valid date.",
      )
      .nullable(),
    language: z.enum(["english", "filipino"]),
    revision: z.number().int().min(0),
  })
  .strict();
export type PreferencesInput = z.infer<typeof preferencesInput>;

import { z } from "zod";

/** Request shapes for PolicyHub (docs/policyhub/README.md §8). */

/** "PYO-001", "TOS-002", "REFUND" — upper case, digits, dashes. */
export const policyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9-]{1,19}$/, "Use capitals, digits and dashes, e.g. PYO-001");

export const codeParams = z.object({ code: policyCode });

export const policyCreateSchema = z.object({
  code: policyCode,
  name: z.string().trim().min(2).max(120),
  /** Who reads it: "seller", "customer", "supplier", ... */
  audience: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z-]{1,29}$/, "Lowercase letters and dashes, e.g. seller"),
});
export type PolicyCreateInput = z.infer<typeof policyCreateSchema>;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === "" ? null : v));

/** Edit the draft. Only the fields sent change; null clears a field. */
export const draftUpdateSchema = z
  .object({
    body: z.string().max(50_000).optional(),
    changeSummary: optionalText(500),
    changeReason: optionalText(1000),
    /** Shape checked per policy code in the service (rules.ts). */
    settings: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change");
export type DraftUpdateInput = z.infer<typeof draftUpdateSchema>;

export const publishSchema = z.object({
  /** Omitted = now. Never in the past (service-checked). */
  effectiveFrom: z.coerce.date().optional(),
});
export type PublishInput = z.infer<typeof publishSchema>;

export const versionQuery = z.object({
  /** Ask for one version's full wording. */
  version: z.coerce.number().int().positive().optional(),
});

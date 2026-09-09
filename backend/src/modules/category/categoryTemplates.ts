import { z } from "zod";

/**
 * Per-category suggestions for the seller's product form: which option types
 * (and values) a product filed here usually has, and which specification
 * labels. Sellers tap them instead of typing; nothing here is mandatory.
 * Stored on `Category` as JSON, inherited down the tree (see
 * `categoryTree.ts`), edited by admins.
 */

const text = z.string().trim().min(1).max(40);

export const optionTemplateSchema = z.object({
  name: text,
  values: z.array(text).max(30),
});

export const optionTemplatesSchema = z.array(optionTemplateSchema).max(3);
export const specTemplatesSchema = z.array(text).max(30);

export type OptionTemplate = z.infer<typeof optionTemplateSchema>;

/** Stored JSON → clean list; a malformed entry costs itself, never the rest. */
export function resolveOptionTemplates(raw: unknown): OptionTemplate[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = optionTemplateSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function resolveSpecTemplates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = text.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

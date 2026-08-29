import { z } from "zod";
import { storeThemeColorsSchema } from "../stores/stores.schema.js";
import { boolQuery } from "../../utils/zodHelpers.js";

/**
 * Store appearance templates — the platform's curated palettes.
 *
 * A template is **colors and nothing else**: it reuses `storeThemeColorsSchema`
 * verbatim (the same five keys the `Store.theme` column holds), so a template
 * can be applied to a store by a plain copy and the two shapes can never
 * drift apart. Everything else about a store — catalog, homepage, footer,
 * payments — is deliberately out of scope.
 */

export const themeTemplateCreateSchema = z.object({
  name: z.string().trim().min(1, "Template name is required").max(60),
  description: z.string().trim().max(160).nullable().optional(),
  theme: storeThemeColorsSchema,
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().min(0).max(9999).default(0),
});

/**
 * Partial by design: the console toggles `isActive` on its own, and saves the
 * editor's fields together. `theme`, when present, replaces all five colors
 * (a half-applied palette is never a state worth persisting).
 */
export const themeTemplateUpdateSchema = themeTemplateCreateSchema.partial();

/** Admin listing filter. Sellers never pass one — they only get active rows. */
export const themeTemplateListQuery = z.object({
  isActive: boolQuery.optional(),
});

export type ThemeTemplateCreateInput = z.infer<typeof themeTemplateCreateSchema>;
export type ThemeTemplateUpdateInput = z.infer<typeof themeTemplateUpdateSchema>;
export type ThemeTemplateListQuery = z.infer<typeof themeTemplateListQuery>;

import { z } from "zod";
import { PUBLIC_SECTIONS } from "../stores/publicStore.schema.js";

/**
 * Query parameters that change a page shell's head. Read exactly the way the
 * SPA reads them (`StoreShopPage`, `BrowseCategoryPage`), and **never
 * rejected**: a hand-edited or garbage query must still get a page, so every
 * field falls back to what the SPA would fall back to instead of failing.
 *
 *   q        /store/{slug}/shop — search scope (trimmed; blank = none)
 *   section  /store/{slug}/shop — merchandising scope (unknown = none)
 *   page     /c/{slug} — listing page (anything unusable = 1)
 *   sort     /c/{slug} — listing order (unknown = newest)
 */
export const pageShellQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? ""),
  section: z.enum(PUBLIC_SECTIONS).optional().catch(undefined),
  page: z
    .string()
    .optional()
    .transform((value) => {
      const page = Math.floor(Number(value ?? 1));
      // The ceiling only keeps an absurd value out of a SQL OFFSET.
      return Number.isFinite(page) && page >= 1 && page <= 10_000 ? page : 1;
    }),
  sort: z.enum(["newest", "priceAsc", "priceDesc"]).catch("newest"),
});

export type PageShellQuery = z.infer<typeof pageShellQuerySchema>;

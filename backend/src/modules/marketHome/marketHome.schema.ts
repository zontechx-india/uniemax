import { z } from "zod";

/**
 * The marketplace homepage (`/`) as a list of sections the platform team can
 * reorder and switch on or off from the admin console — the platform's twin of
 * a seller's Store Builder (`stores.schema.ts` → `HOMEPAGE_SECTION_KEYS`).
 *
 * The header and the footer are not sections: they are always at the top and
 * the bottom, so they are not in this list at all.
 *
 * Order here is the platform default — what `/` shows before an admin has
 * saved anything. Keep it in step with `MARKET_HOME_SECTIONS` in the
 * frontend's `features/discovery/marketHomeSections.ts`.
 */
export const MARKET_HOME_SECTION_KEYS = [
  "banners",
  "intro",
  "popularCategories",
  "continueShopping",
  "topStores",
  "shopByCategory",
  "freshFinds",
  "moreToExplore",
  "recentlyViewed",
  "myStores",
  "becomeSeller",
] as const;

export type MarketHomeSectionKey = (typeof MARKET_HOME_SECTION_KEYS)[number];

/**
 * Sections that can move but never be switched off. `intro` holds the page's
 * only `<h1>` — hiding it would cost the homepage its main heading.
 */
export const ALWAYS_ON_SECTIONS: readonly MarketHomeSectionKey[] = ["intro"];

/**
 * Sections that start switched off — in the default list, and when a saved
 * list predates them. `popularCategories` was split out of the welcome bar
 * (its two chip rows cost too much of a phone screen) and stays hidden until
 * it gets a new design; an admin can still turn it on.
 */
export const DEFAULT_OFF_SECTIONS: readonly MarketHomeSectionKey[] = [
  "popularCategories",
];

export interface MarketHomeSection {
  key: MarketHomeSectionKey;
  enabled: boolean;
}

/** `PlatformSetting.key` the list is stored under. */
export const MARKET_HOME_SETTING_KEY = "marketHomeSections";

/**
 * PUT body: the FULL ordered list — every key exactly once. A reorder and a
 * toggle are the same write (replace the list), as in the Store Builder.
 */
export const marketHomeSectionsSchema = z
  .object({
    sections: z
      .array(
        z.object({
          key: z.enum(MARKET_HOME_SECTION_KEYS),
          enabled: z.boolean(),
        }),
      )
      .length(MARKET_HOME_SECTION_KEYS.length),
  })
  .superRefine((val, ctx) => {
    const keys = new Set(val.sections.map((s) => s.key));
    if (keys.size !== val.sections.length) {
      ctx.addIssue({
        code: "custom",
        path: ["sections"],
        message: "A section is listed more than once",
      });
    }
  });

export type MarketHomeSectionsInput = z.infer<typeof marketHomeSectionsSchema>;

/**
 * Normalise the stored JSON into a complete, ordered list:
 *   - null / garbage → default order, all on except `DEFAULT_OFF_SECTIONS`
 *   - unknown keys (a retired section) are dropped
 *   - a key missing from the stored list (a section added since the last
 *     save) is inserted where the default order puts it, switched on unless
 *     it is in `DEFAULT_OFF_SECTIONS`
 *   - an always-on section is on whatever the stored flag says
 */
export function resolveMarketHome(raw: unknown): MarketHomeSection[] {
  const stored =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as { sections?: unknown }).sections
      : undefined;

  const seen = new Set<MarketHomeSectionKey>();
  const out: MarketHomeSection[] = [];
  if (Array.isArray(stored)) {
    for (const item of stored) {
      const key = (item as { key?: unknown } | null)?.key;
      if (
        typeof key !== "string" ||
        !(MARKET_HOME_SECTION_KEYS as readonly string[]).includes(key) ||
        seen.has(key as MarketHomeSectionKey)
      ) {
        continue;
      }
      seen.add(key as MarketHomeSectionKey);
      out.push({
        key: key as MarketHomeSectionKey,
        enabled: (item as { enabled?: unknown }).enabled !== false,
      });
    }
  }

  for (const key of MARKET_HOME_SECTION_KEYS) {
    if (seen.has(key)) continue;
    const canonical = MARKET_HOME_SECTION_KEYS.indexOf(key);
    const at = out.findIndex(
      (s) => MARKET_HOME_SECTION_KEYS.indexOf(s.key) > canonical,
    );
    const entry = { key, enabled: !DEFAULT_OFF_SECTIONS.includes(key) };
    if (at === -1) out.push(entry);
    else out.splice(at, 0, entry);
  }

  return out.map((s) =>
    ALWAYS_ON_SECTIONS.includes(s.key) ? { ...s, enabled: true } : s,
  );
}

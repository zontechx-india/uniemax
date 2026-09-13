import { z } from "zod";

/**
 * Storefront banners — the owner-managed promo carousel on the store
 * homepage (the `banners` section of `Store.homepage`).
 *
 * The image itself is never in the JSON body: it arrives as multipart on the
 * create/replace endpoints, so these schemas describe only the METADATA the
 * owner edits — where the banner points, what it is called, whether it runs.
 *
 * There is ONE image per banner, always 16:5. The storefront scales it by
 * width at every breakpoint, so nothing here selects a variant.
 */

/**
 * Where tapping a banner takes the shopper.
 *
 * CATEGORY/PRODUCT carry the target's **id**, never a path: the storefront
 * resolves it to the live slug at read time, so the link survives a rename
 * and degrades to "no link" (rather than a 404) once the target is deleted,
 * unpublished or hidden. URL is for campaign pages outside the store and is
 * the only kind that can leave the site.
 */
export const BANNER_LINK_TYPES = ["NONE", "CATEGORY", "PRODUCT", "URL"] as const;

export type BannerLinkType = (typeof BANNER_LINK_TYPES)[number];

/**
 * Only http(s) is accepted. A `javascript:` or `data:` href in an
 * owner-supplied field would execute in every shopper's browser, and relative
 * paths are rejected too — an internal destination must go through
 * CATEGORY/PRODUCT so it stays a real reference rather than a string that
 * silently rots.
 */
const externalUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => /^https?:\/\//i.test(value),
    "Link must start with http:// or https://",
  );

/**
 * `linkValue` is required by — and only meaningful for — the non-NONE kinds,
 * so the pairing is validated as a unit rather than leaving a PRODUCT banner
 * with nothing to point at.
 */
const linkShape = {
  linkType: z.enum(BANNER_LINK_TYPES),
  linkValue: z.string().trim().min(1).max(2048).nullable(),
};

function refineLink(
  val: {
    linkType?: BannerLinkType | undefined;
    linkValue?: string | null | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (val.linkType === undefined) return;
  if (val.linkType === "NONE") {
    // Tolerated rather than rejected: switching a banner back to "no link"
    // should not force the client to also blank a field it is about to drop.
    return;
  }
  if (!val.linkValue) {
    ctx.addIssue({
      code: "custom",
      path: ["linkValue"],
      message: "Pick where this banner should link to",
    });
    return;
  }
  if (val.linkType === "URL") {
    const parsed = externalUrlSchema.safeParse(val.linkValue);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        path: ["linkValue"],
        message: parsed.error.issues[0]?.message ?? "Invalid link",
      });
    }
  }
}

/** Title doubles as the image's alt text, so it is worth keeping short. */
const titleSchema = z.string().trim().max(120).nullable();

/**
 * Create — the metadata half of the multipart body. Every field is optional:
 * a seller can drop an image in and set it up afterwards, which is how the
 * admin screen works (upload first, then edit the row).
 */
export const storeBannerCreateSchema = z
  .object({
    title: titleSchema.optional(),
    linkType: z.enum(BANNER_LINK_TYPES).optional(),
    linkValue: z.string().trim().min(1).max(2048).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(refineLink);

export const storeBannerUpdateSchema = z
  .object({
    title: titleSchema.optional(),
    ...linkShape,
    isActive: z.boolean().optional(),
  })
  .partial()
  .superRefine(refineLink);

/**
 * Reorder: the COMPLETE list of this store's banner ids in the wanted order,
 * for the same reason the homepage sections PATCH takes the whole list — a
 * partial order is ambiguous about where the rest belong.
 */
export const storeBannerOrderSchema = z.object({
  bannerIds: z.array(z.string().min(1)).max(50),
});

/** `:bannerId` alongside the store `:id`. */
export const storeBannerParamSchema = z.object({
  id: z.string().min(1),
  bannerId: z.string().min(1),
});

export type StoreBannerCreateInput = z.infer<typeof storeBannerCreateSchema>;
export type StoreBannerUpdateInput = z.infer<typeof storeBannerUpdateSchema>;
export type StoreBannerOrderInput = z.infer<typeof storeBannerOrderSchema>;

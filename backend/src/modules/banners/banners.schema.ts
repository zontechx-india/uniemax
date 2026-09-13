import { z } from "zod";

/**
 * Marketplace banners — the platform-wide promo carousel at the top of the
 * marketplace homepage, managed by admins in the console.
 *
 * The per-store equivalent lives in `stores/storeBanner.schema.ts`. These stay
 * separate because they are owned by different people and link to different
 * kinds of thing: a store banner points INTO its own catalog, a marketplace
 * banner points at a whole shop or off-site.
 *
 * The image is never in the JSON body — it arrives as multipart on create and
 * replace, so these schemas describe only the metadata.
 */

export const BANNER_LINK_TYPES = ["NONE", "STORE", "URL"] as const;

export type BannerLinkType = (typeof BANNER_LINK_TYPES)[number];

/**
 * Only http(s) is accepted. A `javascript:` or `data:` href would execute in
 * every shopper's browser, and a relative path must go through STORE so it
 * stays a real reference rather than a string that silently rots.
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

function refineLink(
  val: {
    linkType?: BannerLinkType | undefined;
    linkValue?: string | null | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (val.linkType === undefined || val.linkType === "NONE") return;
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

const titleSchema = z.string().trim().max(120).nullable();

export const bannerCreateSchema = z
  .object({
    title: titleSchema.optional(),
    linkType: z.enum(BANNER_LINK_TYPES).optional(),
    linkValue: z.string().trim().min(1).max(2048).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine(refineLink);

export const bannerUpdateSchema = z
  .object({
    title: titleSchema,
    linkType: z.enum(BANNER_LINK_TYPES),
    linkValue: z.string().trim().min(1).max(2048).nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .superRefine(refineLink);

/** The COMPLETE id list in the wanted order — a partial order is ambiguous. */
export const bannerOrderSchema = z.object({
  bannerIds: z.array(z.string().min(1)).max(50),
});

export const bannerParamSchema = z.object({
  id: z.string().min(1),
});

export type BannerCreateInput = z.infer<typeof bannerCreateSchema>;
export type BannerUpdateInput = z.infer<typeof bannerUpdateSchema>;
export type BannerOrderInput = z.infer<typeof bannerOrderSchema>;

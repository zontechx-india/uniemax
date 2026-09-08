import { z } from "zod";

/**
 * Server-side cart payloads.
 *
 * A line is a **reference plus a quantity plus intent** — never a price, a
 * name or an image. Everything renderable is resolved from the live catalog
 * when the cart is read, so a stale client can never inject money or copy.
 *
 * The store is derived from the product, so the client sends no store at all:
 * `productId` + `variantId` already identify exactly one buyable thing, and a
 * mismatched (product, variant) pair is rejected rather than reconciled.
 */

/** Hard ceiling on distinct lines in one cart (matches the order payload). */
export const MAX_CART_LINES = 100;
/** Hard ceiling on one line's quantity (matches the order payload). */
export const MAX_LINE_QUANTITY = 999;
/** Serialized size cap for a `metadata` blob, per line and per cart. */
export const MAX_METADATA_CHARS = 2000;

/**
 * Free-form extras (`Cart.metadata`, `CartLine.metadata`). Deliberately
 * unopinionated about its keys — the point of the column is that a new
 * checkout feature does not need a migration — but bounded in size, since
 * anything a client can write to it, a client can abuse.
 */
const metadata = z
  .record(z.string(), z.unknown())
  .refine((value) => JSON.stringify(value).length <= MAX_METADATA_CHARS, {
    message: `Metadata must be under ${MAX_METADATA_CHARS} characters`,
  })
  .nullish()
  .transform((value) => value ?? null);

/** Which basket the line sits in — see `CartLineStatus` in the schema. */
const lineStatus = z.enum(["ACTIVE", "SAVED"]).default("ACTIVE");

const cartLineInput = z.object({
  productId: z.string().min(1),
  /**
   * Chosen option, or null for a product without options. Null resolves to
   * the product's implicit `isDefault` variant server-side — the storefront
   * never sees that variant, so it can never name it.
   */
  variantId: z
    .string()
    .min(1)
    .nullish()
    .transform((value) => value ?? null),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
  status: lineStatus,
  metadata,
});

const cartLines = z
  .array(cartLineInput)
  .max(MAX_CART_LINES, `A cart holds at most ${MAX_CART_LINES} items`);

/**
 * `PUT /cart` — replace the whole cart with this set of lines.
 *
 * Replace, not patch: the browser owns the cart while a customer is signed
 * in (localStorage is the hot path), and this endpoint is how that cart is
 * mirrored. One authoritative write means a removal propagates as naturally
 * as an addition, with no tombstones and no per-line race.
 */
export const cartReplaceSchema = z.object({
  lines: cartLines,
  metadata,
});

/**
 * `POST /cart/merge` — union these lines into the stored cart.
 *
 * The sign-in reconciliation: the shopper filled a cart as a guest and now
 * has an account cart from another device. Neither may be thrown away, so
 * quantities are taken pairwise as the LARGER of the two, and lines only the
 * account knows about survive untouched.
 */
export const cartMergeSchema = z.object({
  lines: cartLines,
  metadata,
});

export type CartLineInput = z.infer<typeof cartLineInput>;
export type CartReplaceInput = z.infer<typeof cartReplaceSchema>;
export type CartMergeInput = z.infer<typeof cartMergeSchema>;

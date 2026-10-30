import { z } from "zod";

/** `PUT|DELETE /api/v1/wishlist/:productId`. */
export const wishlistProductParamSchema = z.object({
  productId: z.string().min(1).max(64),
});

export type WishlistProductParam = z.infer<typeof wishlistProductParamSchema>;

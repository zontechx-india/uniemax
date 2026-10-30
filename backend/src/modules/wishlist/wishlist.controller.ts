import type { FastifyRequest } from "fastify";
import { ok } from "../../utils/response.js";
import { wishlistProductParamSchema } from "./wishlist.schema.js";
import * as service from "./wishlist.service.js";

/**
 * All handlers run behind `requireCustomer` (wishlist.routes.ts) and touch
 * only the caller's own list — no route takes a customer id.
 */

export async function list(request: FastifyRequest) {
  return ok(await service.listWishlist(request.customer!.id));
}

export async function ids(request: FastifyRequest) {
  return ok(await service.listWishlistIds(request.customer!.id));
}

export async function add(request: FastifyRequest) {
  const { productId } = wishlistProductParamSchema.parse(request.params);
  return ok(await service.addToWishlist(request.customer!.id, productId));
}

export async function remove(request: FastifyRequest) {
  const { productId } = wishlistProductParamSchema.parse(request.params);
  return ok(await service.removeFromWishlist(request.customer!.id, productId));
}

import type { FastifyRequest } from "fastify";
import { ok } from "../../utils/response.js";
import { slugParamSchema } from "../../utils/zodHelpers.js";
import { cartMergeSchema, cartReplaceSchema } from "./cart.schema.js";
import * as service from "./cart.service.js";

/**
 * All handlers run behind `requireCustomer` (cart.routes.ts) and touch only
 * the caller's own cart — there is no cart id in any route, so one customer
 * can never address another's.
 *
 * Every endpoint answers with the WHOLE cart as it now stands, priced from
 * the live catalog. A write and a read cost the same round trip, so a client
 * never has to guess what its own push produced.
 */

export async function getCart(request: FastifyRequest) {
  return ok(await service.getCart(request.customer!.id));
}

export async function replaceCart(request: FastifyRequest) {
  const input = cartReplaceSchema.parse(request.body);
  return ok(await service.replaceCart(request.customer!.id, input));
}

export async function mergeCart(request: FastifyRequest) {
  const input = cartMergeSchema.parse(request.body);
  return ok(await service.mergeCart(request.customer!.id, input));
}

export async function clearCart(request: FastifyRequest) {
  return ok(await service.clearCart(request.customer!.id));
}

export async function clearStore(request: FastifyRequest) {
  const { slug } = slugParamSchema.parse(request.params);
  return ok(await service.clearStoreBySlug(request.customer!.id, slug));
}

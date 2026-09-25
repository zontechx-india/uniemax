import type { FastifyRequest, FastifyReply } from "fastify";
import { storeActor } from "../stores/storeActor.js";
import { list, ok } from "../../utils/response.js";
import { idParamSchema, slugParamSchema } from "../../utils/zodHelpers.js";
import { optionalCustomerId } from "../../package/auth/index.js";
import {
  orderCancelSchema,
  idempotencyHeaderSchema,
  orderCreateSchema,
  orderParamSchema,
  orderQuoteSchema,
  orderStatusUpdateSchema,
  sellerOrderListQuerySchema,
  sellerOrderParamSchema,
} from "./orders.schema.js";
import * as service from "./orders.service.js";

/**
 * Storefront order endpoints. Placement runs behind `requireCustomer`
 * (only signed-in customers can order); the confirmation lookup is public.
 */

export async function createOrder(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = slugParamSchema.parse(request.params);
  const input = orderCreateSchema.parse(request.body);
  const { "idempotency-key": idempotencyKey } = idempotencyHeaderSchema.parse(
    request.headers,
  );
  const order = await service.createOrder(
    slug,
    input,
    request.customer!.id,
    idempotencyKey,
  );
  return reply.status(201).send(ok(order));
}

/**
 * Checkout price summary (no auth — the cart is anonymous; an owner's draft
 * preview is honoured when a session is present). Nothing is written.
 */
export async function quoteOrder(request: FastifyRequest) {
  const { slug } = slugParamSchema.parse(request.params);
  const input = orderQuoteSchema.parse(request.body);
  return ok(await service.quoteOrder(slug, input, optionalCustomerId(request)));
}

export async function getOrder(request: FastifyRequest) {
  const { slug, orderId } = orderParamSchema.parse(request.params);
  return ok(
    await service.getPublicOrder(slug, orderId, optionalCustomerId(request)),
  );
}

/** The buyer cancels their own not-yet-confirmed, unpaid order. */
export async function cancelMyOrder(request: FastifyRequest) {
  const { slug, orderId } = orderParamSchema.parse(request.params);
  const { reason } = orderCancelSchema.parse(request.body ?? {});
  return ok(
    await service.cancelMyOrder(request.customer!.id, slug, orderId, reason),
  );
}

/** Runs behind `requireCustomer` (customer order-history routes). */
export async function listMyOrders(request: FastifyRequest) {
  return ok(await service.listMyOrders(request.customer!.id));
}

/** Seller dashboard — runs behind `requireCustomer` (stores.routes.ts). */
export async function getStoreDashboard(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.getStoreDashboard(storeActor(request), id));
}

// ---------------------------------------------------------------------------
// Seller order management — all behind `requireCustomer` (stores.routes.ts);
// ownership is enforced in the service (a foreign store 404s).
// ---------------------------------------------------------------------------

export async function listStoreOrders(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const query = sellerOrderListQuerySchema.parse(request.query);
  const { rows, meta } = await service.listStoreOrders(
    storeActor(request),
    id,
    query,
  );
  return list(rows, meta);
}

export async function getStoreOrder(request: FastifyRequest) {
  const { id, orderId } = sellerOrderParamSchema.parse(request.params);
  return ok(await service.getStoreOrder(storeActor(request), id, orderId));
}

export async function updateStoreOrderStatus(request: FastifyRequest) {
  const { id, orderId } = sellerOrderParamSchema.parse(request.params);
  const input = orderStatusUpdateSchema.parse(request.body);
  return ok(
    await service.updateOrderStatus(storeActor(request), id, orderId, input),
  );
}

export async function cancelStoreOrder(request: FastifyRequest) {
  const { id, orderId } = sellerOrderParamSchema.parse(request.params);
  // Cancel takes no other input, so a missing/empty body is fine too.
  const { reason } = orderCancelSchema.parse(request.body ?? {});
  return ok(
    await service.cancelOrder(storeActor(request), id, orderId, reason),
  );
}

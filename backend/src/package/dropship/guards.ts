import type { FastifyRequest } from "fastify";
import { HttpError } from "../../utils/httpError.js";
import { deps } from "./deps.js";
import { storeParam } from "./schema.js";
import type { StoreRef } from "./types.js";

declare module "fastify" {
  interface FastifyRequest {
    dropshipStore?: StoreRef;
    dropshipSupplier?: { id: string; storeId: string };
  }
}

/**
 * Runs after `requireCustomer`: `:storeId` (id or slug) must be the caller's
 * store (SU-10 — another store's id is a 404, never a 403).
 */
export async function requireOwnedStore(request: FastifyRequest): Promise<void> {
  const customerId = request.customer?.id;
  if (!customerId) throw HttpError.unauthorized();
  const { storeId } = storeParam.parse(request.params);
  request.dropshipStore = await deps.host.getOwnedStore(customerId, storeId);
}

/**
 * Runs after `requireOwnedStore` on the SELLER routes: a supplier account can't use them. It has no shop
 * and sells nothing, so it can't invite suppliers, add supplier products or read a seller's account (D-49).
 * Its own role is the one thing it may ask for.
 */
export async function requireSellingStore(request: FastifyRequest): Promise<void> {
  const store = request.dropshipStore;
  if (!store) throw HttpError.unauthorized();
  if (request.routeOptions.url?.endsWith("/role")) return;
  const supplier = await deps.prisma.supplier.findUnique({ where: { storeId: store.id }, select: { supplyOnly: true } });
  if (supplier?.supplyOnly) {
    throw HttpError.forbidden("A supplier account can't sell. To sell to customers, create a store of your own.");
  }
}

/** Runs after `requireOwnedStore`: that store must be an ACTIVE supplier (SU-9). */
export async function requireSupplier(request: FastifyRequest): Promise<void> {
  const store = request.dropshipStore;
  if (!store) throw HttpError.unauthorized();
  const supplier = await deps.prisma.supplier.findUnique({
    where: { storeId: store.id },
    select: { id: true, status: true },
  });
  if (!supplier) throw HttpError.forbidden("This store doesn't supply sellers");
  if (supplier.status === "PENDING") {
    throw HttpError.forbidden("Your supplier account is waiting for approval");
  }
  if (supplier.status === "SUSPENDED") {
    throw HttpError.forbidden("Supplying is paused by UnieMax — contact support");
  }
  request.dropshipSupplier = { id: supplier.id, storeId: store.id };
}

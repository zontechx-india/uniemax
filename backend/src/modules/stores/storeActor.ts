import type { FastifyRequest } from "fastify";

/**
 * WHO is acting on a store.
 *
 * The store modules were written for exactly one caller — the signed-in
 * customer who owns the store — and threaded `ownerId` through every service
 * so that a store belonging to someone else is indistinguishable from one
 * that does not exist (404, never 403: a 403 would confirm the id is real).
 *
 * Platform support needs a second caller: an admin fixing a seller's catalog
 * on request. Rather than growing a parallel set of admin services — which
 * would duplicate every catalog rule and then drift from it — the ownership
 * CHECK is what learns about the second actor. Both callers run the same
 * service code; only the scope of "which stores can I see" differs.
 *
 * An admin actor is only ever produced inside the `requireAdmin` subtree
 * (see `stores.routes.ts`), so no customer request can manufacture one.
 */
export type StoreActor =
  | { kind: "owner"; customerId: string }
  | { kind: "admin"; adminId: string };

/**
 * The Prisma `where` fragment that scopes a store lookup to this actor:
 * the owner sees only their own stores, an admin sees every store.
 *
 * Spread it into the lookup — `{ ...storeScope(actor), OR: [{ id }, { slug }] }`
 * — so the id-or-slug resolution stays identical for both callers.
 */
export function storeScope(actor: StoreActor): { ownerId?: string } {
  return actor.kind === "owner" ? { ownerId: actor.customerId } : {};
}

/**
 * Resolves the actor from the request.
 *
 * `request.admin` is set only by `requireAdmin` and `request.customer` only by
 * `requireCustomer`, and a token of the wrong kind is rejected by the guard
 * before any handler runs — so whichever field is populated is authentic.
 * Admin is checked first because the admin mount carries no customer session
 * at all.
 */
export function storeActor(request: FastifyRequest): StoreActor {
  if (request.admin) {
    return { kind: "admin", adminId: request.admin.id };
  }
  return { kind: "owner", customerId: request.customer!.id };
}

import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../package/auth/index.js";
import * as controller from "./cart.controller.js";

/**
 * The signed-in customer's cart. Mounted at /api/v1/cart — every route
 * requires a customer token and resolves the cart from it, so no route takes
 * a cart id.
 *
 * There is deliberately **no public/guest variant**. A guest's cart lives in
 * their browser (localStorage) and is merged in at sign-in; issuing anonymous
 * cart identities server-side would buy nothing and cost a second, unowned
 * lifecycle to expire and reconcile.
 *
 * Mutations are rate-limited because this is a client-driven mirror: the
 * storefront debounces its pushes, but the ceiling is what stops a stuck tab
 * from hammering the write path.
 */
export const cartRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);

  const writeLimit = {
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
  };

  app.get("/", controller.getCart);
  // Whole-cart mirror — see `cartReplaceSchema` for why this is a replace.
  app.put("/", writeLimit, controller.replaceCart);
  // Sign-in reconciliation: guest cart ∪ account cart.
  app.post("/merge", writeLimit, controller.mergeCart);
  app.delete("/", writeLimit, controller.clearCart);
  // One store's lines — "clear this basket" without touching the others.
  app.delete("/stores/:slug", writeLimit, controller.clearStore);
};

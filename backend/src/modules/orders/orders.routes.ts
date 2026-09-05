import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../package/auth/index.js";
import * as controller from "./orders.controller.js";
import * as paymentsController from "../payments/payments.controller.js";

/**
 * Storefront order placement + confirmation lookup. Mounted alongside the
 * public store surface at /api/v1/public/stores. Placing an order requires a
 * signed-in customer (guests browse and fill a cart, but must sign in to
 * order); the confirmation lookup stays anonymous so the success link keeps
 * working in a fresh session. Published stores only, all pricing/stock
 * re-validated server-side.
 */
export const publicOrderRoutes: FastifyPluginAsync = async (app) => {
  // Price summary for the checkout — the server quotes subtotal, shipping,
  // tax, discount and total so the client never computes money itself.
  // Static segment registered before the :orderId matcher below.
  app.post(
    "/:slug/orders/quote",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    controller.quoteOrder,
  );
  app.post(
    "/:slug/orders",
    {
      preHandler: requireCustomer,
      // Placing an order decrements stock even while unpaid — cap the rate
      // so a hostile client can't zero out a store's inventory in a burst.
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    controller.createOrder,
  );
  app.get("/:slug/orders/:orderId", controller.getOrder);
  // "Pay now / Retry payment" for an unpaid ONLINE order — returns a usable
  // Cashfree payment session (reusing the active one when possible).
  app.post(
    "/:slug/orders/:orderId/pay",
    {
      preHandler: requireCustomer,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    paymentsController.createPaySession,
  );
};

/**
 * The signed-in customer's order history — the account Orders page.
 * Mounted at /api/v1/orders. (The auth package's /auth/me/orders predates
 * this; this one carries the full shaped orders incl. item thumbnails.)
 */
export const customerOrderRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);
  app.get("/", controller.listMyOrders);
};

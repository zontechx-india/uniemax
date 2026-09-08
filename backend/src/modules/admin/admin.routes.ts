import type { FastifyPluginAsync } from "fastify";
import * as controller from "./admin.controller.js";

/**
 * The platform-admin console API. Mounted at /api/v1/admin, INSIDE the
 * `requireAdmin` subtree in `routes.ts` — every route below is already
 * guarded, so none of them repeats the guard.
 *
 * Read endpoints are plain GETs; the handful of writes are moderation levers
 * (suspend a store, block a customer, verify a payout account, hide a
 * product) and admin-account management. Fulfilment stays with the seller.
 */
export const adminConsoleRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard", controller.getDashboard);

  // Stores + payout-account verification
  app.get("/stores", controller.listStores);
  app.get("/stores/:id", controller.getStore);
  app.patch("/stores/:id/suspend", controller.suspendStore);
  app.patch(
    "/stores/:id/bank-accounts/:accountId/verification",
    controller.verifyBankAccount,
  );

  // Customers (buyers and sellers are the same account type)
  app.get("/customers", controller.listCustomers);
  app.get("/customers/:id", controller.getCustomer);
  app.patch("/customers/:id/block", controller.blockCustomer);

  // Orders + payments — read-only across every store
  app.get("/orders", controller.listOrders);
  app.get("/orders/:id", controller.getOrder);
  app.get("/payments", controller.listPayments);

  // Catalog oversight. Namespaced under /catalog because /admin/products is
  // already taken by the original single-tenant catalog (`modules/product`);
  // these are the SELLERS' products, which is a different thing entirely.
  app.get("/catalog/products", controller.listProducts);
  app.get("/catalog/products/:id", controller.getProduct);
  app.patch("/catalog/products/:id/visibility", controller.setProductVisibility);

  // Pointing sellers' legacy free-text shelves at the global taxonomy.
  app.get("/catalog/shelves", controller.listShelfMappings);
  app.patch("/catalog/shelves/:id/category", controller.setShelfMapping);

  // Who did what
  app.get("/audit", controller.getAudit);

  // Admin accounts — the controller enforces SUPER_ADMIN on each.
  app.get("/admins", controller.listAdmins);
  app.post("/admins", controller.createAdmin);
  app.patch("/admins/:id", controller.updateAdmin);
  app.post("/admins/:id/password", controller.resetAdminPassword);
};

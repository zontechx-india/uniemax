import type { FastifyPluginAsync } from "fastify";
import { requireCustomer } from "../../package/auth/index.js";
import * as controller from "./bills.controller.js";

/**
 * Seller bills (docs/API.md → Seller bills).
 *
 *   seller → /api/v1/stores/:id/bills/**      owner only (requireCustomer;
 *                                             ownership checked in the service)
 *   public → /api/v1/public/bills/:token      the customer's bill page; paying
 *                                             needs a signed-in customer
 *   admin  → /api/v1/admin/bills/**           read-only, inside requireAdmin
 */
export const sellerBillRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireCustomer);
  app.get("/:id/bills", controller.listBills);
  app.post("/:id/bills", controller.createBill);
  // The item picker (registered before /:billId so "catalog" is not read as an id).
  app.get("/:id/bills/catalog", controller.billCatalog);
  app.get("/:id/bills/catalog/categories", controller.billCatalogCategories);
  app.get("/:id/bills/catalog/often", controller.oftenBilled);
  app.get("/:id/bills/:billId", controller.getBill);
  app.post("/:id/bills/:billId/share", controller.shareBill);
  app.post("/:id/bills/:billId/cancel", controller.cancelBill);
};

export const publicBillRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:token", controller.getPublicBill);
  app.post("/:token/pay", { preHandler: requireCustomer }, controller.payBill);
};

export const adminBillRoutes: FastifyPluginAsync = async (app) => {
  app.get("/", controller.adminListBills);
  app.get("/:id", controller.adminGetBill);
};

import type { FastifyPluginAsync } from "fastify";
import * as controller from "./finance.controller.js";

/**
 * Seller finance — admin. Mounted at /api/v1/admin inside the
 * `requireAdmin` subtree (routes.ts). The seller's own read lives on the
 * store routes (GET /stores/:id/earnings, /platform-fee).
 */
export const adminFinanceRoutes: FastifyPluginAsync = async (app) => {
  app.get("/finance/fee-rules", controller.listFeeRules);
  app.post("/finance/fee-rules", controller.createFeeRule);

  app.get("/finance/balances", controller.listBalances);
  app.get("/finance/stores/:storeId", controller.getStoreFinance);
  app.get("/finance/stores/:storeId/ledger", controller.listLedger);
  app.post("/finance/stores/:storeId/adjustments", controller.addAdjustment);

  app.get("/orders/:id/financials", controller.getOrderFinancials);
};

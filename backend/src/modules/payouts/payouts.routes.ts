import type { FastifyPluginAsync } from "fastify";
import * as controller from "./payouts.controller.js";

/**
 * Seller payouts. Mounted at /api/v1/admin inside the `requireAdmin`
 * subtree (routes.ts) — every route is already guarded.
 */
export const adminPayoutRoutes: FastifyPluginAsync = async (app) => {
  // One order's payout section.
  app.get("/orders/:id/payouts", controller.getOrderPayouts);
  app.post("/orders/:id/payouts/manual", controller.recordManualPayout);
  app.post("/orders/:id/payouts/gateway", controller.triggerGatewayPayout);
  app.post("/orders/:id/payouts/:payoutId/resend", controller.resendGatewayPayout);
  app.patch("/orders/:id/payouts/:payoutId/status", controller.updatePayoutStatus);

  // Across every order — tracking and reconciliation. "seller-" keeps these
  // apart from the dropship package's supplier payouts (/admin/dropship/payouts).
  app.get("/seller-payouts", controller.listPayouts);
  app.get("/seller-payouts/awaiting", controller.listAwaitingPayout);
};

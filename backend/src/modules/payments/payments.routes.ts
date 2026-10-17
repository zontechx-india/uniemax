import type { FastifyPluginAsync } from "fastify";
import * as controller from "./payments.controller.js";

/**
 * Payment webhooks (Cashfree, PaymentHub) — mounted at /api/v1/payments. No
 * auth guard (the gateway/hub is the caller; authenticity comes from the HMAC
 * signature check) and no rate limit (a burst of retries after our downtime
 * must drain, not 429).
 *
 * This plugin scope replaces the JSON body parser with a raw-buffer parser:
 * both signatures are HMACs over timestamp + raw bytes, so the handlers must
 * see the body exactly as it was sent. Encapsulation keeps every other route's
 * JSON parsing untouched.
 */
export const paymentRoutes: FastifyPluginAsync = async (app) => {
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  app.post(
    "/webhooks/cashfree",
    { config: { rateLimit: false } },
    controller.handleCashfreeWebhook,
  );

  // PaymentHub (Zontechx payment service) → us. Same rules as above: HMAC
  // over the raw bytes, no auth guard, no rate limit. Its events are small,
  // so the body limit is 64 KB instead of the global default.
  app.post(
    "/webhooks/paymenthub",
    { bodyLimit: 64 * 1024, config: { rateLimit: false } },
    controller.handlePaymentHubWebhook,
  );
};

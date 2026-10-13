import type { FastifyError, FastifyPluginAsync } from "fastify";
import { errorHandler } from "../../middleware/errorHandler.js";
import { WaApiError } from "./whatsapp.client.js";
import * as controller from "./whatsapp.controller.js";
import { assertEnabled } from "./whatsapp.service.js";

/**
 * WhatsApp Cloud API routes. Two trees, mounted in `routes.ts` as:
 *   /api/v1/whatsapp        (public — Meta's webhook, HMAC-guarded)
 *   /api/v1/admin/whatsapp  (inside /admin's requireAdmin guard)
 *
 * With WA_ENABLED=false every route answers 503 except GET /admin/whatsapp/status.
 */

/**
 * Webhook — no auth guard (Meta is the caller; authenticity is the
 * X-Hub-Signature-256 check) and no rate limit (Meta's retry bursts after our
 * downtime must drain, not 429).
 *
 * This scope replaces the JSON parser with a raw-buffer one so the HMAC is
 * computed over the exact bytes Meta signed. Encapsulation keeps every other
 * route's JSON parsing untouched — same technique as the Cashfree webhook.
 */
export const publicWhatsAppRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async () => assertEnabled());
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_request, body, done) => done(null, body),
  );

  app.get("/webhook", { config: { rateLimit: false } }, controller.verifyWebhook);
  app.post("/webhook", { config: { rateLimit: false } }, controller.receiveWebhook);
};

export const adminWhatsAppRoutes: FastifyPluginAsync = async (app) => {
  // A Graph API refusal answers with Meta's own error code beside the usual
  // envelope ({ …, code, message }); everything else goes to the central handler.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof WaApiError) {
      return reply.status(error.statusCode).send({
        success: false,
        statusCode: error.statusCode,
        error: error.name,
        code: error.code,
        message: error.message,
      });
    }
    return errorHandler(error, request, reply);
  });

  // Answers even while disabled — the console explains "not configured"
  // from it instead of meeting a wall of 503s.
  app.get("/status", controller.getStatus);

  await app.register(async (enabled) => {
    enabled.addHook("preHandler", async () => assertEnabled());

    enabled.post("/send-template", controller.sendTemplate);
    enabled.post("/send-text", controller.sendText);
    enabled.get("/templates", controller.listTemplates);
    enabled.get("/contacts", controller.listContacts);
    enabled.get("/contacts/:waId", controller.getContact);
    enabled.get("/messages/:waId", controller.getConversation);
    enabled.get("/campaigns", controller.listCampaigns);
    enabled.post(
      "/campaigns",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      controller.createCampaign,
    );
    enabled.get("/campaigns/:id", controller.getCampaign);
  });
};

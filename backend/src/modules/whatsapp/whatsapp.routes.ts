import type { FastifyError, FastifyPluginAsync } from "fastify";
import { errorHandler } from "../../middleware/errorHandler.js";
import { WaApiError } from "./whatsapp.client.js";
import * as controller from "./whatsapp.controller.js";
import { assertEnabled } from "./whatsapp.service.js";

/**
 * WhatsApp Cloud API routes. Three trees, mounted in `routes.ts` as:
 *   /api/v1/whatsapp        (public — Meta's webhook, HMAC-guarded)
 *   /api/v1/r               (public — tracked campaign links)
 *   /api/v1/admin/whatsapp  (inside /admin's requireAdmin guard)
 *
 * With WA_ENABLED=false every route answers 503 except GET /admin/whatsapp/status
 * and the link redirect (a link already in someone's chat keeps working).
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

/** `GET /api/v1/r/:code` — a template button's tracked link. */
export const publicWaLinkRoutes: FastifyPluginAsync = async (app) => {
  app.get("/:code", controller.followLink);
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

    enabled.get("/overview", controller.getOverview);

    // Sending
    enabled.post("/send-template", controller.sendTemplate);
    enabled.post("/send-text", controller.sendText);
    enabled.post("/send-media", controller.sendMedia);
    enabled.post(
      "/media",
      { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
      controller.uploadMedia,
    );
    enabled.get("/templates", controller.listTemplates);

    // Inbox
    enabled.get("/contacts", controller.listContacts);
    enabled.post(
      "/contacts/import",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      controller.importContacts,
    );
    enabled.get("/contacts/:waId", controller.getContact);
    enabled.patch("/contacts/:waId", controller.updateContact);
    enabled.post("/contacts/:waId/read", controller.markRead);
    enabled.get("/messages/:waId", controller.getConversation);
    enabled.get("/tags", controller.listTags);
    enabled.get("/quick-replies", controller.listQuickReplies);
    enabled.post("/quick-replies", controller.createQuickReply);
    enabled.put("/quick-replies/:id", controller.updateQuickReply);
    enabled.delete("/quick-replies/:id", controller.deleteQuickReply);

    // Audiences
    enabled.get("/fields", controller.listFields);
    enabled.post("/audiences/preview", controller.previewAudience);
    enabled.get("/segments", controller.listSegments);
    enabled.post("/segments", controller.createSegment);
    enabled.put("/segments/:id", controller.updateSegment);
    enabled.delete("/segments/:id", controller.deleteSegment);
    enabled.get("/stores/search", controller.searchStores);

    // Campaigns
    enabled.get("/campaigns", controller.listCampaigns);
    enabled.post("/campaigns/preview", controller.previewCampaign);
    enabled.post(
      "/campaigns/test",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      controller.testCampaign,
    );
    enabled.post(
      "/campaigns",
      { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
      controller.createCampaign,
    );
    enabled.get("/campaigns/:id", controller.getCampaign);
    enabled.post("/campaigns/:id/control", controller.controlCampaign);
    enabled.get("/campaigns/:id/recipients", controller.listRecipients);
    enabled.get("/campaigns/:id/recipients.csv", controller.exportRecipients);

    // Automations
    enabled.get("/automations", controller.listAutomations);
    enabled.put("/automations/:key", controller.updateAutomation);
    enabled.get("/automations/:key/runs", controller.listAutomationRuns);

    // Seller reminders (store page)
    enabled.get("/stores/:id/reminders", controller.getSellerReminders);
    enabled.post(
      "/stores/:id/reminders",
      { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
      controller.sendSellerReminder,
    );
  });
};

import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import { list, ok } from "../../utils/response.js";
import { recordAudit } from "../admin/adminAudit.js";
import * as schema from "./whatsapp.schema.js";
import * as service from "./whatsapp.service.js";
import { normalizeWaId, verifySignature } from "./whatsapp.webhook.js";

// ---- Webhook (public — Meta is the caller) ---------------------------------

/**
 * Meta's subscription handshake: echo hub.challenge as plain text when the
 * verify token matches the one configured for THIS environment's Meta app.
 */
export async function verifyWebhook(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as Record<string, string | undefined>;
  if (
    query["hub.mode"] === "subscribe" &&
    query["hub.verify_token"] === env.WA_VERIFY_TOKEN &&
    typeof query["hub.challenge"] === "string"
  ) {
    return reply.status(200).type("text/plain").send(query["hub.challenge"]);
  }
  return reply.status(403).type("text/plain").send("Forbidden");
}

/**
 * Event receiver. The route's scope parses application/json to a raw Buffer
 * so the HMAC covers the exact bytes Meta signed. Verified events are
 * acknowledged at once and processed after the reply — Meta retries anything
 * slower than a few seconds, and every write is idempotent.
 */
export async function receiveWebhook(request: FastifyRequest, reply: FastifyReply) {
  const rawBody = request.body;
  const signature = request.headers["x-hub-signature-256"];
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    !verifySignature(rawBody, signature, env.WA_APP_SECRET ?? "")
  ) {
    throw HttpError.unauthorized("Invalid webhook signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw HttpError.badRequest("Invalid webhook payload");
  }

  reply.status(200).send({ received: true });
  const log = request.server.log;
  void service
    .processWebhook(payload, log)
    .catch((error: unknown) => log.error({ err: error }, "whatsapp: webhook processing failed"));
  return reply;
}

// ---- Admin -------------------------------------------------------------------

export async function sendTemplate(request: FastifyRequest) {
  const input = schema.sendTemplateSchema.parse(request.body);
  const result = await service.sendTemplate(input, request.log);
  recordAudit(request, {
    action: "whatsapp.send_template",
    entityType: "WaContact",
    entityId: normalizeWaId(input.to),
    meta: { templateName: input.templateName, wamid: result.messages?.[0]?.id ?? null },
  });
  return ok(result);
}

export async function sendText(request: FastifyRequest) {
  const input = schema.sendTextSchema.parse(request.body);
  const result = await service.sendText(input, request.log);
  recordAudit(request, {
    action: "whatsapp.send_text",
    entityType: "WaContact",
    entityId: normalizeWaId(input.to),
    meta: { wamid: result.messages?.[0]?.id ?? null },
  });
  return ok(result);
}

export async function createCampaign(request: FastifyRequest, reply: FastifyReply) {
  const input = schema.createCampaignSchema.parse(request.body);
  // Background sends outlive the request — log through the app, not the request.
  const result = await service.startCampaign(input, request.server.log);
  recordAudit(request, {
    action: "whatsapp.campaign_create",
    entityType: "WaCampaign",
    entityId: result.campaignId,
    meta: {
      name: input.name,
      templateName: input.templateName,
      recipients: input.recipients.length,
    },
  });
  return reply.status(202).send(ok(result));
}

export async function getCampaign(request: FastifyRequest) {
  const { id } = schema.campaignParamSchema.parse(request.params);
  return ok(await service.getCampaign(id));
}

export async function getConversation(request: FastifyRequest) {
  const { waId } = schema.waIdParamSchema.parse(request.params);
  const { page, pageSize } = schema.messageListQuery.parse(request.query);
  const { rows, meta } = await service.getConversation(waId, page, pageSize);
  return list(rows, meta);
}

export async function getStatus() {
  return ok(await service.getStatus());
}

export async function listContacts(request: FastifyRequest) {
  const query = schema.contactListQuery.parse(request.query);
  const { rows, meta } = await service.listContacts(query);
  return list(rows, meta);
}

export async function getContact(request: FastifyRequest) {
  const { waId } = schema.waIdParamSchema.parse(request.params);
  return ok(await service.getContact(waId));
}

export async function listCampaigns(request: FastifyRequest) {
  const { page, pageSize } = schema.campaignListQuery.parse(request.query);
  const { rows, meta } = await service.listCampaigns(page, pageSize);
  return list(rows, meta);
}

export async function listTemplates(request: FastifyRequest) {
  const { refresh } = schema.templatesQuery.parse(request.query);
  return ok(await service.getTemplates(refresh, request.log));
}

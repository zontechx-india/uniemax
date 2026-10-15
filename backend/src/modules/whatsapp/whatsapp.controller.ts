import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { mediaUrl, newObjectKey, readUpload, storeUpload } from "../../package/storage/index.js";
import { HttpError } from "../../utils/httpError.js";
import { list, ok } from "../../utils/response.js";
import { recordAudit } from "../admin/adminAudit.js";
import * as audiences from "./whatsapp.audiences.js";
import * as automations from "./whatsapp.automations.js";
import * as campaigns from "./whatsapp.campaigns.js";
import { FIELD_CATALOGUE } from "./whatsapp.fields.js";
import * as schema from "./whatsapp.schema.js";
import * as reminders from "./whatsapp.sellerReminders.js";
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

/** A tracked campaign link: count the click, redirect (public, no auth). */
export async function followLink(request: FastifyRequest, reply: FastifyReply) {
  const { code } = request.params as { code?: string };
  const url = await campaigns.followLink(code ?? "");
  return reply.header("cache-control", "no-store").redirect(url, 302);
}

// ---- Admin: sending ------------------------------------------------------------

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

export async function sendMedia(request: FastifyRequest) {
  const input = schema.sendMediaSchema.parse(request.body);
  const result = await service.sendMedia(input, request.log);
  recordAudit(request, {
    action: "whatsapp.send_media",
    entityType: "WaContact",
    entityId: normalizeWaId(input.to),
    meta: { type: input.type, wamid: result.messages?.[0]?.id ?? null },
  });
  return ok(result);
}

/** Types WhatsApp accepts for an image / video message or header. */
const WA_MEDIA_TYPES: Record<string, "image" | "video"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "video/mp4": "video",
};

/**
 * Upload a photo or video to the media bucket and answer its public URL —
 * what a media message or a template's media header links to. Meta fetches
 * it from that URL, so it must be publicly reachable (S3 in production).
 */
export async function uploadMedia(request: FastifyRequest) {
  const file = await readUpload(request, "auto");
  const type = WA_MEDIA_TYPES[file.contentType];
  if (!type) {
    throw HttpError.badRequest("WhatsApp takes JPEG or PNG photos and MP4 videos");
  }
  const key = newObjectKey("whatsapp", file.contentType);
  await storeUpload("media", key, file);
  return ok({ url: mediaUrl("media", key), type });
}

// ---- Admin: inbox ------------------------------------------------------------

export async function getConversation(request: FastifyRequest) {
  const { waId } = schema.waIdParamSchema.parse(request.params);
  const { page, pageSize } = schema.messageListQuery.parse(request.query);
  const { rows, meta } = await service.getConversation(waId, page, pageSize);
  return list(rows, meta);
}

export async function getStatus() {
  return ok(await service.getStatus());
}

export async function getOverview(request: FastifyRequest) {
  return ok(await service.getOverview(request.log));
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

export async function updateContact(request: FastifyRequest) {
  const { waId } = schema.waIdParamSchema.parse(request.params);
  const input = schema.updateContactSchema.parse(request.body);
  const result = await service.updateContact(waId, input);
  if (input.marketingOptIn !== undefined) {
    recordAudit(request, {
      action: "whatsapp.contact_consent",
      entityType: "WaContact",
      entityId: normalizeWaId(waId),
      meta: { marketingOptIn: input.marketingOptIn },
    });
  }
  return ok(result);
}

export async function markRead(request: FastifyRequest) {
  const { waId } = schema.waIdParamSchema.parse(request.params);
  await service.markRead(waId);
  return ok({ read: true });
}

export async function importContacts(request: FastifyRequest) {
  const input = schema.importContactsSchema.parse(request.body);
  const result = await service.importContacts(input);
  recordAudit(request, {
    action: "whatsapp.contacts_import",
    entityType: "WaContact",
    entityId: "import",
    meta: { created: result.created, updated: result.updated, invalid: result.invalidCount },
  });
  return ok(result);
}

export async function listTags() {
  return ok(await service.listTags());
}

export async function listQuickReplies() {
  return ok(await service.listQuickReplies());
}

export async function createQuickReply(request: FastifyRequest, reply: FastifyReply) {
  const input = schema.quickReplySchema.parse(request.body);
  return reply.status(201).send(ok(await service.createQuickReply(input)));
}

export async function updateQuickReply(request: FastifyRequest) {
  const { id } = schema.idParamSchema.parse(request.params);
  const input = schema.quickReplySchema.parse(request.body);
  return ok(await service.updateQuickReply(id, input));
}

export async function deleteQuickReply(request: FastifyRequest) {
  const { id } = schema.idParamSchema.parse(request.params);
  await service.deleteQuickReply(id);
  return ok({ deleted: true });
}

export async function listTemplates(request: FastifyRequest) {
  const { refresh } = schema.templatesQuery.parse(request.query);
  return ok(await service.getTemplates(refresh, request.log));
}

// ---- Admin: audiences ----------------------------------------------------------

export async function listFields() {
  return ok(FIELD_CATALOGUE);
}

export async function previewAudience(request: FastifyRequest) {
  const { audience } = schema.audiencePreviewSchema.parse(request.body);
  return ok(await audiences.previewAudience(audience));
}

export async function listSegments() {
  return ok(await audiences.listSegmentsWithCounts());
}

export async function createSegment(request: FastifyRequest, reply: FastifyReply) {
  const input = schema.segmentSchema.parse(request.body);
  return reply.status(201).send(ok(await audiences.createSegment(input)));
}

export async function updateSegment(request: FastifyRequest) {
  const { id } = schema.idParamSchema.parse(request.params);
  const input = schema.segmentSchema.parse(request.body);
  return ok(await audiences.updateSegment(id, input));
}

export async function deleteSegment(request: FastifyRequest) {
  const { id } = schema.idParamSchema.parse(request.params);
  await audiences.deleteSegment(id);
  return ok({ deleted: true });
}

export async function searchStores(request: FastifyRequest) {
  const { q } = request.query as { q?: string };
  return ok(await audiences.searchStores((q ?? "").trim().slice(0, 100)));
}

// ---- Admin: campaigns ----------------------------------------------------------

export async function listCampaigns(request: FastifyRequest) {
  const { page, pageSize } = schema.campaignListQuery.parse(request.query);
  const { rows, meta } = await campaigns.listCampaigns(page, pageSize);
  return list(rows, meta);
}

export async function previewCampaign(request: FastifyRequest) {
  const draft = schema.campaignDraftSchema.parse(request.body);
  return ok(await campaigns.previewCampaign(draft, request.log));
}

export async function testCampaign(request: FastifyRequest) {
  const draft = schema.campaignTestSchema.parse(request.body);
  const result = await campaigns.testCampaign(draft, request.log);
  recordAudit(request, {
    action: "whatsapp.campaign_test",
    entityType: "WaContact",
    entityId: normalizeWaId(draft.to),
    meta: { templateName: draft.templateName },
  });
  return ok(result);
}

export async function createCampaign(request: FastifyRequest, reply: FastifyReply) {
  const draft = schema.campaignDraftSchema.parse(request.body);
  // Sends run in the background worker — log through the app, not the request.
  const result = await campaigns.createCampaign(draft, request.admin?.id ?? null, request.server.log);
  recordAudit(request, {
    action: "whatsapp.campaign_create",
    entityType: "WaCampaign",
    entityId: result.campaignId,
    meta: {
      name: draft.name,
      templateName: draft.templateName,
      audience: draft.audience.kind,
      eligible: result.eligible,
      scheduledAt: draft.scheduledAt?.toISOString() ?? null,
    },
  });
  return reply.status(202).send(ok(result));
}

export async function getCampaign(request: FastifyRequest) {
  const { id } = schema.campaignParamSchema.parse(request.params);
  return ok(await campaigns.getCampaign(id));
}

export async function controlCampaign(request: FastifyRequest) {
  const { id } = schema.campaignParamSchema.parse(request.params);
  const { action } = schema.campaignActionSchema.parse(request.body);
  const result = await campaigns.controlCampaign(id, action, request.server.log);
  recordAudit(request, {
    action: `whatsapp.campaign_${action}`,
    entityType: "WaCampaign",
    entityId: id,
  });
  return ok(result);
}

export async function listRecipients(request: FastifyRequest) {
  const { id } = schema.campaignParamSchema.parse(request.params);
  const query = schema.recipientListQuery.parse(request.query);
  const { rows, meta } = await campaigns.listRecipients(id, query);
  return list(rows, meta);
}

export async function exportRecipients(request: FastifyRequest, reply: FastifyReply) {
  const { id } = schema.campaignParamSchema.parse(request.params);
  const { filename, csv } = await campaigns.exportRecipients(id);
  return reply
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="${filename}"`)
    .send(csv);
}

// ---- Admin: automations --------------------------------------------------------

export async function listAutomations() {
  return ok(await automations.listAutomations());
}

export async function updateAutomation(request: FastifyRequest) {
  const { key } = schema.automationParamSchema.parse(request.params);
  const input = schema.updateAutomationSchema.parse(request.body);
  const result = await automations.updateAutomation(key, input, request.admin?.id ?? null, request.log);
  recordAudit(request, {
    action: "whatsapp.automation_update",
    entityType: "WaAutomation",
    entityId: key,
    meta: { enabled: input.enabled, templateName: input.templateName },
  });
  return ok(result);
}

export async function listAutomationRuns(request: FastifyRequest) {
  const { key } = schema.automationParamSchema.parse(request.params);
  const { page, pageSize } = schema.campaignListQuery.parse(request.query);
  const { rows, meta } = await automations.listRuns(key, page, pageSize);
  return list(rows, meta);
}

// ---- Seller reminders ---------------------------------------------------------

export async function getSellerReminders(request: FastifyRequest) {
  const { id } = schema.storeParamSchema.parse(request.params);
  return ok(await reminders.getSellerReminders(id, request.log));
}

export async function sendSellerReminder(request: FastifyRequest) {
  const { id } = schema.storeParamSchema.parse(request.params);
  const { key } = schema.sendSellerReminderSchema.parse(request.body);
  const result = await reminders.sendSellerReminder(id, key, request.log);
  recordAudit(request, {
    action: "whatsapp.seller_reminder",
    entityType: "Store",
    entityId: result.storeId,
    meta: { key, templateName: result.templateName, wamid: result.wamid },
  });
  return ok(result.state);
}

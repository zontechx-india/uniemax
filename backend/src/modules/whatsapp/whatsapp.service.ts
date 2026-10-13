import type { FastifyBaseLogger } from "fastify";
import { env, isProduction } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { listTemplates, sendMessage, WaApiError } from "./whatsapp.client.js";
import * as repo from "./whatsapp.repository.js";
import type {
  ContactListQuery,
  CreateCampaignInput,
  SendTemplateInput,
  SendTextInput,
} from "./whatsapp.schema.js";
import {
  normalizeWaId,
  optIntent,
  parseAllowlist,
  parseWebhookPayload,
} from "./whatsapp.webhook.js";
import {
  fillTemplateBody,
  summarizeTemplate,
  templateSendProblem,
} from "./whatsapp.templates.js";
import type { TemplateSummary } from "./whatsapp.templates.js";

/**
 * WhatsApp Cloud API rules:
 *
 *   - **Opt-out.** A contact who sent STOP/UNSUBSCRIBE gets nothing (409)
 *     until they send START. Campaigns skip them.
 *   - **24h window.** Free-form text only within 24h of the contact's last
 *     inbound message (Meta's customer-service window); otherwise 422 — use
 *     an approved template.
 *   - **Dev allowlist.** Outside production a send to any number not in
 *     WA_DEV_ALLOWED_RECIPIENTS is refused (403), so a dev database full of
 *     real numbers can never message a real customer.
 *   - **Privacy.** Production logs carry ids, types and error codes — never a
 *     customer's message body.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;
const devAllowlist = parseAllowlist(env.WA_DEV_ALLOWED_RECIPIENTS);

export function assertEnabled(): void {
  if (!env.WA_ENABLED) {
    throw new HttpError(503, "WhatsApp integration is disabled");
  }
}

function assertAllowedRecipient(waId: string): void {
  if (!isProduction && !devAllowlist.has(waId)) {
    throw HttpError.forbidden(
      `${waId} is not in WA_DEV_ALLOWED_RECIPIENTS — non-production sends are allowlisted`,
    );
  }
}

async function assertNotOptedOut(waId: string): Promise<void> {
  const contact = await repo.findContact(waId);
  if (contact?.optedOut) {
    throw HttpError.conflict(`${waId} has opted out of WhatsApp messages`);
  }
}

// ---- Sending ---------------------------------------------------------------

interface Outbound {
  waId: string;
  type: "template" | "text";
  /** Stored body: the text, or the template params joined — never logged in prod. */
  body: string | null;
  templateName: string | null;
  campaignId: string | null;
  payload: Record<string, unknown>;
}

/**
 * Calls the Graph API and records the WaMessage either way — accepted with
 * Meta's wamid, or failed with none — so the conversation shows the attempt.
 */
async function deliver(outbound: Outbound, log: FastifyBaseLogger) {
  await repo.touchOutboundContact(outbound.waId);
  const record = {
    waId: outbound.waId,
    type: outbound.type,
    body: outbound.body,
    templateName: outbound.templateName,
    campaignId: outbound.campaignId,
  };
  try {
    const response = await sendMessage(outbound.payload, log);
    const wamid = response.messages?.[0]?.id ?? null;
    await repo.saveOutboundMessage({ ...record, wamid, lastStatus: "accepted" });
    log.info({ wa: { wamid, type: outbound.type } }, "whatsapp: message accepted");
    return response;
  } catch (error) {
    if (error instanceof WaApiError) {
      await repo.saveOutboundMessage({
        ...record,
        wamid: null,
        lastStatus: "failed",
        errorCode: error.code,
        errorTitle: error.title ?? error.message,
        errorDetails: error.details,
      });
    }
    throw error;
  }
}

export interface SendTemplateOptions {
  campaignId?: string | null;
  /**
   * Values for the template's dynamic URL buttons, in button order — the part
   * of the link after the template's fixed prefix. Server-built flows only;
   * the console's send schema has no such field.
   */
  buttonParams?: string[];
}

export async function sendTemplate(
  input: SendTemplateInput,
  log: FastifyBaseLogger,
  { campaignId = null, buttonParams = [] }: SendTemplateOptions = {},
) {
  const waId = normalizeWaId(input.to);
  assertAllowedRecipient(waId);
  await assertNotOptedOut(waId);

  // Same checks Meta would make, made first: language, value count, sendable.
  // Skipped (Meta decides) only when the template list itself is unavailable.
  const templates = await availableTemplates(log);
  if (templates) {
    const problem = templateSendProblem(
      templates,
      input.templateName,
      input.languageCode,
      input.bodyParams.length,
      buttonParams.length,
    );
    if (problem) throw new HttpError(422, problem);
  }
  const match = templates?.find(
    (t) => t.name === input.templateName && t.language === input.languageCode,
  );

  const template: Record<string, unknown> = {
    name: input.templateName,
    language: { code: input.languageCode },
  };
  const components: Record<string, unknown>[] = [];
  if (input.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: input.bodyParams.map((text) => ({ type: "text", text })),
    });
  }
  buttonParams.forEach((text, i) => {
    components.push({
      type: "button",
      sub_type: "url",
      // Meta wants the button's position among ALL the template's buttons.
      // Without the template list, assume the URL buttons come first.
      index: String(match?.urlButtons[i] ?? i),
      parameters: [{ type: "text", text }],
    });
  });
  if (components.length > 0) template["components"] = components;

  return deliver(
    {
      waId,
      type: "template",
      // What the recipient reads: the body with its values filled in.
      body: match
        ? fillTemplateBody(match.body, input.bodyParams)
        : input.bodyParams.length > 0
          ? input.bodyParams.join(" · ")
          : null,
      templateName: input.templateName,
      campaignId,
      payload: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: waId,
        type: "template",
        template,
      },
    },
    log,
  );
}

/**
 * The WABA's templates for pre-send checks and the stored message text, or
 * null when Meta can't list them. After a failed fetch it backs off for a
 * TTL, so sends never wait on a failing lookup more than once a minute.
 */
async function availableTemplates(log: FastifyBaseLogger): Promise<TemplateSummary[] | null> {
  if (Date.now() - templateFailedAt < TEMPLATE_TTL_MS) return null;
  try {
    return await getTemplates(false, log);
  } catch {
    templateFailedAt = Date.now();
    return null;
  }
}

export async function sendText(input: SendTextInput, log: FastifyBaseLogger) {
  const waId = normalizeWaId(input.to);
  assertAllowedRecipient(waId);
  const contact = await repo.findContact(waId);
  if (contact?.optedOut) {
    throw HttpError.conflict(`${waId} has opted out of WhatsApp messages`);
  }
  const lastInbound = contact?.lastInboundAt?.getTime() ?? 0;
  if (Date.now() - lastInbound > WINDOW_MS) {
    throw new HttpError(422, "24h window closed, use a template");
  }

  return deliver(
    {
      waId,
      type: "text",
      body: input.text,
      templateName: null,
      campaignId: null,
      payload: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: waId,
        type: "text",
        text: { body: input.text, preview_url: false },
      },
    },
    log,
  );
}

// ---- Webhook ---------------------------------------------------------------

/**
 * Runs AFTER the 200 has gone back to Meta. Stores the raw event first (the
 * replay source), then applies messages and statuses. Every write is
 * idempotent, so Meta's retries are harmless.
 */
export async function processWebhook(
  payload: unknown,
  log: FastifyBaseLogger,
): Promise<void> {
  await repo.saveWebhookEvent(payload);
  const { messages, statuses } = parseWebhookPayload(payload);
  const now = new Date();

  for (const message of messages) {
    const intent = optIntent(message.type === "text" ? message.body : null);
    await repo.upsertInboundContact(
      message.waId,
      message.name,
      now,
      intent === null ? undefined : intent === "out",
    );
    const fresh = await repo.saveInboundMessage(message);
    log.info(
      {
        wa: {
          wamid: message.wamid,
          type: message.type,
          ...(intent ? { optIntent: intent } : {}),
          ...(fresh ? {} : { duplicate: true }),
          ...(isProduction ? {} : { from: message.waId, body: message.body }),
        },
      },
      "whatsapp: inbound message",
    );
  }

  for (const status of statuses) {
    const fresh = await repo.saveStatus(status);
    if (!fresh) continue;
    const message = await repo.advanceLastStatus(status.wamid, status.status, {
      errorCode: status.errorCode,
      errorTitle: status.errorTitle,
      errorDetails: status.errorDetails ?? status.errorMessage,
    });
    if (status.status === "failed") {
      log.warn(
        {
          wa: {
            wamid: status.wamid,
            errorCode: status.errorCode,
            errorTitle: status.errorTitle,
          },
        },
        "whatsapp: message failed",
      );
      if (message?.campaignId) {
        await repo.incrementCampaign(message.campaignId, "failed");
      }
    }
  }
}

// ---- Campaigns -------------------------------------------------------------

/**
 * Creates the campaign and returns at once; recipients are sent in the
 * background at WA_SEND_RATE_PER_SEC. Duplicate numbers in one campaign are
 * sent once and the repeats counted as skipped.
 *
 * In-process: a restart mid-campaign stops it, and the counters show how far
 * it got. `sent` = accepted by Meta; `failed` = refused at send OR reported
 * failed later by webhook (so one message can count in both).
 */
export async function startCampaign(
  input: CreateCampaignInput,
  log: FastifyBaseLogger,
): Promise<{ campaignId: string }> {
  // One check for the whole list, before anything is created or sent — a
  // wrong language or value count would otherwise fail every recipient.
  const templates = await availableTemplates(log);
  if (templates) {
    const counts = new Set(input.recipients.map((r) => r.bodyParams.length));
    for (const count of counts) {
      const problem = templateSendProblem(templates, input.templateName, input.languageCode, count);
      if (problem) throw new HttpError(422, problem);
    }
  }

  const campaign = await repo.createCampaign({
    name: input.name,
    templateName: input.templateName,
    languageCode: input.languageCode,
    total: input.recipients.length,
  });
  void runCampaign(campaign.id, input, log).catch((error: unknown) =>
    log.error({ err: error, campaignId: campaign.id }, "whatsapp: campaign aborted"),
  );
  return { campaignId: campaign.id };
}

async function runCampaign(
  campaignId: string,
  input: CreateCampaignInput,
  log: FastifyBaseLogger,
): Promise<void> {
  const interval = 1000 / env.WA_SEND_RATE_PER_SEC;
  const seen = new Set<string>();

  for (const recipient of input.recipients) {
    const waId = normalizeWaId(recipient.to);
    if (seen.has(waId)) {
      await repo.incrementCampaign(campaignId, "skipped");
      continue;
    }
    seen.add(waId);

    const startedAt = Date.now();
    try {
      await sendTemplate(
        {
          to: waId,
          templateName: input.templateName,
          languageCode: input.languageCode,
          bodyParams: recipient.bodyParams,
        },
        log,
        { campaignId },
      );
      await repo.incrementCampaign(campaignId, "sent");
    } catch (error) {
      // Opted out (409) or outside the dev allowlist (403): not an attempt.
      const skipped =
        error instanceof HttpError &&
        !(error instanceof WaApiError) &&
        (error.statusCode === 409 || error.statusCode === 403);
      await repo.incrementCampaign(campaignId, skipped ? "skipped" : "failed");
      if (!skipped && !(error instanceof WaApiError)) {
        log.error({ err: error, campaignId }, "whatsapp: campaign send error");
      }
    }

    const wait = interval - (Date.now() - startedAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  }
  await repo.finishCampaign(campaignId);
  log.info({ campaignId }, "whatsapp: campaign finished");
}

export async function getCampaign(id: string) {
  const found = await repo.getCampaignWithBreakdown(id);
  if (!found) throw HttpError.notFound("Campaign not found");
  const { campaign, byStatus, failures } = found;
  return {
    ...campaign,
    // Latest status of each campaign message (failed includes both refused
    // at send and failed after Meta accepted it).
    statuses: {
      accepted: byStatus["accepted"] ?? 0,
      sent: byStatus["sent"] ?? 0,
      delivered: byStatus["delivered"] ?? 0,
      read: byStatus["read"] ?? 0,
      failed: byStatus["failed"] ?? 0,
    },
    failures,
  };
}

// ---- Conversation ----------------------------------------------------------

export async function getConversation(waIdInput: string, page: number, pageSize: number) {
  const waId = normalizeWaId(waIdInput);
  const contact = await repo.findContact(waId);
  if (!contact) throw HttpError.notFound("Contact not found");
  const { total, rows } = await repo.listMessages(waId, page, pageSize);
  return { rows, meta: buildListMeta(total, page, pageSize) };
}

// ---- Console reads -----------------------------------------------------------

/**
 * What the console shows before anything else: is the integration on, which
 * number, and — outside production — who sends are limited to. Served even
 * while WA_ENABLED=false, so the page can say "not configured" instead of
 * failing. Never includes a secret.
 */
export async function getStatus() {
  return {
    enabled: env.WA_ENABLED,
    production: isProduction,
    phoneNumberId: env.WA_ENABLED ? (env.WA_PHONE_NUMBER_ID ?? null) : null,
    wabaId: env.WA_ENABLED ? (env.WA_WABA_ID ?? null) : null,
    graphVersion: env.WA_GRAPH_VERSION,
    sendRatePerSec: env.WA_SEND_RATE_PER_SEC,
    allowlist: isProduction ? null : [...devAllowlist],
    lastWebhookAt: env.WA_ENABLED ? await repo.lastWebhookAt() : null,
  };
}

function windowClosesAt(lastInboundAt: Date | null): Date | null {
  if (!lastInboundAt) return null;
  const closes = new Date(lastInboundAt.getTime() + WINDOW_MS);
  return closes.getTime() > Date.now() ? closes : null;
}

export async function listContacts(query: ContactListQuery) {
  const { total, rows } = await repo.listContacts({
    q: query.q,
    filter: query.filter,
    windowSince: new Date(Date.now() - WINDOW_MS),
    page: query.page,
    pageSize: query.pageSize,
  });
  return {
    rows: rows.map(({ messages, ...contact }) => ({
      waId: contact.waId,
      name: contact.name,
      optedOut: contact.optedOut,
      lastInboundAt: contact.lastInboundAt,
      lastMessageAt: contact.lastMessageAt,
      windowClosesAt: windowClosesAt(contact.lastInboundAt),
      lastMessage: messages[0] ?? null,
    })),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

export async function getContact(waIdInput: string) {
  const contact = await repo.getContactWithCounts(normalizeWaId(waIdInput));
  if (!contact) throw HttpError.notFound("Contact not found");
  const { _count, ...rest } = contact;
  return {
    ...rest,
    messageCount: _count.messages,
    windowClosesAt: windowClosesAt(contact.lastInboundAt),
  };
}

export async function listCampaigns(page: number, pageSize: number) {
  const { total, rows } = await repo.listCampaigns(page, pageSize);
  return { rows, meta: buildListMeta(total, page, pageSize) };
}

// Templates change only when someone edits them in WhatsApp Manager, and the
// console opens the picker often — one Graph call a minute is plenty.
const TEMPLATE_TTL_MS = 60_000;
let templateCache: { at: number; templates: TemplateSummary[] } | null = null;
/** Last failed fetch — renderTemplate backs off for a TTL after one. */
let templateFailedAt = 0;

export async function getTemplates(refresh: boolean, log: FastifyBaseLogger) {
  if (!refresh && templateCache && Date.now() - templateCache.at < TEMPLATE_TTL_MS) {
    return templateCache.templates;
  }
  const templates = (await listTemplates(log))
    .map(summarizeTemplate)
    // Sendable first, then by name — the picker reads top-down.
    .sort((a, b) => Number(b.sendable) - Number(a.sendable) || a.name.localeCompare(b.name));
  templateCache = { at: Date.now(), templates };
  return templates;
}

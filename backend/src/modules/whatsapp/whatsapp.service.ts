import type { FastifyBaseLogger } from "fastify";
import { env, isProduction } from "../../config/env.js";
import { prisma } from "../../config/prisma.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { getPhoneNumberInfo, listTemplates, sendMessage, WaApiError } from "./whatsapp.client.js";
import * as repo from "./whatsapp.repository.js";
import type {
  ContactListQuery,
  SendMediaInput,
  SendTemplateInput,
  SendTextInput,
} from "./whatsapp.schema.js";
import {
  normalizeWaId,
  optIntent,
  parseAllowlist,
  parseWebhookPayload,
  toWaId,
} from "./whatsapp.webhook.js";
import {
  fillTemplateBody,
  summarizeTemplate,
  templateSendProblem,
} from "./whatsapp.templates.js";
import type { TemplateSummary } from "./whatsapp.templates.js";
import type { GraphPhoneNumber } from "./whatsapp.types.js";

/**
 * WhatsApp Cloud API rules:
 *
 *   - **Opt-out.** A contact who sent STOP/UNSUBSCRIBE gets nothing (409)
 *     until they send START. Campaigns and automations skip them.
 *   - **24h window.** Free-form text and media only within 24h of the
 *     contact's last inbound message (Meta's customer-service window);
 *     otherwise 422 — use an approved template.
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

export function isAllowedRecipient(waId: string): boolean {
  return isProduction || devAllowlist.has(waId);
}

function assertAllowedRecipient(waId: string): void {
  if (!isAllowedRecipient(waId)) {
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

async function assertWindowOpen(waId: string): Promise<void> {
  const contact = await repo.findContact(waId);
  if (contact?.optedOut) {
    throw HttpError.conflict(`${waId} has opted out of WhatsApp messages`);
  }
  const lastInbound = contact?.lastInboundAt?.getTime() ?? 0;
  if (Date.now() - lastInbound > WINDOW_MS) {
    throw new HttpError(422, "24h window closed, use a template");
  }
}

// ---- Sending ---------------------------------------------------------------

interface Outbound {
  waId: string;
  type: string;
  /** Stored body: the text, or the template with its values — never logged in prod. */
  body: string | null;
  mediaId?: string | null;
  templateName: string | null;
  campaignId: string | null;
  automationKey: string | null;
  payload: Record<string, unknown>;
}

/**
 * Calls the Graph API and records the WaMessage either way — accepted with
 * Meta's wamid, or failed with none — so the conversation shows the attempt.
 * Answers Meta's response plus `recordId`, the stored message's id.
 */
async function deliver(outbound: Outbound, log: FastifyBaseLogger) {
  await repo.touchOutboundContact(outbound.waId);
  const record = {
    waId: outbound.waId,
    type: outbound.type,
    body: outbound.body,
    mediaId: outbound.mediaId ?? null,
    templateName: outbound.templateName,
    campaignId: outbound.campaignId,
    automationKey: outbound.automationKey,
  };
  try {
    const response = await sendMessage(outbound.payload, log);
    const wamid = response.messages?.[0]?.id ?? null;
    const saved = await repo.saveOutboundMessage({ ...record, wamid, lastStatus: "accepted" });
    log.info({ wa: { wamid, type: outbound.type } }, "whatsapp: message accepted");
    return { ...response, recordId: saved.id };
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
  automationKey?: string | null;
}

export async function sendTemplate(
  input: SendTemplateInput,
  log: FastifyBaseLogger,
  { campaignId = null, automationKey = null }: SendTemplateOptions = {},
) {
  const waId = normalizeWaId(input.to);
  assertAllowedRecipient(waId);
  await assertNotOptedOut(waId);

  // Same checks Meta would make, made first: language, counts, media header.
  // Skipped (Meta decides) only when the template list itself is unavailable.
  const templates = await availableTemplates(log);
  if (templates) {
    const problem = templateSendProblem(templates, input.templateName, input.languageCode, {
      params: input.bodyParams.length,
      buttons: input.buttonParams.length,
      headerMedia: input.header !== null,
    });
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
  if (input.header) {
    components.push({
      type: "header",
      parameters: [{ type: input.header.type, [input.header.type]: { link: input.header.link } }],
    });
  }
  if (input.bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: input.bodyParams.map((text) => ({ type: "text", text })),
    });
  }
  input.buttonParams.forEach((text, i) => {
    components.push({
      type: "button",
      sub_type: "url",
      // Meta wants the button's position among ALL the template's buttons.
      // Without the template list, assume the URL buttons come first.
      index: String(match?.urlButtons[i]?.index ?? i),
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
      automationKey,
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

export async function sendText(input: SendTextInput, log: FastifyBaseLogger) {
  const waId = normalizeWaId(input.to);
  assertAllowedRecipient(waId);
  await assertWindowOpen(waId);

  return deliver(
    {
      waId,
      type: "text",
      body: input.text,
      templateName: null,
      campaignId: null,
      automationKey: null,
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

/** A photo, video or document by link, inside the reply window. */
export async function sendMedia(input: SendMediaInput, log: FastifyBaseLogger) {
  const waId = normalizeWaId(input.to);
  assertAllowedRecipient(waId);
  await assertWindowOpen(waId);

  const media: Record<string, unknown> = { link: input.link };
  if (input.caption) media["caption"] = input.caption;
  if (input.type === "document" && input.filename) media["filename"] = input.filename;

  return deliver(
    {
      waId,
      type: input.type,
      // The thread shows the caption, or the link when there is none.
      body: input.caption || input.link,
      templateName: null,
      campaignId: null,
      automationKey: null,
      payload: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: waId,
        type: input.type,
        [input.type]: media,
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
    // The message first: a retried webhook must not count the same message
    // unread twice, and `fresh` says whether this is the first delivery.
    await repo.touchOutboundContact(message.waId);
    const fresh = await repo.saveInboundMessage(message);
    if (fresh) await repo.upsertInboundContact(message.waId, message.name, now, intent);
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

function shapeContact<
  T extends {
    waId: string;
    name: string | null;
    optedOut: boolean;
    marketingOptInAt: Date | null;
    marketingOptInSource: string | null;
    tags: string[];
    unreadCount: number;
    inboxState: "OPEN" | "DONE";
    lastInboundAt: Date | null;
    lastMessageAt: Date | null;
  },
>(contact: T) {
  return {
    waId: contact.waId,
    name: contact.name,
    optedOut: contact.optedOut,
    marketingOptInAt: contact.marketingOptInAt,
    marketingOptInSource: contact.marketingOptInSource,
    tags: contact.tags,
    unreadCount: contact.unreadCount,
    inboxState: contact.inboxState,
    lastInboundAt: contact.lastInboundAt,
    lastMessageAt: contact.lastMessageAt,
    windowClosesAt: windowClosesAt(contact.lastInboundAt),
  };
}

export async function listContacts(query: ContactListQuery) {
  const { total, rows } = await repo.listContacts({
    q: query.q,
    filter: query.filter,
    tag: query.tag,
    windowSince: new Date(Date.now() - WINDOW_MS),
    page: query.page,
    pageSize: query.pageSize,
  });
  return {
    rows: rows.map(({ messages, ...contact }) => ({
      ...shapeContact(contact),
      lastMessage: messages[0] ?? null,
    })),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/**
 * Who this number is on the platform — the stores it runs (by the store's
 * contact phone or the owner's login phone) and the customer account it
 * belongs to. Matched on the last 10 digits, since stored phones carry
 * every spelling ("98765 43210", "+919876543210").
 */
async function linkedProfiles(waId: string) {
  const tail = waId.length > 10 ? waId.slice(-10) : waId;
  const spaced = `${tail.slice(0, 5)} ${tail.slice(5)}`;
  const [stores, customers] = await Promise.all([
    prisma.store.findMany({
      where: {
        OR: [
          { owner: { phone: { endsWith: tail } } },
          { profile: { path: ["phone"], string_contains: tail } },
          { profile: { path: ["phone"], string_contains: spaced } },
        ],
      },
      select: { id: true, name: true, slug: true, isPublished: true, suspendedAt: true },
      take: 5,
    }),
    prisma.customer.findMany({
      where: { phone: { endsWith: tail } },
      select: { id: true, name: true, email: true, _count: { select: { orders: true } } },
      take: 3,
    }),
  ]);
  return {
    stores,
    customers: customers.map(({ _count, ...c }) => ({ ...c, orderCount: _count.orders })),
  };
}

export async function getContact(waIdInput: string) {
  const waId = normalizeWaId(waIdInput);
  const contact = await repo.getContactWithCounts(waId);
  if (!contact) throw HttpError.notFound("Contact not found");
  return {
    ...shapeContact(contact),
    createdAt: contact.createdAt,
    messageCount: contact._count.messages,
    profiles: await linkedProfiles(waId),
  };
}

export async function updateContact(
  waIdInput: string,
  input: { inboxState?: "OPEN" | "DONE" | undefined; tags?: string[] | undefined; marketingOptIn?: boolean | undefined },
) {
  const waId = normalizeWaId(waIdInput);
  const contact = await repo.findContact(waId);
  if (!contact) throw HttpError.notFound("Contact not found");
  if (input.marketingOptIn && contact.optedOut) {
    // STOP outranks an admin: only the person can undo it, by sending START.
    throw HttpError.conflict("This contact sent STOP — they must send START to opt back in");
  }
  await repo.updateContact(waId, {
    ...(input.inboxState ? { inboxState: input.inboxState } : {}),
    ...(input.tags ? { tags: [...new Set(input.tags)] } : {}),
    ...(input.marketingOptIn === true && !contact.marketingOptInAt
      ? { marketingOptInAt: new Date(), marketingOptInSource: "admin" }
      : {}),
    ...(input.marketingOptIn === false
      ? { marketingOptInAt: null, marketingOptInSource: null }
      : {}),
  });
  return getContact(waId);
}

export async function markRead(waIdInput: string) {
  await repo.markContactRead(normalizeWaId(waIdInput));
}

export async function importContacts(
  input: { rows: { phone: string; name?: string | undefined; tags: string[]; optIn: boolean }[]; tags: string[] },
) {
  const seen = new Set<string>();
  const rows: { waId: string; name: string | null; tags: string[]; optIn: boolean }[] = [];
  const invalid: string[] = [];
  for (const row of input.rows) {
    const waId = toWaId(row.phone);
    if (!waId) {
      invalid.push(row.phone);
      continue;
    }
    if (seen.has(waId)) continue;
    seen.add(waId);
    rows.push({
      waId,
      name: row.name?.trim() || null,
      tags: [...new Set([...row.tags, ...input.tags])],
      optIn: row.optIn,
    });
  }
  const result = rows.length > 0 ? await repo.importContacts(rows, new Date()) : { created: 0, updated: 0 };
  return { ...result, invalid: invalid.slice(0, 50), invalidCount: invalid.length };
}

// ---- Overview ------------------------------------------------------------------

const PHONE_TTL_MS = 5 * 60_000;
let phoneCache: { at: number; info: GraphPhoneNumber } | null = null;

async function phoneHealth(log: FastifyBaseLogger) {
  if (phoneCache && Date.now() - phoneCache.at < PHONE_TTL_MS) {
    return { info: phoneCache.info, error: null };
  }
  try {
    const info = await getPhoneNumberInfo(log);
    phoneCache = { at: Date.now(), info };
    return { info, error: null };
  } catch (error) {
    return { info: null, error: error instanceof Error ? error.message : "Unavailable" };
  }
}

/** Last 30 days at a glance, plus the number's health as Meta reports it. */
export async function getOverview(log: FastifyBaseLogger) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [phone, stats, recentCampaigns] = await Promise.all([
    phoneHealth(log),
    repo.overviewStats(since),
    prisma.waCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        total: true,
        sent: true,
        failed: true,
        createdAt: true,
        scheduledAt: true,
      },
    }),
  ]);
  const by = (status: string) => stats.byStatus[status] ?? 0;
  const delivered = by("delivered") + by("read");
  const outbound = Object.values(stats.byStatus).reduce((sum, n) => sum + n, 0);
  return {
    since,
    phone: phone.info
      ? {
          number: phone.info.display_phone_number ?? null,
          name: phone.info.verified_name ?? null,
          qualityRating: phone.info.quality_rating ?? null,
          messagingLimit: phone.info.messaging_limit_tier ?? null,
          nameStatus: phone.info.name_status ?? null,
          status: phone.info.status ?? null,
        }
      : null,
    phoneError: phone.error,
    messages: {
      sent: outbound,
      delivered,
      read: by("read"),
      failed: by("failed"),
      received: stats.inbound,
      fromAutomations: stats.automationSends,
      clicks: stats.clicks,
    },
    contacts: { total: stats.contacts, optedIn: stats.optedIn, optedOut: stats.optedOut },
    activeCampaigns: stats.activeCampaigns,
    daily: stats.daily,
    recentCampaigns,
  };
}

// ---- Quick replies -------------------------------------------------------------

export const listQuickReplies = () => repo.listQuickReplies();
export const createQuickReply = (input: { title: string; body: string }) =>
  repo.createQuickReply(input);

export async function updateQuickReply(id: string, input: { title: string; body: string }) {
  const found = await prisma.waQuickReply.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw HttpError.notFound("Quick reply not found");
  return repo.updateQuickReply(id, input);
}

export async function deleteQuickReply(id: string) {
  const found = await prisma.waQuickReply.findUnique({ where: { id }, select: { id: true } });
  if (!found) throw HttpError.notFound("Quick reply not found");
  await repo.deleteQuickReply(id);
}

export const listTags = () => repo.tagCounts();

// ---- Templates -----------------------------------------------------------------

// Templates change only when someone edits them in WhatsApp Manager, and the
// console opens the picker often — one Graph call a minute is plenty.
const TEMPLATE_TTL_MS = 60_000;
let templateCache: { at: number; templates: TemplateSummary[] } | null = null;
/** Last failed fetch — availableTemplates backs off for a TTL after one. */
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

/**
 * The WABA's templates for pre-send checks and the stored message text, or
 * null when Meta can't list them. After a failed fetch it backs off for a
 * TTL, so sends never wait on a failing lookup more than once a minute.
 */
export async function availableTemplates(
  log: FastifyBaseLogger,
): Promise<TemplateSummary[] | null> {
  if (Date.now() - templateFailedAt < TEMPLATE_TTL_MS) return null;
  try {
    return await getTemplates(false, log);
  } catch {
    templateFailedAt = Date.now();
    return null;
  }
}

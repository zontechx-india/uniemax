import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import type { ParsedInbound, ParsedStatus } from "./whatsapp.types.js";

/**
 * Every WhatsApp read and write. The service holds the rules (opt-out, 24h
 * window, allowlist); this file only knows the tables.
 */

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/** Delivery progress. A status may only move forward — webhooks arrive out of order. */
const STATUS_RANK: Record<string, number> = {
  accepted: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

// ---- Webhook ---------------------------------------------------------------

export function saveWebhookEvent(payload: unknown) {
  return prisma.waWebhookEvent.create({
    data: { payload: payload as Prisma.InputJsonValue },
  });
}

/**
 * The sender of an inbound message: create on first contact, refresh the
 * name and the 24h window. `optedOut` is only written when the message was
 * STOP/START.
 */
export function upsertInboundContact(
  waId: string,
  name: string | null,
  at: Date,
  optedOut: boolean | undefined,
) {
  const changes = {
    lastInboundAt: at,
    lastMessageAt: at,
    ...(name ? { name } : {}),
    ...(optedOut !== undefined ? { optedOut } : {}),
  };
  return prisma.waContact.upsert({
    where: { waId },
    create: { waId, ...changes },
    update: changes,
  });
}

/** Idempotent on wamid — a retried webhook does not duplicate the message. */
export async function saveInboundMessage(message: ParsedInbound): Promise<boolean> {
  try {
    await prisma.waMessage.create({
      data: {
        wamid: message.wamid,
        waId: message.waId,
        direction: "IN",
        type: message.type,
        body: message.body,
        mediaId: message.mediaId,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/** false when this (wamid, status) pair was already recorded. */
export async function saveStatus(status: ParsedStatus): Promise<boolean> {
  try {
    await prisma.waMessageStatus.create({ data: status });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

/**
 * Advances WaMessage.lastStatus (never backwards — a late "delivered" must
 * not overwrite "read"). Returns the message's campaign, or null when the
 * wamid is not ours (e.g. sent from the WhatsApp Manager UI).
 */
export interface MessageError {
  errorCode: number | null;
  errorTitle: string | null;
  errorDetails: string | null;
}

export async function advanceLastStatus(
  wamid: string,
  status: string,
  error?: MessageError,
): Promise<{ campaignId: string | null } | null> {
  const message = await prisma.waMessage.findUnique({
    where: { wamid },
    select: { id: true, lastStatus: true, campaignId: true },
  });
  if (!message) return null;
  const current = STATUS_RANK[message.lastStatus ?? ""] ?? -1;
  const next = STATUS_RANK[status] ?? -1;
  if (next > current) {
    await prisma.waMessage.update({
      where: { id: message.id },
      // A failure carries its reason onto the message, so the console can say
      // why without a second lookup.
      data: { lastStatus: status, ...(status === "failed" && error ? error : {}) },
    });
  }
  return { campaignId: message.campaignId };
}

// ---- Contacts --------------------------------------------------------------

export function findContact(waId: string) {
  return prisma.waContact.findUnique({ where: { waId } });
}

/**
 * An outbound message needs its contact row (FK) — create it bare if new —
 * and moves the conversation to the top of the inbox.
 */
export function touchOutboundContact(waId: string) {
  const lastMessageAt = new Date();
  return prisma.waContact.upsert({
    where: { waId },
    create: { waId, lastMessageAt },
    update: { lastMessageAt },
  });
}

const lastMessageSelect = {
  direction: true,
  type: true,
  body: true,
  templateName: true,
  lastStatus: true,
  createdAt: true,
} as const;

/**
 * The inbox: contacts with their latest message, most recent conversation
 * first. `q` matches the number or the profile name.
 */
export async function listContacts(query: {
  q?: string | undefined;
  filter?: "window" | "optedOut" | undefined;
  windowSince: Date;
  page: number;
  pageSize: number;
}) {
  const q = query.q?.trim();
  const digits = q?.replace(/\D/g, "");
  const where: Prisma.WaContactWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            ...(digits ? [{ waId: { contains: digits } }] : []),
          ],
        }
      : {}),
    ...(query.filter === "window" ? { lastInboundAt: { gte: query.windowSince } } : {}),
    ...(query.filter === "optedOut" ? { optedOut: true } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.waContact.count({ where }),
    prisma.waContact.findMany({
      where,
      orderBy: [{ lastMessageAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: lastMessageSelect },
      },
    }),
  ]);
  return { total, rows };
}

export async function getContactWithCounts(waId: string) {
  return prisma.waContact.findUnique({
    where: { waId },
    include: { _count: { select: { messages: true } } },
  });
}

/** Most recent verified webhook — the console's "is Meta reaching us?" signal. */
export async function lastWebhookAt(): Promise<Date | null> {
  const event = await prisma.waWebhookEvent.findFirst({
    orderBy: { receivedAt: "desc" },
    select: { receivedAt: true },
  });
  return event?.receivedAt ?? null;
}

// ---- Messages --------------------------------------------------------------

export function saveOutboundMessage(data: {
  wamid: string | null;
  waId: string;
  type: string;
  body: string | null;
  templateName: string | null;
  lastStatus: string;
  campaignId: string | null;
} & Partial<MessageError>) {
  return prisma.waMessage.create({ data: { ...data, direction: "OUT" } });
}

/**
 * The latest send of each of these templates to one number — what the seller
 * reminders show ("sent 2h ago · delivered") and their cooldown reads.
 */
export function latestTemplateSends(waId: string, templateNames: string[]) {
  return prisma.waMessage.findMany({
    where: { waId, direction: "OUT", templateName: { in: templateNames } },
    orderBy: { createdAt: "desc" },
    distinct: ["templateName"],
    select: { templateName: true, lastStatus: true, createdAt: true },
  });
}

export async function listMessages(waId: string, page: number, pageSize: number) {
  const where = { waId };
  const [total, rows] = await Promise.all([
    prisma.waMessage.count({ where }),
    prisma.waMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        wamid: true,
        direction: true,
        type: true,
        body: true,
        mediaId: true,
        templateName: true,
        lastStatus: true,
        errorCode: true,
        errorTitle: true,
        errorDetails: true,
        campaignId: true,
        createdAt: true,
      },
    }),
  ]);
  return { total, rows };
}

// ---- Campaigns -------------------------------------------------------------

export function createCampaign(data: {
  name: string;
  templateName: string;
  languageCode: string;
  total: number;
}) {
  return prisma.waCampaign.create({ data });
}

export function finishCampaign(id: string) {
  return prisma.waCampaign.update({ where: { id }, data: { finishedAt: new Date() } });
}

export async function listCampaigns(page: number, pageSize: number) {
  const [total, rows] = await Promise.all([
    prisma.waCampaign.count(),
    prisma.waCampaign.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, rows };
}

export function incrementCampaign(
  id: string,
  counter: "sent" | "skipped" | "failed",
) {
  return prisma.waCampaign.update({
    where: { id },
    data: { [counter]: { increment: 1 } },
  });
}

export async function getCampaignWithBreakdown(id: string) {
  const [campaign, groups, failures] = await Promise.all([
    prisma.waCampaign.findUnique({ where: { id } }),
    prisma.waMessage.groupBy({
      by: ["lastStatus"],
      where: { campaignId: id },
      _count: { _all: true },
    }),
    // Why the failed ones failed — one row per Meta error, biggest first.
    prisma.waMessage.groupBy({
      by: ["errorCode", "errorTitle"],
      where: { campaignId: id, lastStatus: "failed" },
      _count: { _all: true },
      orderBy: { _count: { errorCode: "desc" } },
    }),
  ]);
  if (!campaign) return null;
  const byStatus = Object.fromEntries(
    groups.map((g) => [g.lastStatus ?? "unknown", g._count._all]),
  );
  return {
    campaign,
    byStatus,
    failures: failures.map((f) => ({
      errorCode: f.errorCode,
      errorTitle: f.errorTitle,
      count: f._count._all,
    })),
  };
}

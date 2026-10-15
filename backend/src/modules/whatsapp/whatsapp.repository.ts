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
 * name and the 24h window, count it unread and reopen the conversation.
 * STOP opts out and clears marketing consent; START opts back in and records
 * consent (they asked for messages).
 */
export function upsertInboundContact(
  waId: string,
  name: string | null,
  at: Date,
  intent: "in" | "out" | null,
) {
  const consent =
    intent === "out"
      ? { optedOut: true, marketingOptInAt: null, marketingOptInSource: null }
      : intent === "in"
        ? { optedOut: false, marketingOptInAt: at, marketingOptInSource: "start" }
        : {};
  const changes = {
    lastInboundAt: at,
    lastMessageAt: at,
    inboxState: "OPEN" as const,
    ...(name ? { name } : {}),
    ...consent,
  };
  return prisma.waContact.upsert({
    where: { waId },
    create: { waId, ...changes, unreadCount: 1 },
    update: { ...changes, unreadCount: { increment: 1 } },
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
export type ContactFilter = "window" | "optedOut" | "optedIn" | "unread" | "open" | "done";

export async function listContacts(query: {
  q?: string | undefined;
  filter?: ContactFilter | undefined;
  tag?: string | undefined;
  windowSince: Date;
  page: number;
  pageSize: number;
}) {
  const q = query.q?.trim();
  const digits = q?.replace(/\D/g, "");
  const byFilter: Record<ContactFilter, Prisma.WaContactWhereInput> = {
    window: { lastInboundAt: { gte: query.windowSince } },
    optedOut: { optedOut: true },
    optedIn: { marketingOptInAt: { not: null }, optedOut: false },
    unread: { unreadCount: { gt: 0 } },
    open: { inboxState: "OPEN" },
    done: { inboxState: "DONE" },
  };
  const where: Prisma.WaContactWhereInput = {
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            ...(digits ? [{ waId: { contains: digits } }] : []),
          ],
        }
      : {}),
    ...(query.filter ? byFilter[query.filter] : {}),
    ...(query.tag ? { tags: { has: query.tag } } : {}),
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
  mediaId?: string | null;
  templateName: string | null;
  lastStatus: string;
  campaignId: string | null;
  automationKey: string | null;
} & Partial<MessageError>) {
  return prisma.waMessage.create({
    data: { ...data, direction: "OUT" },
    select: { id: true },
  });
}

/** Admin edits from the thread: triage state, tags, marketing consent. */
export function updateContact(
  waId: string,
  data: {
    inboxState?: "OPEN" | "DONE";
    tags?: string[];
    marketingOptInAt?: Date | null;
    marketingOptInSource?: string | null;
  },
) {
  return prisma.waContact.update({ where: { waId }, data });
}

export function markContactRead(waId: string) {
  return prisma.waContact.updateMany({
    where: { waId, unreadCount: { gt: 0 } },
    data: { unreadCount: 0 },
  });
}

/** Every tag in use, most used first — the audience and inbox filters offer these. */
export async function tagCounts(): Promise<{ tag: string; count: number }[]> {
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
    SELECT t AS tag, COUNT(*) AS count
    FROM "wa_contacts", unnest("tags") AS t
    GROUP BY t ORDER BY count DESC, t ASC LIMIT 200`;
  return rows.map((r) => ({ tag: r.tag, count: Number(r.count) }));
}

/**
 * Upsert contacts from an import: create new numbers, merge tags into
 * existing ones, and record consent only when the row grants it (an import
 * never REMOVES consent — that takes STOP or an admin).
 */
export async function importContacts(
  rows: { waId: string; name: string | null; tags: string[]; optIn: boolean }[],
  at: Date,
): Promise<{ created: number; updated: number }> {
  const existing = new Map(
    (
      await prisma.waContact.findMany({
        where: { waId: { in: rows.map((r) => r.waId) } },
        select: { waId: true, tags: true, name: true, marketingOptInAt: true },
      })
    ).map((c) => [c.waId, c]),
  );
  let created = 0;
  let updated = 0;
  // Sequential in one transaction: imports are capped (5 000 rows) and
  // each row is a single small write.
  await prisma.$transaction(
    rows.map((row) => {
      const current = existing.get(row.waId);
      const consent =
        row.optIn && !current?.marketingOptInAt
          ? { marketingOptInAt: at, marketingOptInSource: "import" }
          : {};
      if (!current) {
        created += 1;
        return prisma.waContact.create({
          data: { waId: row.waId, name: row.name, tags: row.tags, ...consent },
        });
      }
      updated += 1;
      return prisma.waContact.update({
        where: { waId: row.waId },
        data: {
          tags: [...new Set([...current.tags, ...row.tags])],
          ...(row.name && !current.name ? { name: row.name } : {}),
          ...consent,
        },
      });
    }),
  );
  return { created, updated };
}

// ---- Quick replies -----------------------------------------------------------

export function listQuickReplies() {
  return prisma.waQuickReply.findMany({ orderBy: { title: "asc" } });
}

export function createQuickReply(data: { title: string; body: string }) {
  return prisma.waQuickReply.create({ data });
}

export function updateQuickReply(id: string, data: { title: string; body: string }) {
  return prisma.waQuickReply.update({ where: { id }, data });
}

export function deleteQuickReply(id: string) {
  return prisma.waQuickReply.delete({ where: { id } });
}

// ---- Overview ----------------------------------------------------------------

/** Numbers for the Overview tab over the last `since` → now. */
export async function overviewStats(since: Date) {
  const [byStatus, inbound, contacts, optedOut, optedIn, daily, clicks, automationSends, active] =
    await Promise.all([
      prisma.waMessage.groupBy({
        by: ["lastStatus"],
        where: { direction: "OUT", createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.waMessage.count({ where: { direction: "IN", createdAt: { gte: since } } }),
      prisma.waContact.count(),
      prisma.waContact.count({ where: { optedOut: true } }),
      prisma.waContact.count({ where: { optedOut: false, marketingOptInAt: { not: null } } }),
      // Days in India time, so "today" is the operator's today.
      prisma.$queryRaw<{ day: Date; direction: "IN" | "OUT"; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt" AT TIME ZONE 'Asia/Kolkata') AS day,
               "direction", COUNT(*) AS count
        FROM "wa_messages"
        WHERE "createdAt" >= ${since}
        GROUP BY 1, 2 ORDER BY 1`,
      prisma.waLink.aggregate({ where: { createdAt: { gte: since } }, _sum: { clicks: true } }),
      prisma.waMessage.count({
        where: { direction: "OUT", automationKey: { not: null }, createdAt: { gte: since } },
      }),
      prisma.waCampaign.count({ where: { status: { in: ["SCHEDULED", "SENDING", "PAUSED"] } } }),
    ]);
  return {
    byStatus: Object.fromEntries(byStatus.map((g) => [g.lastStatus ?? "unknown", g._count._all])),
    inbound,
    contacts,
    optedOut,
    optedIn,
    daily: daily.map((d) => ({ day: d.day, direction: d.direction, count: Number(d.count) })),
    clicks: clicks._sum.clicks ?? 0,
    automationSends,
    activeCampaigns: active,
  };
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
// The campaign queue lives in whatsapp.campaigns.ts; the webhook only needs
// to count a late failure.

export function incrementCampaign(
  id: string,
  counter: "sent" | "skipped" | "failed",
) {
  return prisma.waCampaign.update({
    where: { id },
    data: { [counter]: { increment: 1 } },
  });
}

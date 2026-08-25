import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { push, pushConfigured, pushPublicKey } from "../../package/push/index.js";
import type {
  BroadcastInput,
  NotificationListQuery,
  PushSubscribeInput,
} from "./notifications.schema.js";

/**
 * Notifications — the app's own layer above the domain-free `package/push`.
 *
 * Two responsibilities, deliberately separate:
 *   1. **The feed** — every notification is written to the `Notification`
 *      table first. That is the source of truth: it survives a device that is
 *      offline, has push blocked, or never subscribed.
 *   2. **The push** — a best-effort fan-out to that principal's subscribed
 *      devices. A push failure is logged and never propagates, so no business
 *      flow (placing an order, verifying a bank account) can fail because a
 *      browser's push service was down.
 */

export type PrincipalType = "ADMIN" | "CUSTOMER";

export type NotificationKind =
  | "ORDER_PLACED"
  | "ORDER_STATUS"
  | "PAYMENT"
  | "STORE"
  | "ACCOUNT"
  | "ANNOUNCEMENT"
  | "SUPPORT";

export interface NotifyInput {
  principalType: PrincipalType;
  principalId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app path the client opens on click. */
  url?: string | null;
  data?: Record<string, unknown>;
}

/** Transient failures tolerated before a subscription is retired. */
const MAX_PUSH_FAILURES = 5;

// ---------------------------------------------------------------------------
// Subscriptions
// ---------------------------------------------------------------------------

/**
 * Register (or re-register) this browser for push.
 *
 * Keyed on the endpoint, which the browser keeps stable, so re-subscribing is
 * idempotent instead of piling up duplicate rows. An endpoint that comes back
 * under a different principal — a shared computer where someone else signed
 * in — is REASSIGNED, never left pointing at the previous account: that would
 * push one person's order updates to another person's screen.
 */
export async function saveSubscription(
  principalType: PrincipalType,
  principalId: string,
  input: PushSubscribeInput,
  userAgent: string | null,
) {
  const row = await prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    create: {
      principalType,
      principalId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent,
    },
    update: {
      principalType,
      principalId,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent,
      // A returning endpoint is alive again — clear whatever retired it.
      disabledAt: null,
      failureCount: 0,
      lastUsedAt: new Date(),
    },
    select: { id: true, createdAt: true },
  });
  return { id: row.id, subscribed: true, createdAt: row.createdAt };
}

/** Unsubscribe this browser. Scoped to the principal so one account can't
 * silence another's device by guessing an endpoint. */
export async function removeSubscription(
  principalType: PrincipalType,
  principalId: string,
  endpoint: string,
) {
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, principalType, principalId },
  });
  return { subscribed: false };
}

/** The principal's own devices — shown as "where you get notifications". */
export async function listSubscriptions(
  principalType: PrincipalType,
  principalId: string,
) {
  return prisma.pushSubscription.findMany({
    where: { principalType, principalId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      disabledAt: true,
      createdAt: true,
      lastUsedAt: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Feed
// ---------------------------------------------------------------------------

const notificationSelect = {
  id: true,
  kind: true,
  title: true,
  body: true,
  url: true,
  data: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export async function listNotifications(
  principalType: PrincipalType,
  principalId: string,
  query: NotificationListQuery,
) {
  const where: Prisma.NotificationWhereInput = { principalType, principalId };
  if (query.unreadOnly) where.readAt = null;

  const [total, rows, unread] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: notificationSelect,
    }),
    prisma.notification.count({
      where: { principalType, principalId, readAt: null },
    }),
  ]);

  return {
    rows,
    unread,
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/** Badge count for the bell — cheap enough to poll. */
export async function unreadCount(
  principalType: PrincipalType,
  principalId: string,
) {
  const unread = await prisma.notification.count({
    where: { principalType, principalId, readAt: null },
  });
  return { unread, pushEnabled: pushConfigured };
}

export async function markRead(
  principalType: PrincipalType,
  principalId: string,
  id: string,
) {
  const updated = await prisma.notification.updateMany({
    where: { id, principalType, principalId, readAt: null },
    data: { readAt: new Date() },
  });
  // Already-read is not an error; a missing row for THIS principal is.
  if (updated.count === 0) {
    const exists = await prisma.notification.count({
      where: { id, principalType, principalId },
    });
    if (exists === 0) throw HttpError.notFound("Notification not found");
  }
  return { id, read: true };
}

export async function markAllRead(
  principalType: PrincipalType,
  principalId: string,
) {
  const { count } = await prisma.notification.updateMany({
    where: { principalType, principalId, readAt: null },
    data: { readAt: new Date() },
  });
  return { markedRead: count };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Push one payload to every live device of a principal, retiring endpoints
 * the push service says are gone. Never throws.
 */
async function pushToPrincipal(
  principalType: PrincipalType,
  principalId: string,
  payload: { title: string; body: string; url?: string | null; tag?: string },
) {
  const targets = await prisma.pushSubscription.findMany({
    where: { principalType, principalId, disabledAt: null },
    select: { id: true, endpoint: true, p256dh: true, auth: true, failureCount: true },
  });
  if (targets.length === 0) return;

  await Promise.all(
    targets.map(async (target) => {
      const result = await push.send(target, payload);
      if (result.status === "sent") {
        await prisma.pushSubscription.update({
          where: { id: target.id },
          data: { lastUsedAt: new Date(), failureCount: 0 },
        });
        return;
      }
      // Gone for good, or transiently broken too many times in a row.
      const retire =
        result.status === "expired" ||
        target.failureCount + 1 >= MAX_PUSH_FAILURES;
      await prisma.pushSubscription.update({
        where: { id: target.id },
        data: {
          failureCount: { increment: 1 },
          ...(retire ? { disabledAt: new Date() } : {}),
        },
      });
    }),
  );
}

/**
 * Record a notification and push it. Awaitable, but callers inside a business
 * flow should use `notify()` below instead.
 */
export async function notifyNow(input: NotifyInput): Promise<void> {
  await prisma.notification.create({
    data: {
      principalType: input.principalType,
      principalId: input.principalId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      url: input.url ?? null,
      ...(input.data ? { data: input.data as Prisma.InputJsonObject } : {}),
    },
  });

  await pushToPrincipal(input.principalType, input.principalId, {
    title: input.title,
    body: input.body,
    url: input.url ?? null,
    tag: input.kind,
  });
}

/**
 * Fire-and-forget notification — THE entry point for business code.
 *
 * A notification is a side effect of an order, not part of it: a push service
 * outage must never roll back a sale. Failures are logged and swallowed.
 */
export function notify(input: NotifyInput): void {
  void notifyNow(input).catch((err) => {
    console.error(`Notification failed (${input.kind}):`, err);
  });
}

/** Same, fanned out to every active platform admin (new order, new store…). */
export function notifyAdmins(
  input: Omit<NotifyInput, "principalType" | "principalId">,
): void {
  void (async () => {
    const admins = await prisma.admin.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      await notifyNow({ ...input, principalType: "ADMIN", principalId: admin.id });
    }
  })().catch((err) => {
    console.error(`Admin notification failed (${input.kind}):`, err);
  });
}

// ---------------------------------------------------------------------------
// Admin broadcast
// ---------------------------------------------------------------------------

/** Recipient ids for a broadcast audience. */
async function audienceIds(audience: BroadcastInput["audience"]) {
  if (audience === "ADMINS") {
    const rows = await prisma.admin.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    return { principalType: "ADMIN" as const, ids: rows.map((r) => r.id) };
  }
  // SELLERS = customers who own at least one store; CUSTOMERS = everyone.
  const rows = await prisma.customer.findMany({
    where: {
      blockedAt: null,
      ...(audience === "SELLERS" ? { stores: { some: {} } } : {}),
    },
    select: { id: true },
  });
  return { principalType: "CUSTOMER" as const, ids: rows.map((r) => r.id) };
}

/**
 * Send one message to a whole audience. The feed rows are written in a single
 * `createMany` (fast, atomic); the pushes then go out in bounded batches so a
 * large audience can't open thousands of sockets at once.
 */
export async function broadcast(input: BroadcastInput) {
  const { principalType, ids } = await audienceIds(input.audience);
  if (ids.length === 0) return { recipients: 0 };

  await prisma.notification.createMany({
    data: ids.map((principalId) => ({
      principalType,
      principalId,
      kind: "ANNOUNCEMENT" as const,
      title: input.title,
      body: input.body,
      url: input.url ?? null,
    })),
  });

  void (async () => {
    const BATCH = 25;
    for (let i = 0; i < ids.length; i += BATCH) {
      await Promise.all(
        ids.slice(i, i + BATCH).map((principalId) =>
          pushToPrincipal(principalType, principalId, {
            title: input.title,
            body: input.body,
            url: input.url ?? null,
            tag: "ANNOUNCEMENT",
          }),
        ),
      );
    }
  })().catch((err) => console.error("Broadcast push failed:", err));

  return { recipients: ids.length };
}

/** What a client needs before it can subscribe. */
export function pushConfig() {
  return { publicKey: pushPublicKey, enabled: pushConfigured };
}

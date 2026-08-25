import { randomInt } from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";

/**
 * The parts every support flow shares: how a ticket is selected, shaped and
 * numbered, and where each audience finds it in the app.
 *
 * There are **three** flows over one table, separated by two columns:
 *
 * | Flow                          | `recipient` | `storeId` |
 * | ----------------------------- | ----------- | --------- |
 * | Shopper → UnieMax             | PLATFORM    | null      |
 * | Seller → UnieMax (my shop)    | PLATFORM    | the store |
 * | Shopper → the shop they buy from | STORE    | the store |
 *
 * `storeId` alone cannot express the third: a seller writing *about* a store
 * and a shopper writing *to* it name the same store. That is the whole reason
 * `recipient` exists — see `support.service.ts` (platform) and
 * `supportStore.service.ts` (store).
 */

/** Statuses that still need someone to do something. */
export const ACTIVE_STATUSES = ["OPEN", "IN_PROGRESS"] as const;

/** "TKT-<time base36>-<4 random>" — short, unique, quotable over the phone. */
export function newTicketNumber(): string {
  // No I/O/0/1 — this number gets read aloud to support.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i += 1) suffix += alphabet[randomInt(alphabet.length)];
  return `TKT-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

export const ticketSelect = {
  id: true,
  ticketNumber: true,
  recipient: true,
  subject: true,
  category: true,
  status: true,
  priority: true,
  storeId: true,
  storeName: true,
  contactEmail: true,
  contactPhone: true,
  lastMessageAt: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  store: { select: { id: true, name: true, slug: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  _count: { select: { messages: true } },
} satisfies Prisma.SupportTicketSelect;

type TicketRow = Prisma.SupportTicketGetPayload<{ select: typeof ticketSelect }>;

/**
 * One wire shape for every surface. `store` is the live row (null once the
 * store is deleted) while `storeName` is the snapshot, so a thread still says
 * which business it was about after the store is gone.
 */
export function shapeTicket({ _count, store, ...ticket }: TicketRow) {
  return {
    ...ticket,
    storeName: store?.name ?? ticket.storeName,
    storeSlug: store?.slug ?? null,
    messageCount: _count.messages,
  };
}

export const messageSelect = {
  id: true,
  authorType: true,
  authorId: true,
  authorName: true,
  body: true,
  createdAt: true,
} satisfies Prisma.SupportTicketMessageSelect;

/**
 * Who wrote a message, in the terms the UI actually needs.
 *
 * `authorType` cannot answer this on a STORE thread: the seller replies from
 * a Customer account, so both sides of the conversation are `CUSTOMER` and
 * telling them apart means comparing the author to the ticket's reporter.
 * Deriving it **once, here** keeps two clients from each reimplementing that
 * comparison — and getting it subtly different.
 */
export type MessageAuthorRole = "REPORTER" | "STORE" | "PLATFORM";

function authorRole(
  message: { authorType: "ADMIN" | "CUSTOMER"; authorId: string },
  reporterId: string,
): MessageAuthorRole {
  if (message.authorType === "ADMIN") return "PLATFORM";
  return message.authorId === reporterId ? "REPORTER" : "STORE";
}

export async function ticketWithThread(ticketId: string) {
  const [ticket, messages] = await Promise.all([
    prisma.supportTicket.findUnique({ where: { id: ticketId }, select: ticketSelect }),
    prisma.supportTicketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: "asc" },
      select: messageSelect,
    }),
  ]);
  if (!ticket) throw HttpError.notFound("Ticket not found");

  const reporterId = ticket.customer.id;
  return {
    ...shapeTicket(ticket),
    messages: messages.map((message) => ({
      ...message,
      authorRole: authorRole(message, reporterId),
    })),
  };
}

/**
 * In-app path the **reporter's** notification opens — their own view of the
 * ticket, which lives in a different place for each flow:
 *
 *   - shopper → shop:     the shop's own Help & Support (public storefront)
 *   - seller → UnieMax:   that store's management pages
 *   - shopper → UnieMax:  the account menu's Help & Support
 */
export function reporterUrl(ticket: {
  id: string;
  recipient: "PLATFORM" | "STORE";
  store: { slug: string } | null;
}) {
  if (!ticket.store) return `/support/${ticket.id}`;
  return ticket.recipient === "STORE"
    ? `/store/${ticket.store.slug}/support/${ticket.id}`
    : `/stores/${ticket.store.slug}/support/${ticket.id}`;
}

/** The message a reporter gets when they post to a finished thread. */
export const CLOSED_MESSAGE =
  "This ticket is closed — please raise a new one so it gets picked up.";

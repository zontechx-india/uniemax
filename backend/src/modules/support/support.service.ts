import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { notify, notifyAdmins } from "../notifications/notifications.service.js";
import {
  ACTIVE_STATUSES,
  CLOSED_MESSAGE,
  newTicketNumber,
  reporterUrl,
  shapeTicket,
  ticketSelect,
  ticketWithThread,
} from "./support.shared.js";
import type {
  AdminTicketListQuery,
  AdminTicketUpdateInput,
  TicketCreateInput,
  TicketListQuery,
} from "./support.schema.js";

/**
 * Support tickets answered by **UnieMax** (`recipient = PLATFORM`) — from a
 * shopper via the account menu, or from a seller via their store's Help &
 * Support. Threads answered by a *store owner* live in
 * `supportStore.service.ts`; the plumbing both share is in
 * `support.shared.ts`.
 *
 * Two surfaces, one service, because they are the same thread read from
 * opposite ends: splitting them would mean two definitions of "who may post
 * here", which is exactly the rule that must not diverge.
 *
 * Rules that live here rather than in a controller:
 *   - **Ownership** is enforced on every reporter-side read and write; a
 *     ticket belonging to someone else is a 404, never a 403 (a 403 confirms
 *     the ticket exists).
 *   - **CLOSED is terminal.** Nobody posts to a closed ticket — carrying on
 *     means a new ticket, so a thread always has one subject.
 *   - **A reporter's reply on a RESOLVED ticket reopens it.** "Resolved" is
 *     the platform's opinion, and the person who raised it gets to disagree
 *     without filing a duplicate.
 *   - **An admin reply moves OPEN → IN_PROGRESS**, so the queue shows what
 *     has actually been picked up without anyone remembering to set it.
 *
 * The reporter-side reads and writes below (`getTicket`, `addCustomerMessage`,
 * `closeTicket`) serve **both** recipients: a reporter's own thread behaves
 * identically whoever answers it, and only who gets notified differs — which
 * is why they branch on `recipient` instead of existing in two copies.
 */

/** Concurrent unresolved platform tickets one account may hold. */
const MAX_ACTIVE_TICKETS = 10;

// ---------------------------------------------------------------------------
// Reporter surface (requireCustomer)
// ---------------------------------------------------------------------------

/**
 * Resolve the store a ticket is about, by id **or slug** (management URLs
 * carry the slug), and prove the caller owns it. A store someone else owns is
 * a 404 for exactly the same reason a foreign ticket is.
 */
async function resolveOwnedStore(customerId: string, ref: string) {
  const store = await prisma.store.findFirst({
    where: { ownerId: customerId, OR: [{ id: ref }, { slug: ref }] },
    select: { id: true, name: true, slug: true },
  });
  if (!store) throw HttpError.notFound("Store not found");
  return store;
}

export async function createTicket(customerId: string, input: TicketCreateInput) {
  const activeCount = await prisma.supportTicket.count({
    where: {
      customerId,
      recipient: "PLATFORM",
      status: { in: [...ACTIVE_STATUSES] },
    },
  });
  if (activeCount >= MAX_ACTIVE_TICKETS) {
    throw HttpError.conflict(
      `You already have ${MAX_ACTIVE_TICKETS} open tickets — please continue the conversation on one of them.`,
    );
  }

  const store = input.storeId
    ? await resolveOwnedStore(customerId, input.storeId)
    : null;

  // Fall back to the account's own identifiers, so a ticket is always
  // answerable even when the form's contact fields were left blank.
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, email: true, phone: true },
  });

  const ticket = await prisma.supportTicket.create({
    data: {
      ticketNumber: newTicketNumber(),
      recipient: "PLATFORM",
      customerId,
      storeId: store?.id ?? null,
      storeName: store?.name ?? null,
      subject: input.subject,
      category: input.category,
      contactEmail: input.contactEmail ?? customer?.email ?? null,
      contactPhone: input.contactPhone ?? customer?.phone ?? null,
      messages: {
        create: {
          authorType: "CUSTOMER",
          authorId: customerId,
          authorName: customer?.name ?? null,
          body: input.message,
        },
      },
    },
    select: { id: true, ticketNumber: true },
  });

  notifyAdmins({
    kind: "SUPPORT",
    title: `New support ticket · ${ticket.ticketNumber}`,
    // Naming the store (or saying there isn't one) tells the admin which
    // queue this belongs to before they open anything.
    body: `${customer?.name ?? "Someone"} ${store ? `(${store.name})` : "(shopper)"}: ${input.subject}`,
    url: `/support/${ticket.id}`,
    data: { ticketId: ticket.id, category: input.category, storeId: store?.id ?? null },
  });

  return ticketWithThread(ticket.id);
}

export async function listTickets(customerId: string, query: TicketListQuery) {
  // Threads a STORE answers are listed inside that store's own page
  // (`supportStore.service.ts`), never here — this is the UnieMax inbox.
  const where: Prisma.SupportTicketWhereInput = {
    customerId,
    recipient: "PLATFORM",
  };
  if (query.status) where.status = query.status;
  if (query.storeId) {
    const store = await resolveOwnedStore(customerId, query.storeId);
    where.storeId = store.id;
  } else if (query.scope) {
    where.storeId = query.scope === "ACCOUNT" ? null : { not: null };
  }

  const [total, rows] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: { lastMessageAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: ticketSelect,
    }),
  ]);

  return {
    rows: rows.map(shapeTicket),
    meta: buildListMeta(total, query.page, query.pageSize),
  };
}

/**
 * Ownership check shared by every reporter-side write — **for both
 * recipients**, since a reporter's own thread reads and writes the same way
 * whoever is answering it.
 */
async function ownedTicket(customerId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, customerId },
    select: {
      id: true,
      ticketNumber: true,
      recipient: true,
      subject: true,
      status: true,
      store: { select: { id: true, name: true, slug: true, ownerId: true } },
    },
  });
  if (!ticket) throw HttpError.notFound("Ticket not found");
  return ticket;
}

export async function getTicket(customerId: string, ticketId: string) {
  await ownedTicket(customerId, ticketId);
  return ticketWithThread(ticketId);
}

export async function addCustomerMessage(
  customerId: string,
  ticketId: string,
  body: string,
) {
  const ticket = await ownedTicket(customerId, ticketId);
  if (ticket.status === "CLOSED") throw HttpError.conflict(CLOSED_MESSAGE);

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true },
  });

  await prisma.$transaction([
    prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorType: "CUSTOMER",
        authorId: customerId,
        authorName: customer?.name ?? null,
        body,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastMessageAt: new Date(),
        // A reply on a resolved ticket reopens it — the reporter is telling
        // us it was not resolved.
        ...(ticket.status === "RESOLVED"
          ? { status: "OPEN" as const, resolvedAt: null }
          : {}),
      },
    }),
  ]);

  // Whoever owns the thread is who hears about the reply.
  if (ticket.recipient === "STORE" && ticket.store) {
    notify({
      principalType: "CUSTOMER",
      principalId: ticket.store.ownerId,
      kind: "SUPPORT",
      title: `Reply on ${ticket.ticketNumber}`,
      body: `${customer?.name ?? "A customer"}: ${ticket.subject}`,
      url: `/stores/${ticket.store.slug}/customer-support/${ticketId}`,
      data: { ticketId, storeId: ticket.store.id },
    });
  } else {
    notifyAdmins({
      kind: "SUPPORT",
      title: `Reply on ${ticket.ticketNumber}`,
      body: `${customer?.name ?? "A customer"}: ${ticket.subject}`,
      url: `/support/${ticketId}`,
      data: { ticketId },
    });
  }

  return ticketWithThread(ticketId);
}

/** The reporter marking their own issue done. Terminal — see the header. */
export async function closeTicket(customerId: string, ticketId: string) {
  const ticket = await ownedTicket(customerId, ticketId);
  if (ticket.status === "CLOSED") {
    throw HttpError.conflict("This ticket is already closed");
  }

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  return ticketWithThread(ticketId);
}

// ---------------------------------------------------------------------------
// Platform surface (requireAdmin)
// ---------------------------------------------------------------------------

/**
 * The console answers PLATFORM tickets only. A shopper's conversation with a
 * shop is between those two — the platform does not sit in the middle of it,
 * and a queue padded with threads nobody here is expected to answer is a
 * queue that stops being read.
 */
const PLATFORM_ONLY = { recipient: "PLATFORM" } as const;

export async function adminListTickets(query: AdminTicketListQuery) {
  const where: Prisma.SupportTicketWhereInput = { ...PLATFORM_ONLY };
  if (query.status) where.status = query.status;
  else if (query.open) where.status = { in: [...ACTIVE_STATUSES] };
  if (query.category) where.category = query.category;
  if (query.priority) where.priority = query.priority;
  if (query.storeId) where.storeId = query.storeId;
  else if (query.scope) {
    where.storeId = query.scope === "ACCOUNT" ? null : { not: null };
  }
  if (query.q) {
    where.OR = [
      { ticketNumber: { contains: query.q, mode: "insensitive" } },
      { subject: { contains: query.q, mode: "insensitive" } },
      { storeName: { contains: query.q, mode: "insensitive" } },
      { customer: { name: { contains: query.q, mode: "insensitive" } } },
      { customer: { email: { contains: query.q, mode: "insensitive" } } },
    ];
  }

  const [total, rows, openCount] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      // Inside the queue view, oldest activity FIRST: the ticket nobody has
      // touched longest is the one that needs attention, not the newest.
      orderBy: { lastMessageAt: query.open ? "asc" : "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: ticketSelect,
    }),
    prisma.supportTicket.count({
      where: { ...PLATFORM_ONLY, status: { in: [...ACTIVE_STATUSES] } },
    }),
  ]);

  // `openCount` rides along in `meta` so the console's queue tab can show
  // how much is waiting without a second request.
  return {
    rows: rows.map(shapeTicket),
    meta: { ...buildListMeta(total, query.page, query.pageSize), openCount },
  };
}

/** A store thread is a 404 here, not a 403 — the console has no part in it. */
async function platformTicket(ticketId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, ...PLATFORM_ONLY },
    select: {
      id: true,
      ticketNumber: true,
      recipient: true,
      subject: true,
      status: true,
      priority: true,
      customerId: true,
      store: { select: { slug: true } },
    },
  });
  if (!ticket) throw HttpError.notFound("Ticket not found");
  return ticket;
}

export async function adminGetTicket(ticketId: string) {
  await platformTicket(ticketId);
  return ticketWithThread(ticketId);
}

export async function adminAddMessage(
  adminId: string,
  ticketId: string,
  body: string,
) {
  const ticket = await platformTicket(ticketId);
  if (ticket.status === "CLOSED") {
    throw HttpError.conflict("This ticket is closed and can no longer be answered");
  }

  const admin = await prisma.admin.findUnique({
    where: { id: adminId },
    select: { name: true, email: true },
  });

  await prisma.$transaction([
    prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorType: "ADMIN",
        authorId: adminId,
        // The reporter's UI labels every admin message "UnieMax Support";
        // the row still records who actually answered.
        authorName: admin?.name ?? admin?.email ?? null,
        body,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastMessageAt: new Date(),
        // Answering IS picking it up; nobody should have to also flip a menu.
        ...(ticket.status === "OPEN" ? { status: "IN_PROGRESS" as const } : {}),
      },
    }),
  ]);

  notify({
    principalType: "CUSTOMER",
    principalId: ticket.customerId,
    kind: "SUPPORT",
    title: `UnieMax Support replied · ${ticket.ticketNumber}`,
    body: ticket.subject,
    url: reporterUrl(ticket),
    data: { ticketId },
  });

  return ticketWithThread(ticketId);
}

/** Wording for the status change the reporter is told about. */
const STATUS_TEXT: Record<string, string> = {
  OPEN: "was reopened",
  IN_PROGRESS: "is being looked into",
  RESOLVED: "was marked resolved",
  CLOSED: "was closed",
};

/**
 * Triage: status and/or priority. The reporter is notified about **status**
 * only — priority is internal bookkeeping, and telling them about it would be
 * a notification on a ticket where nothing actually happened.
 */
export async function adminUpdateTicket(
  ticketId: string,
  input: AdminTicketUpdateInput,
) {
  const ticket = await platformTicket(ticketId);

  const status = input.status;
  const statusChanged = Boolean(status && status !== ticket.status);

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      ...(status ? { status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      // Stamps follow the status they describe, in both directions: a
      // reopened ticket must not keep claiming it was resolved.
      ...(statusChanged
        ? {
            resolvedAt: status === "RESOLVED" ? new Date() : null,
            closedAt: status === "CLOSED" ? new Date() : null,
          }
        : {}),
    },
  });

  if (statusChanged && status) {
    notify({
      principalType: "CUSTOMER",
      principalId: ticket.customerId,
      kind: "SUPPORT",
      title: `Ticket ${ticket.ticketNumber} ${STATUS_TEXT[status]}`,
      body: ticket.subject,
      url: reporterUrl(ticket),
      data: { ticketId, status },
    });
  }

  return { previous: ticket, ticket: await ticketWithThread(ticketId) };
}

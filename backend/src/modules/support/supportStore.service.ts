import { prisma } from "../../config/prisma.js";
import { Prisma } from "../../generated/prisma/client.js";
import { HttpError } from "../../utils/httpError.js";
import { buildListMeta } from "../../utils/response.js";
import { notify } from "../notifications/notifications.service.js";
import { PUBLIC_STORE_VISIBILITY } from "../stores/publicStore.service.js";
import {
  ACTIVE_STATUSES,
  CLOSED_MESSAGE,
  newTicketNumber,
  shapeTicket,
  ticketSelect,
  ticketWithThread,
} from "./support.shared.js";
import type {
  SellerTicketListQuery,
  SellerTicketUpdateInput,
  StoreTicketCreateInput,
  TicketListQuery,
} from "./support.schema.js";

/**
 * Support threads a **store owner** answers (`recipient = STORE`) — a shopper
 * writing to the shop they bought from, about their order, a return, or a
 * product.
 *
 * **UnieMax is not a party to these.** They never enter the admin queue
 * (`support.service.ts` filters it to PLATFORM), because a conversation
 * between a buyer and a seller is theirs — and a console queue padded with
 * threads nobody there is expected to answer is a queue that stops being
 * read. A shopper who needs the *platform* instead has "Report a store or
 * seller" in their account Help & Support.
 *
 * The reporter's own reads and writes (open a thread, reply, close) are the
 * shared ones in `support.service.ts`: a thread behaves the same for the
 * person who raised it whoever is answering. What lives here is the pair of
 * things that genuinely differ — raising one against a *public* store, and
 * the seller's side of the conversation.
 */

/** Concurrent unresolved threads one shopper may hold with one store. */
const MAX_ACTIVE_PER_STORE = 5;

// ---------------------------------------------------------------------------
// Shopper surface (requireCustomer)
// ---------------------------------------------------------------------------

/**
 * The store a shopper is writing to, resolved by slug or id.
 *
 * Deliberately the **public** visibility rule (`PUBLIC_STORE_VISIBILITY`) —
 * the same one the storefront and marketplace use: you can only message a
 * shop you could have bought from. An unpublished or suspended store is a
 * 404, exactly as its storefront would be.
 */
async function resolvePublicStore(ref: string) {
  const store = await prisma.store.findFirst({
    where: { ...PUBLIC_STORE_VISIBILITY, OR: [{ id: ref }, { slug: ref }] },
    select: { id: true, name: true, slug: true, ownerId: true },
  });
  if (!store) throw HttpError.notFound("Store not found");
  return store;
}

export async function createStoreTicket(
  customerId: string,
  storeRef: string,
  input: StoreTicketCreateInput,
) {
  const store = await resolvePublicStore(storeRef);

  // An owner opening their own storefront would otherwise message themselves
  // and land it in their own inbox — nonsense that reads as a bug.
  if (store.ownerId === customerId) {
    throw HttpError.badRequest(
      "This is your own store — answer your customers from its Customer Support section.",
    );
  }

  const activeCount = await prisma.supportTicket.count({
    where: {
      customerId,
      storeId: store.id,
      recipient: "STORE",
      status: { in: [...ACTIVE_STATUSES] },
    },
  });
  if (activeCount >= MAX_ACTIVE_PER_STORE) {
    throw HttpError.conflict(
      `You already have ${MAX_ACTIVE_PER_STORE} open requests with this store — please continue one of them.`,
    );
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, email: true, phone: true },
  });

  const ticket = await prisma.supportTicket.create({
    data: {
      ticketNumber: newTicketNumber(),
      recipient: "STORE",
      customerId,
      storeId: store.id,
      storeName: store.name,
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

  notify({
    principalType: "CUSTOMER",
    principalId: store.ownerId,
    kind: "SUPPORT",
    title: `New customer request · ${ticket.ticketNumber}`,
    body: `${customer?.name ?? "A customer"}: ${input.subject}`,
    url: `/stores/${store.slug}/customer-support/${ticket.id}`,
    data: { ticketId: ticket.id, storeId: store.id },
  });

  return ticketWithThread(ticket.id);
}

/** The shopper's own threads with one store. */
export async function listStoreTickets(
  customerId: string,
  storeRef: string,
  query: TicketListQuery,
) {
  const store = await resolvePublicStore(storeRef);

  const where: Prisma.SupportTicketWhereInput = {
    customerId,
    storeId: store.id,
    recipient: "STORE",
  };
  if (query.status) where.status = query.status;

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

// ---------------------------------------------------------------------------
// Seller surface (requireCustomer + store ownership)
// ---------------------------------------------------------------------------

/** The seller's own store, by id or slug. A store they don't own is a 404. */
async function resolveOwnedStore(ownerId: string, ref: string) {
  const store = await prisma.store.findFirst({
    where: { ownerId, OR: [{ id: ref }, { slug: ref }] },
    select: { id: true, name: true, slug: true },
  });
  if (!store) throw HttpError.notFound("Store not found");
  return store;
}

export async function sellerListTickets(
  ownerId: string,
  storeRef: string,
  query: SellerTicketListQuery,
) {
  const store = await resolveOwnedStore(ownerId, storeRef);

  const where: Prisma.SupportTicketWhereInput = {
    storeId: store.id,
    recipient: "STORE",
  };
  if (query.status) where.status = query.status;
  else if (query.open) where.status = { in: [...ACTIVE_STATUSES] };
  if (query.q) {
    where.OR = [
      { ticketNumber: { contains: query.q, mode: "insensitive" } },
      { subject: { contains: query.q, mode: "insensitive" } },
      { customer: { name: { contains: query.q, mode: "insensitive" } } },
      { customer: { email: { contains: query.q, mode: "insensitive" } } },
    ];
  }

  const [total, rows, openCount] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      // Same reasoning as the admin queue: while looking at what still needs
      // an answer, the longest-untouched thread comes first.
      orderBy: { lastMessageAt: query.open ? "asc" : "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: ticketSelect,
    }),
    // The store's whole backlog, independent of the current filter — the
    // section's "waiting" count.
    prisma.supportTicket.count({
      where: {
        storeId: store.id,
        recipient: "STORE",
        status: { in: [...ACTIVE_STATUSES] },
      },
    }),
  ]);

  return {
    rows: rows.map(shapeTicket),
    meta: { ...buildListMeta(total, query.page, query.pageSize), openCount },
  };
}

/**
 * One of this store's threads. Scoped to the store on the way in, so a seller
 * cannot read another shop's conversation by guessing an id — and a *platform*
 * ticket about this store is a 404 here too: that one is with UnieMax.
 */
async function storeTicket(ownerId: string, storeRef: string, ticketId: string) {
  const store = await resolveOwnedStore(ownerId, storeRef);
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, storeId: store.id, recipient: "STORE" },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      status: true,
      customerId: true,
      store: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!ticket) throw HttpError.notFound("Ticket not found");
  return ticket;
}

export async function sellerGetTicket(
  ownerId: string,
  storeRef: string,
  ticketId: string,
) {
  await storeTicket(ownerId, storeRef, ticketId);
  return ticketWithThread(ticketId);
}

export async function sellerAddMessage(
  ownerId: string,
  storeRef: string,
  ticketId: string,
  body: string,
) {
  const ticket = await storeTicket(ownerId, storeRef, ticketId);
  if (ticket.status === "CLOSED") throw HttpError.conflict(CLOSED_MESSAGE);

  await prisma.$transaction([
    prisma.supportTicketMessage.create({
      data: {
        ticketId,
        // The seller is a Customer account, so the message is authored as
        // one — the *store* is who the shopper sees, which the client renders
        // from the ticket, not from this row.
        authorType: "CUSTOMER",
        authorId: ownerId,
        authorName: ticket.store?.name ?? null,
        body,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastMessageAt: new Date(),
        // Answering IS picking it up.
        ...(ticket.status === "OPEN" ? { status: "IN_PROGRESS" as const } : {}),
      },
    }),
  ]);

  notify({
    principalType: "CUSTOMER",
    principalId: ticket.customerId,
    kind: "SUPPORT",
    title: `${ticket.store?.name ?? "The store"} replied · ${ticket.ticketNumber}`,
    body: ticket.subject,
    url: ticket.store ? `/store/${ticket.store.slug}/support/${ticketId}` : null,
    data: { ticketId },
  });

  return ticketWithThread(ticketId);
}

/** Wording for the status change the shopper is told about. */
const STATUS_TEXT: Record<string, string> = {
  OPEN: "was reopened",
  IN_PROGRESS: "is being looked into",
  RESOLVED: "was marked resolved",
  CLOSED: "was closed",
};

/**
 * The seller moving a thread along. **Status only** — `priority` is the
 * platform's triage vocabulary, and a shop's inbox is small enough to read
 * without one.
 */
export async function sellerUpdateTicket(
  ownerId: string,
  storeRef: string,
  ticketId: string,
  input: SellerTicketUpdateInput,
) {
  const ticket = await storeTicket(ownerId, storeRef, ticketId);
  const status = input.status;
  const statusChanged = status !== ticket.status;

  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status,
      // Stamps follow the status they describe, in both directions: a
      // reopened thread must not keep claiming it was resolved.
      resolvedAt: status === "RESOLVED" ? new Date() : null,
      closedAt: status === "CLOSED" ? new Date() : null,
    },
  });

  if (statusChanged) {
    notify({
      principalType: "CUSTOMER",
      principalId: ticket.customerId,
      kind: "SUPPORT",
      title: `Your request ${ticket.ticketNumber} ${STATUS_TEXT[status]}`,
      body: ticket.subject,
      url: ticket.store ? `/store/${ticket.store.slug}/support/${ticketId}` : null,
      data: { ticketId, status },
    });
  }

  return ticketWithThread(ticketId);
}

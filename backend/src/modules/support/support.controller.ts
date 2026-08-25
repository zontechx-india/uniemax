import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { HttpError } from "../../utils/httpError.js";
import { list, ok } from "../../utils/response.js";
import { recordAudit } from "../admin/adminAudit.js";
import * as schema from "./support.schema.js";
import * as service from "./support.service.js";
import * as storeService from "./supportStore.service.js";

/**
 * Thin controllers for both support surfaces: parse with Zod, call the
 * service, wrap in the standard envelope — plus one audit line per admin
 * write, exactly like the rest of the console.
 */

/**
 * The signed-in customer. `requireCustomer` has already run.
 *
 * Named for the common case; the seller handlers use it too, since a store
 * owner is a customer account — ownership of the store is what the service
 * checks, not a different principal type.
 */
function reporter(request: FastifyRequest) {
  if (!request.customer) throw HttpError.unauthorized();
  return request.customer.id;
}

// ---- Contact details (public) ---------------------------------------------

/**
 * How to reach UnieMax support without opening a ticket — the email/phone the
 * storefront prints on its Support page.
 *
 * Served from config rather than hardcoded in the client so the number can
 * change with a deploy of one service, not two. The client keeps its own
 * fallback copy for the case where this call fails: a support page that shows
 * no way to contact support is the one failure mode that must not happen.
 */
export async function getSupportContact() {
  return ok({
    email: env.SUPPORT_EMAIL,
    phone: env.SUPPORT_PHONE,
    hours: env.SUPPORT_HOURS,
  });
}

// ---- Reporter surface (requireCustomer) -----------------------------------

export async function createTicket(request: FastifyRequest, reply: FastifyReply) {
  const input = schema.ticketCreateSchema.parse(request.body);
  const ticket = await service.createTicket(reporter(request), input);
  return reply.status(201).send(ok(ticket));
}

export async function listTickets(request: FastifyRequest) {
  const query = schema.ticketListQuery.parse(request.query);
  const { rows, meta } = await service.listTickets(reporter(request), query);
  return list(rows, meta);
}

export async function getTicket(request: FastifyRequest) {
  const { ticketId } = schema.ticketParamSchema.parse(request.params);
  return ok(await service.getTicket(reporter(request), ticketId));
}

export async function addMessage(request: FastifyRequest, reply: FastifyReply) {
  const { ticketId } = schema.ticketParamSchema.parse(request.params);
  const { message } = schema.ticketMessageSchema.parse(request.body);
  const ticket = await service.addCustomerMessage(reporter(request), ticketId, message);
  return reply.status(201).send(ok(ticket));
}

export async function closeTicket(request: FastifyRequest) {
  const { ticketId } = schema.ticketParamSchema.parse(request.params);
  return ok(await service.closeTicket(reporter(request), ticketId));
}

// ---- Shopper ↔ store threads (requireCustomer) ----------------------------

export async function createStoreTicket(request: FastifyRequest, reply: FastifyReply) {
  const { storeRef } = schema.storeRefParamSchema.parse(request.params);
  const input = schema.storeTicketCreateSchema.parse(request.body);
  const ticket = await storeService.createStoreTicket(reporter(request), storeRef, input);
  return reply.status(201).send(ok(ticket));
}

export async function listStoreTickets(request: FastifyRequest) {
  const { storeRef } = schema.storeRefParamSchema.parse(request.params);
  const query = schema.ticketListQuery.parse(request.query);
  const { rows, meta } = await storeService.listStoreTickets(
    reporter(request),
    storeRef,
    query,
  );
  return list(rows, meta);
}

// ---- Seller side of a store thread (requireCustomer + ownership) ----------

export async function sellerListTickets(request: FastifyRequest) {
  const { id } = schema.sellerStoreParamSchema.parse(request.params);
  const query = schema.sellerTicketListQuery.parse(request.query);
  const { rows, meta } = await storeService.sellerListTickets(
    reporter(request),
    id,
    query,
  );
  return list(rows, meta);
}

export async function sellerGetTicket(request: FastifyRequest) {
  const { id, ticketId } = schema.sellerTicketParamSchema.parse(request.params);
  return ok(await storeService.sellerGetTicket(reporter(request), id, ticketId));
}

export async function sellerAddMessage(request: FastifyRequest, reply: FastifyReply) {
  const { id, ticketId } = schema.sellerTicketParamSchema.parse(request.params);
  const { message } = schema.ticketMessageSchema.parse(request.body);
  const ticket = await storeService.sellerAddMessage(
    reporter(request),
    id,
    ticketId,
    message,
  );
  return reply.status(201).send(ok(ticket));
}

export async function sellerUpdateTicket(request: FastifyRequest) {
  const { id, ticketId } = schema.sellerTicketParamSchema.parse(request.params);
  const input = schema.sellerTicketUpdateSchema.parse(request.body);
  return ok(
    await storeService.sellerUpdateTicket(reporter(request), id, ticketId, input),
  );
}

// ---- Platform surface (requireAdmin) --------------------------------------

export async function adminListTickets(request: FastifyRequest) {
  const query = schema.adminTicketListQuery.parse(request.query);
  const { rows, meta } = await service.adminListTickets(query);
  return list(rows, meta);
}

export async function adminGetTicket(request: FastifyRequest) {
  const { ticketId } = schema.ticketParamSchema.parse(request.params);
  return ok(await service.adminGetTicket(ticketId));
}

export async function adminAddMessage(request: FastifyRequest, reply: FastifyReply) {
  if (!request.admin) throw HttpError.unauthorized();
  const { ticketId } = schema.ticketParamSchema.parse(request.params);
  const { message } = schema.ticketMessageSchema.parse(request.body);
  const ticket = await service.adminAddMessage(request.admin.id, ticketId, message);
  recordAudit(request, {
    action: "support.reply",
    entityType: "supportTicket",
    entityId: ticketId,
    meta: { ticketNumber: ticket.ticketNumber },
  });
  return reply.status(201).send(ok(ticket));
}

export async function adminUpdateTicket(request: FastifyRequest) {
  const { ticketId } = schema.ticketParamSchema.parse(request.params);
  const input = schema.adminTicketUpdateSchema.parse(request.body);
  const { previous, ticket } = await service.adminUpdateTicket(ticketId, input);
  recordAudit(request, {
    action: input.status ? "support.status" : "support.priority",
    entityType: "supportTicket",
    entityId: ticketId,
    meta: {
      ticketNumber: ticket.ticketNumber,
      from: { status: previous.status, priority: previous.priority },
      to: { status: ticket.status, priority: ticket.priority },
    },
  });
  return ok(ticket);
}

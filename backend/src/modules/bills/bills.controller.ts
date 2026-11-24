import type { FastifyReply, FastifyRequest } from "fastify";
import { optionalCustomerId } from "../../package/auth/index.js";
import { idParamSchema } from "../../utils/zodHelpers.js";
import { list, ok } from "../../utils/response.js";
import { storeActor } from "../stores/storeActor.js";
import * as service from "./bills.service.js";
import {
  adminBillListQuerySchema,
  billCatalogQuerySchema,
  billCreateSchema,
  billListQuerySchema,
  billParamSchema,
  billPaySchema,
  billShareSchema,
  tokenParamSchema,
} from "./bills.schema.js";

// ---- seller (behind requireCustomer; a foreign store 404s in the service) ----

export async function listBills(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const query = billListQuerySchema.parse(request.query);
  const { rows, meta, summary } = await service.listBills(storeActor(request), id, query);
  return { ...list(rows, meta), summary };
}

export async function getBill(request: FastifyRequest) {
  const { id, billId } = billParamSchema.parse(request.params);
  return ok(await service.getBill(storeActor(request), id, billId));
}

export async function createBill(request: FastifyRequest, reply: FastifyReply) {
  const { id } = idParamSchema.parse(request.params);
  const input = billCreateSchema.parse(request.body);
  return reply.status(201).send(ok(await service.createBill(storeActor(request), id, input)));
}

export async function shareBill(request: FastifyRequest) {
  const { id, billId } = billParamSchema.parse(request.params);
  const { via } = billShareSchema.parse(request.body);
  return ok(await service.shareBill(storeActor(request), id, billId, via));
}

export async function cancelBill(request: FastifyRequest) {
  const { id, billId } = billParamSchema.parse(request.params);
  return ok(await service.cancelBill(storeActor(request), id, billId));
}

export async function billCatalog(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const query = billCatalogQuerySchema.parse(request.query);
  const { rows, meta } = await service.billCatalog(storeActor(request), id, query);
  return list(rows, meta);
}

export async function billCatalogCategories(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.billCatalogCategories(storeActor(request), id));
}

export async function oftenBilled(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.oftenBilled(storeActor(request), id));
}

// ---- public: the customer's bill page ----

export async function getPublicBill(request: FastifyRequest) {
  const { token } = tokenParamSchema.parse(request.params);
  return ok(await service.getPublicBill(token, optionalCustomerId(request) ?? null));
}

/** Behind requireCustomer — the payer signs in (OTP) first. */
export async function payBill(request: FastifyRequest) {
  const { token } = tokenParamSchema.parse(request.params);
  const input = billPaySchema.parse(request.body);
  return ok(await service.payBill(token, request.customer!.id, input));
}

// ---- admin (read-only) ----

export async function adminListBills(request: FastifyRequest) {
  const query = adminBillListQuerySchema.parse(request.query);
  const { rows, meta, summary } = await service.adminListBills(query);
  return { ...list(rows, meta), summary };
}

export async function adminGetBill(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.adminGetBill(id));
}

// ---- PDF (the bill, or its receipt once paid) ----

/** Sends PDF bytes as a download, never cached or indexed. */
function sendPdf(reply: FastifyReply, file: { fileName: string; bytes: Buffer }) {
  return reply
    .header("Content-Type", "application/pdf")
    .header("Content-Disposition", `attachment; filename="${file.fileName}"`)
    .header("Cache-Control", "private, no-store")
    .header("X-Robots-Tag", "noindex, nofollow")
    .send(file.bytes);
}

export async function sellerBillPdf(request: FastifyRequest, reply: FastifyReply) {
  const { id, billId } = billParamSchema.parse(request.params);
  return sendPdf(reply, await service.sellerBillPdf(storeActor(request), id, billId));
}

export async function publicBillPdf(request: FastifyRequest, reply: FastifyReply) {
  const { token } = tokenParamSchema.parse(request.params);
  return sendPdf(reply, await service.publicBillPdf(token));
}

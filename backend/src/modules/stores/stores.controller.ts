import type { FastifyRequest, FastifyReply } from "fastify";
import { ok } from "../../utils/response.js";
import { readUpload } from "../../package/storage/index.js";
import { idParamSchema, slugParamSchema } from "../../utils/zodHelpers.js";
import {
  storeCreateSchema,
  storeUpdateSchema,
  storeThemeUpdateSchema,
  storeHomepageSchema,
  storeFooterUpdateSchema,
  storePaymentsUpdateSchema,
  storeShippingSchema,
  storeCheckoutUpdateSchema,
  storePublishSchema,
} from "./stores.schema.js";
import * as service from "./stores.service.js";

/**
 * All handlers run behind `requireCustomer` (attached in stores.routes.ts),
 * so `request.customer` is always set. Store lists are small (a customer
 * owns a handful), hence no pagination.
 */

export async function listStores(request: FastifyRequest) {
  return ok(await service.listMyStores(request.customer!.id));
}

/**
 * Create a store — MULTIPART: the text field `name` plus the logo file,
 * both required. A store is never created without a logo, so the two arrive
 * in one request instead of a create-then-upload pair that could half-fail.
 */
export async function createStore(request: FastifyRequest, reply: FastifyReply) {
  const file = await readUpload(request, "logo");
  const input = storeCreateSchema.parse({ name: file.fields.name });
  const store = await service.createStore(request.customer!.id, input, file);
  return reply.status(201).send(ok(store));
}

export async function getStore(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.getMyStore(request.customer!.id, id));
}

export async function updateStore(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const input = storeUpdateSchema.parse(request.body);
  return ok(await service.updateStore(request.customer!.id, id, input));
}

export async function updateStoreTheme(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const patch = storeThemeUpdateSchema.parse(request.body);
  return ok(await service.updateStoreTheme(request.customer!.id, id, patch));
}

export async function updateStoreHomepage(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const { sections } = storeHomepageSchema.parse(request.body);
  return ok(
    await service.updateStoreHomepage(request.customer!.id, id, sections),
  );
}

export async function updateStoreFooter(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const patch = storeFooterUpdateSchema.parse(request.body);
  return ok(await service.updateStoreFooter(request.customer!.id, id, patch));
}

export async function updateStorePayments(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const patch = storePaymentsUpdateSchema.parse(request.body);
  return ok(await service.updateStorePayments(request.customer!.id, id, patch));
}

export async function updateStoreCheckout(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const patch = storeCheckoutUpdateSchema.parse(request.body);
  return ok(await service.updateStoreCheckout(request.customer!.id, id, patch));
}

export async function updateStoreShipping(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const input = storeShippingSchema.parse(request.body);
  return ok(await service.updateStoreShipping(request.customer!.id, id, input));
}

export async function setStorePublished(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const { isPublished } = storePublishSchema.parse(request.body);
  return ok(
    await service.setStorePublished(request.customer!.id, id, isPublished),
  );
}

/**
 * Replace the store logo (multipart file, validated as "logo"). There is no
 * delete counterpart — every store must have a logo, so it can only be
 * swapped for another one.
 */
export async function updateStoreLogo(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const file = await readUpload(request, "logo");
  return ok(await service.updateStoreLogo(request.customer!.id, id, file));
}

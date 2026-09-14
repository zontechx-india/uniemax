import type { FastifyRequest, FastifyReply } from "fastify";
import { storeActor } from "./storeActor.js";
import { ok } from "../../utils/response.js";
import { readUpload } from "../../package/storage/index.js";
import { idParamSchema } from "../../utils/zodHelpers.js";
import {
  storeBannerCreateSchema,
  storeBannerOrderSchema,
  storeBannerParamSchema,
  storeBannerUpdateSchema,
} from "./storeBanner.schema.js";
import * as service from "./storeBanner.service.js";

/**
 * Runs behind `requireCustomer` (attached in stores.routes.ts). `:id` is the
 * store's id or slug; ownership is enforced in the service.
 *
 * Every mutation answers with the store's FULL banner list, so the admin
 * screen re-renders from one authoritative array instead of merging a
 * single row into local state.
 */

export async function listBanners(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  return ok(await service.listBanners(storeActor(request), id));
}

/**
 * Multipart: the image plus its metadata as text fields. `isActive` arrives as
 * the string "true"/"false" — multipart has no booleans — so the fields are
 * coerced here, before Zod sees them.
 */
export async function createBanner(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const { id } = idParamSchema.parse(request.params);
  const file = await readUpload(request, "image");
  const input = storeBannerCreateSchema.parse({
    title: file.fields.title ?? undefined,
    linkType: file.fields.linkType ?? undefined,
    linkValue: file.fields.linkValue ?? undefined,
    isActive:
      file.fields.isActive === undefined
        ? undefined
        : file.fields.isActive === "true",
  });
  const banners = await service.createBanner(
    storeActor(request),
    id,
    file,
    input,
  );
  return reply.code(201).send(ok(banners));
}

export async function updateBanner(request: FastifyRequest) {
  const { id, bannerId } = storeBannerParamSchema.parse(request.params);
  const input = storeBannerUpdateSchema.parse(request.body);
  return ok(
    await service.updateBanner(storeActor(request), id, bannerId, input),
  );
}

export async function replaceBannerImage(request: FastifyRequest) {
  const { id, bannerId } = storeBannerParamSchema.parse(request.params);
  const file = await readUpload(request, "image");
  return ok(
    await service.replaceBannerImage(storeActor(request), id, bannerId, file),
  );
}

export async function deleteBanner(request: FastifyRequest) {
  const { id, bannerId } = storeBannerParamSchema.parse(request.params);
  return ok(await service.deleteBanner(storeActor(request), id, bannerId));
}

export async function reorderBanners(request: FastifyRequest) {
  const { id } = idParamSchema.parse(request.params);
  const input = storeBannerOrderSchema.parse(request.body);
  return ok(await service.reorderBanners(storeActor(request), id, input));
}

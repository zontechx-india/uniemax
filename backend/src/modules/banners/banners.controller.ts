import type { FastifyRequest, FastifyReply } from "fastify";
import { ok } from "../../utils/response.js";
import { readUpload } from "../../package/storage/index.js";
import {
  bannerCreateSchema,
  bannerOrderSchema,
  bannerParamSchema,
  bannerUpdateSchema,
} from "./banners.schema.js";
import * as service from "./banners.service.js";

/**
 * Admin handlers run inside the `requireAdmin` subtree; `listPublicBanners`
 * is the one anonymous read, mounted under /public.
 *
 * Every mutation answers with the FULL list, so the console re-renders from
 * one authoritative array instead of merging a row into local state.
 */

export async function listBanners() {
  return ok(await service.listBanners());
}

/**
 * Multipart: the image plus its metadata as text fields. `isActive` arrives as
 * the string "true"/"false" — multipart has no booleans — so it is coerced
 * here, before Zod sees it.
 */
export async function createBanner(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const file = await readUpload(request, "image");
  const input = bannerCreateSchema.parse({
    title: file.fields.title ?? undefined,
    linkType: file.fields.linkType ?? undefined,
    linkValue: file.fields.linkValue ?? undefined,
    isActive:
      file.fields.isActive === undefined
        ? undefined
        : file.fields.isActive === "true",
  });
  return reply.code(201).send(ok(await service.createBanner(file, input)));
}

export async function updateBanner(request: FastifyRequest) {
  const { id } = bannerParamSchema.parse(request.params);
  const input = bannerUpdateSchema.parse(request.body);
  return ok(await service.updateBanner(id, input));
}

export async function replaceBannerImage(request: FastifyRequest) {
  const { id } = bannerParamSchema.parse(request.params);
  const file = await readUpload(request, "image");
  return ok(await service.replaceBannerImage(id, file));
}

export async function deleteBanner(request: FastifyRequest) {
  const { id } = bannerParamSchema.parse(request.params);
  return ok(await service.deleteBanner(id));
}

export async function reorderBanners(request: FastifyRequest) {
  const input = bannerOrderSchema.parse(request.body);
  return ok(await service.reorderBanners(input));
}

/** Anonymous — the marketplace homepage carousel. */
export async function listPublicBanners() {
  return ok(await service.listPublicBanners());
}

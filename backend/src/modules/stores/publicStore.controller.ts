import type { FastifyRequest } from "fastify";
import { optionalCustomerId } from "../../package/auth/index.js";
import { buildListMeta, list, ok } from "../../utils/response.js";
import { slugParamSchema } from "../../utils/zodHelpers.js";
import {
  publicCategoryParamSchema,
  publicDeliveryCheckQuerySchema,
  publicProductParamSchema,
  publicProductQuerySchema,
  publicStoreListQuerySchema,
} from "./publicStore.schema.js";
import * as service from "./publicStore.service.js";

/** Marketplace store index — published stores, newest publish first. */
export async function listStores(request: FastifyRequest) {
  const query = publicStoreListQuerySchema.parse(request.query);
  const { total, stores } = await service.listPublicStores(query);
  return list(stores, buildListMeta(total, query.page, query.pageSize));
}

/**
 * Anonymous storefront endpoints — no auth required, published stores only.
 * Mounted at /api/v1/public/stores (see stores.routes.ts).
 *
 * A signed-in customer is still resolved **best-effort** (never a 401) and
 * passed to the service as the viewer: that is what lets a store's owner
 * preview their unpublished storefront while everyone else keeps getting 404.
 */

export async function getStore(request: FastifyRequest) {
  const { slug } = slugParamSchema.parse(request.params);
  return ok(await service.getPublicStoreShell(slug, optionalCustomerId(request)));
}

export async function getHome(request: FastifyRequest) {
  const { slug } = slugParamSchema.parse(request.params);
  return ok(await service.getPublicStoreHome(slug, optionalCustomerId(request)));
}

export async function listProducts(request: FastifyRequest) {
  const { slug } = slugParamSchema.parse(request.params);
  const query = publicProductQuerySchema.parse(request.query);
  const { total, products } = await service.listPublicProducts(
    slug,
    query,
    optionalCustomerId(request),
  );
  return list(products, buildListMeta(total, query.page, query.pageSize));
}

export async function getCategory(request: FastifyRequest) {
  const { slug, categorySlug } = publicCategoryParamSchema.parse(request.params);
  return ok(
    await service.getPublicCategory(
      slug,
      categorySlug,
      optionalCustomerId(request),
    ),
  );
}

export async function getProduct(request: FastifyRequest) {
  const { slug, productSlug } = publicProductParamSchema.parse(request.params);
  return ok(
    await service.getPublicProduct(
      slug,
      productSlug,
      optionalCustomerId(request),
    ),
  );
}

/** Delivery-area check — the requested products against one pincode. */
export async function checkDelivery(request: FastifyRequest) {
  const { slug } = slugParamSchema.parse(request.params);
  const query = publicDeliveryCheckQuerySchema.parse(request.query);
  return ok(
    await service.checkPublicDelivery(slug, query, optionalCustomerId(request)),
  );
}

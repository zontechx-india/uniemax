import type { FastifyRequest } from "fastify";
import { buildListMeta, list, ok } from "../../utils/response.js";
import { HttpError } from "../../utils/httpError.js";
import { slugParamSchema } from "../../utils/zodHelpers.js";
import {
  browseQuerySchema,
  newProductsQuerySchema,
  searchQuerySchema,
} from "./discovery.schema.js";
import * as browse from "./browse.service.js";
import * as service from "./discovery.service.js";

/** Grouped platform search: `{ stores, categories, products }`. */
export async function search(request: FastifyRequest) {
  const query = searchQuerySchema.parse(request.query);
  return ok(await service.searchPlatform(query));
}

/** Newest discoverable products platform-wide (homepage rail). */
export async function newProducts(request: FastifyRequest) {
  const query = newProductsQuerySchema.parse(request.query);
  const { total, products } = await service.listNewProducts(query);
  return list(products, buildListMeta(total, query.page, query.pageSize));
}

/** Most common category names across published stores (homepage chips). */
export async function popularCategories() {
  return ok(await service.getPopularCategories());
}

/** Marketplace trust counters: `{ stores, products, orders }`. */
export async function stats() {
  return ok(await service.getPlatformStats());
}

/**
 * `GET /public/browse` — every taxonomy node with something in it, biggest
 * first. Feeds the homepage category chips and the category sitemap.
 */
export async function browsableCategories() {
  return ok(await browse.listBrowsableCategories());
}

/**
 * `GET /public/browse/:slug` — one global category landing page: the node and
 * its breadcrumb, its non-empty children, and a page of products drawn from
 * every published store.
 *
 * An unknown or disabled slug is a 404, not an empty page. An empty page here
 * would be indexable, rank for nothing, and dilute every page that does work.
 */
export async function browseCategory(request: FastifyRequest) {
  const { slug } = slugParamSchema.parse(request.params);
  const query = browseQuerySchema.parse(request.query);

  const result = await browse.browseCategory(slug, query);
  if (!result) throw HttpError.notFound("Category not found");

  const { products, total, ...rest } = result;
  return {
    ...list(products, buildListMeta(total, query.page, query.pageSize)),
    ...rest,
  };
}

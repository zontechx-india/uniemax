import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import * as service from "./sitemap.service.js";

/**
 * Sitemap endpoints. These are the only public responses that are **not** the
 * `ok()` / `list()` JSON envelope — the sitemap protocol is XML, and a
 * crawler will not unwrap anything. Errors still go through the central
 * handler and answer JSON, which is correct: only a search engine reads the
 * success path, and only a developer reads the failure path.
 */

/**
 * The site's own origin, which is what every `<loc>` must be built from.
 *
 * `PUBLIC_WEB_URL` wins when set (the same variable the mail package uses for
 * links in emails). Otherwise it is derived from the request, because nginx
 * serves the SPA and this API from **one** origin — so the host a crawler
 * asked for is by definition the host the storefront lives on. That keeps
 * dev, the IP-and-port vhosts and production all correct with no config.
 */
function siteOrigin(request: FastifyRequest): string {
  const configured = process.env["PUBLIC_WEB_URL"]?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // `protocol` and `hostname` already honour X-Forwarded-* via trustProxy.
  const host = request.headers.host ?? request.hostname;
  return `${request.protocol}://${host}`;
}

/**
 * Crawlers re-fetch a sitemap often. An hour of shared caching matches the
 * service's own TTL, so a busy index costs one set of queries per hour per
 * file rather than one per fetch.
 */
function sendXml(reply: FastifyReply, xml: string) {
  return reply
    .type("application/xml; charset=utf-8")
    .header("cache-control", "public, max-age=3600")
    .send(xml);
}

/** `/sitemap.xml` — the index pointing at every file below. */
export async function sitemapIndex(request: FastifyRequest, reply: FastifyReply) {
  return sendXml(reply, await service.buildSitemapIndex(siteOrigin(request)));
}

/** `/sitemap-stores.xml` — the marketplace homepage + every store's front page. */
export async function marketplaceSitemap(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  return sendXml(reply, await service.buildMarketplaceSitemap(siteOrigin(request)));
}

const storeParams = z.object({ slug: z.string().min(1).max(200) });

/** `/sitemap-store-{slug}.xml` — one store's categories and products. */
export async function storeSitemap(request: FastifyRequest, reply: FastifyReply) {
  const { slug } = storeParams.parse(request.params);
  return sendXml(reply, await service.buildStoreSitemap(siteOrigin(request), slug));
}

/** `/sitemap-categories.xml` — the global `/c/{slug}` landing pages. */
export async function categorySitemap(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  return sendXml(reply, await service.buildCategorySitemap(siteOrigin(request)));
}

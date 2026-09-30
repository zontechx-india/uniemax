import type { FastifyRequest } from "fastify";

/**
 * The site's own origin — what every sitemap `<loc>` and every canonical /
 * `og:url` / `og:image` in a page shell is built from.
 *
 * `PUBLIC_WEB_URL` wins when set (the same variable the mail package uses for
 * links in emails). Otherwise it is derived from the request, because nginx
 * serves the SPA and this API from **one** origin — so the host a crawler
 * asked for is by definition the host the storefront lives on. That keeps
 * dev, the IP-and-port vhosts and production all correct with no config.
 */
export function siteOrigin(request: FastifyRequest): string {
  const configured = process.env["PUBLIC_WEB_URL"]?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // `protocol` and `hostname` already honour X-Forwarded-* via trustProxy.
  const host = request.headers.host ?? request.hostname;
  return `${request.protocol}://${host}`;
}

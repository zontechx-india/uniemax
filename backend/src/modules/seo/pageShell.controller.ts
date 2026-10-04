import type { FastifyReply, FastifyRequest } from "fastify";
import { loadShell, renderPage } from "./pageHead.js";
import { pageShellQuerySchema } from "./pageShell.schema.js";
import { resolvePage, type PageKind } from "./pageShell.service.js";
import { siteOrigin } from "./siteOrigin.js";

/**
 * Page shells — the storefront's `index.html` for `/`, `/sell`, `/store/**`
 * and `/c/**`, with the page's own head written in and a real status code.
 *
 * Every failure short of "there is no frontend build" still answers the
 * shell: a slow or failed lookup serves it unmodified (what nginx served
 * before this existed), because a visitor must never get a JSON error where
 * a page should be.
 */

export const homePage = (request: FastifyRequest, reply: FastifyReply) =>
  sendPage("home", request, reply);

export const sellPage = (request: FastifyRequest, reply: FastifyReply) =>
  sendPage("sell", request, reply);

export const storePage = (request: FastifyRequest, reply: FastifyReply) =>
  sendPage("store", request, reply);

export const browsePage = (request: FastifyRequest, reply: FastifyReply) =>
  sendPage("browse", request, reply);

async function sendPage(kind: PageKind, request: FastifyRequest, reply: FastifyReply) {
  const shell = await loadShell(request.log);
  if (!shell) {
    // nginx turns a 5xx from here into its own static index.html, so the
    // only place this text is ever seen is a direct hit on the API port.
    request.log.error("page shell: no frontend build to serve (index.html missing)");
    return reply
      .code(503)
      .type("text/plain; charset=utf-8")
      .header("cache-control", "no-store")
      .send("Storefront build not found.");
  }

  const url = new URL(request.url, "http://shell.local");
  // `get` returns the FIRST value of a repeated key, which is what the SPA's
  // `useSearchParams().get` reads too.
  const params = url.searchParams;
  const query = pageShellQuerySchema.parse({
    q: params.get("q") ?? undefined,
    section: params.get("section") ?? undefined,
    page: params.get("page") ?? undefined,
    sort: params.get("sort") ?? undefined,
  });

  const context = { origin: siteOrigin(request), path: url.pathname };
  const page = await resolvePage(kind, pathSegments(url.pathname), query, {
    ...context,
    log: request.log,
  });

  return reply
    .code(page?.status ?? 200)
    .type("text/html; charset=utf-8")
    // Same policy nginx applies to index.html: revalidate every time, so a
    // deploy's new asset hashes reach the next page load.
    .header("cache-control", "no-cache")
    .send(page ? renderPage(shell, page.head, context) : shell.html);
}

/**
 * The decoded segments after the first one (`/store/a/product/b` →
 * `["a", "product", "b"]`), the way React Router matches them — empty
 * segments (a trailing slash) are ignored. `null` for an undecodable path.
 */
function pathSegments(pathname: string): string[] | null {
  try {
    return pathname.split("/").filter(Boolean).slice(1).map(decodeURIComponent);
  } catch {
    return null;
  }
}

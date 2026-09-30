import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyBaseLogger } from "fastify";
import { env } from "../../config/env.js";
import { absoluteUrl, type Json } from "./structuredData.js";

/**
 * The storefront's HTML shell with one page's `<head>` written in.
 *
 * The frontend build's `index.html` is byte-identical for every URL, so on
 * its own a crawler that does not run JavaScript — every social-link scraper
 * (WhatsApp, Instagram, Facebook, X, Slack) and most non-Google crawlers —
 * only ever sees the platform defaults. This module takes that same file and
 * swaps the region between two markers for the page's own title,
 * description, canonical, robots, Open Graph / Twitter tags and JSON-LD.
 *
 * `frontend/src/shared/seo.ts` (`applySeo`) writes the identical set in the
 * browser after mount; `renderHead` is its server twin and emits the same
 * tags in the same shape, so the SPA finds them and updates them in place.
 * Two details exist only for that hand-over:
 *
 *  - `data-default` on the title, description and `og:image` carries the
 *    PLATFORM value. `seo.ts` captures its fallbacks from the document at
 *    load, which would otherwise be this page's values once a server wrote
 *    them — and a product's description would then "default" onto the next
 *    page the visitor opens.
 *  - JSON-LD blocks carry `data-seo`, the attribute the SPA uses to find and
 *    replace its own blocks, so a server-written `Product` block cannot
 *    survive a client-side navigation to another page.
 */

const APP_NAME = "UnieMax";

/** The managed region in `frontend/index.html`. */
const START = "<!-- seo:start -->";
const END = "<!-- seo:end -->";

/** What one page wants in its head — the server twin of the SPA's `SeoOptions`. */
export interface PageHead {
  /** Most specific first; joined "Part · Part · UnieMax". Empty = "UnieMax". */
  title: string[];
  /** Falsy = the platform default. Clamped to ~160 chars. */
  description?: string | null;
  /** Canonical path or absolute URL. Falsy = the requested path (no query). */
  canonical?: string | null;
  /** Social card image. Falsy = the platform default. */
  image?: string | null;
  type?: "website" | "product";
  /** Falsy = "index, follow". */
  robots?: string | null;
  jsonLd?: Json[];
}

/** The platform fallbacks, read out of the shell's own managed region. */
interface HeadDefaults {
  title: string;
  description: string;
  image: string;
}

export type Shell =
  | { kind: "templated"; html: string; before: string; after: string; defaults: HeadDefaults }
  /** Markers missing — served exactly as built, never half-edited. */
  | { kind: "static"; html: string };

// ---------------------------------------------------------------------------
// Loading the shell
// ---------------------------------------------------------------------------

/** `backend/` — three levels above this file from both `src/` (tsx) and `dist/` (node). */
const BACKEND_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * The built storefront `index.html`. Defaults to this clone's own frontend
 * build — on the server each clone builds its frontend next to its backend,
 * so dev and prod each read their own. `WEB_SHELL_PATH` overrides it.
 */
export function shellPath(): string {
  return env.WEB_SHELL_PATH ?? path.resolve(BACKEND_ROOT, "../frontend/dist/index.html");
}

let cached: { version: string; shell: Shell } | null = null;

/**
 * The shell, re-read whenever the file changes (a `stat` per request) — a
 * frontend deploy rebuilds `index.html` with new asset hashes while this
 * process keeps running, and a stale shell would point browsers at chunks
 * that no longer exist. `null` when there is no build to read.
 */
export async function loadShell(log: FastifyBaseLogger): Promise<Shell | null> {
  const file = shellPath();
  let version: string;
  try {
    const info = await stat(file);
    version = `${info.mtimeMs}:${info.size}`;
  } catch {
    return null;
  }
  if (cached?.version === version) return cached.shell;

  let html: string;
  try {
    html = await readFile(file, "utf8");
  } catch {
    return null;
  }

  const start = html.indexOf(START);
  const end = html.indexOf(END);
  let shell: Shell;
  if (start === -1 || end === -1 || end < start) {
    log.warn({ file }, "page shell: seo markers missing — serving index.html unmodified");
    shell = { kind: "static", html };
  } else {
    const region = html.slice(start + START.length, end);
    shell = {
      kind: "templated",
      html,
      before: html.slice(0, start + START.length),
      after: html.slice(end),
      defaults: {
        title: decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/.exec(region)?.[1]?.trim() ?? APP_NAME),
        description: decodeEntities(
          /<meta\s+name="description"\s+content="([^"]*)"/.exec(region)?.[1] ?? "",
        ),
        image: decodeEntities(/<meta\s+property="og:image"\s+content="([^"]*)"/.exec(region)?.[1] ?? ""),
      },
    };
  }
  cached = { version, shell };
  return shell;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * The shell with this page's head in its managed region. A `static` shell
 * (markers missing) comes back untouched.
 */
export function renderPage(
  shell: Shell,
  head: PageHead,
  context: { origin: string; path: string },
): string {
  if (shell.kind === "static") return shell.html;
  return `${shell.before}\n${renderHead(head, shell.defaults, context)}\n    ${shell.after}`;
}

/**
 * The server twin of `applySeo` in `frontend/src/shared/seo.ts`: every
 * managed tag, each falling back to the platform default.
 */
export function renderHead(
  head: PageHead,
  defaults: HeadDefaults,
  { origin, path: requestPath }: { origin: string; path: string },
): string {
  const parts = head.title.filter(Boolean);
  const title = parts.length ? `${parts.join(" · ")} · ${APP_NAME}` : APP_NAME;
  const description = head.description ? clampDescription(head.description) : defaults.description;
  const canonical = absoluteUrl(head.canonical || requestPath || "/", origin);
  const image = absoluteUrl(head.image || defaults.image, origin);
  const robots = head.robots || "index, follow";

  const tags = [
    `<title data-default="${attr(defaults.title)}">${text(title)}</title>`,
    `<meta name="description" content="${attr(description)}" data-default="${attr(defaults.description)}" />`,
    meta("name", "robots", robots),
    `<link rel="canonical" href="${attr(canonical)}" />`,
    meta("property", "og:type", head.type ?? "website"),
    meta("property", "og:site_name", APP_NAME),
    meta("property", "og:title", title),
    meta("property", "og:description", description),
    meta("property", "og:url", canonical),
    `<meta property="og:image" content="${attr(image)}" data-default="${attr(defaults.image)}" />`,
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "twitter:title", title),
    meta("name", "twitter:description", description),
    meta("name", "twitter:image", image),
    ...(head.jsonLd ?? []).map(
      (block) =>
        // `<` is the only character that can break out of a script element.
        `<script type="application/ld+json" data-seo>${JSON.stringify(block).replace(/</g, "\\u003c")}</script>`,
    ),
  ];
  return tags.map((tag) => `    ${tag}`).join("\n");
}

/** Google shows ~155–160 chars; cut on a word boundary past that. Same as the SPA. */
export function clampDescription(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat.length <= 160) return flat;
  const cut = flat.slice(0, 157);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function meta(attribute: "name" | "property", key: string, content: string): string {
  return `<meta ${attribute}="${key}" content="${attr(content)}" />`;
}

/** Escape for a double-quoted attribute value. */
function attr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape for element text (`<title>`). */
function text(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The handful of entities a hand-written `index.html` attribute can carry. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

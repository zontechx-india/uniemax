import { useEffect } from 'react'

/**
 * Per-route `<head>`: title, description, canonical, robots, Open Graph /
 * Twitter cards and JSON-LD structured data.
 *
 * ## What this can and cannot do
 *
 * The storefront is a client-rendered SPA, so `index.html` is byte-identical
 * for every URL. This module rewrites the head **after** React mounts, which
 * means:
 *
 *   - **Googlebot** — works. It renders JavaScript and reads the head from
 *     the rendered DOM, so per-product titles, descriptions, canonicals and
 *     `Product` / `BreadcrumbList` JSON-LD all land.
 *   - **Social scrapers** (WhatsApp, Instagram, Facebook, X, Slack) — does
 *     NOT work. They fetch the raw HTML and never execute JS, so they see
 *     only the platform defaults in `index.html`.
 *   - **Bing and most AI crawlers** — partial at best, same reason.
 *
 * Closing that gap needs the HTML shell built per request (the first byte
 * carrying the tags). This module is written so that is a drop-in change
 * rather than a rewrite: the *resolution* of a page's SEO fields already
 * lives in the page components, so a server renderer only has to call the
 * same public endpoints and emit the same `SeoOptions`.
 *
 * ## Why it always writes the full set
 *
 * Every call writes **every** managed tag, falling back to the platform
 * default for anything the page left out. So a product page's `og:image` and
 * `Product` JSON-LD cannot survive onto the next page that calls this — which
 * matters, because the alternative (patching only what changed) leaves a
 * stale `Product` block that Google reports as a structured-data error
 * against the whole domain.
 *
 * A route that calls neither `useSeo` nor `usePageTitle` does inherit the
 * previous route's tags, which is cosmetic only: a crawler loads every URL
 * fresh, so it never sees an inherited head. It shows up as a stale browser
 * tab title after an in-app navigation, and the fix is to give that route a
 * title rather than to reset from a layout (a parent's effect runs AFTER its
 * children's, so a layout-level reset would clobber the page that did the
 * right thing).
 */

const APP_NAME = 'UnieMax'

/** Managed tags carry this attribute so a later pass can clear its own. */
const MANAGED = 'data-seo'

/**
 * The platform fallbacks, read out of `index.html` at import time — i.e.
 * before any route has had a chance to overwrite them. One source of truth:
 * editing the static tags changes the fallback here too.
 */
const DEFAULTS = {
  title: document.title || APP_NAME,
  description: readMeta('name', 'description'),
  image: readMeta('property', 'og:image'),
}

function readMeta(attr: 'name' | 'property', key: string): string {
  return (
    document.head
      .querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
      ?.content ?? ''
  )
}

export interface SeoOptions {
  /**
   * Most specific part first — `['Leather Jacket', 'Rahul Fashion']` becomes
   * "Leather Jacket · Rahul Fashion · UnieMax". Empty/undefined parts are
   * dropped, so a loading state can pass `undefined` and refine once the
   * fetch lands.
   */
  title?: (string | null | undefined)[]
  /** Meta description. Trimmed to ~160 chars; falsy = the platform default. */
  description?: string | null
  /**
   * Canonical path (`/store/x/product/y`) or absolute URL. Defaults to the
   * current pathname **without** the query string, which is what makes
   * `?section=featured` and tracking params collapse onto one indexable URL.
   */
  canonical?: string | null
  /** Social card image — absolute URL or app-relative path. */
  image?: string | null
  /** `og:type`. "product" on a product page, "website" everywhere else. */
  type?: 'website' | 'product'
  /**
   * Robots directive. Defaults to `index, follow`. Use `noindex, follow` for
   * pages that are real but not destinations (search results, an unpublished
   * store's draft preview, anything per-customer): "follow" still lets the
   * links on them pass equity to the pages that ARE destinations.
   */
  robots?: string | null
  /** One JSON-LD object or several; each is emitted as its own script tag. */
  jsonLd?: unknown | unknown[] | null
}

/** Absolute URL from an app path, a `/uploads/...` path or an already-absolute URL. */
function absolute(value: string): string {
  try {
    return new URL(value, window.location.origin).href
  } catch {
    return value
  }
}

/** Google shows ~155–160 chars; anything past that is dead weight. */
function clampDescription(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= 160) return flat
  // Cut on a word boundary so the snippet does not end mid-word.
  const cut = flat.slice(0, 157)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** Upsert a `<meta>` by its identifying attribute, creating it if absent. */
function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  )
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, key)
    tag.setAttribute(MANAGED, '')
    document.head.appendChild(tag)
  }
  tag.content = content
}

function setLink(rel: string, href: string) {
  let tag = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!tag) {
    tag = document.createElement('link')
    tag.rel = rel
    tag.setAttribute(MANAGED, '')
    document.head.appendChild(tag)
  }
  tag.href = href
}

/**
 * Writes the resolved head. Split out of the hook so a future server
 * renderer (or a test) can call it with the same options object.
 */
export function applySeo(options: SeoOptions) {
  const parts = (options.title ?? []).filter(Boolean) as string[]
  const title = parts.length ? `${parts.join(' · ')} · ${APP_NAME}` : APP_NAME
  const description = options.description
    ? clampDescription(options.description)
    : DEFAULTS.description
  const canonical = absolute(
    options.canonical || window.location.pathname || '/',
  )
  const image = absolute(options.image || DEFAULTS.image)
  const robots = options.robots || 'index, follow'

  document.title = title
  setMeta('name', 'description', description)
  setMeta('name', 'robots', robots)
  setLink('canonical', canonical)

  setMeta('property', 'og:type', options.type ?? 'website')
  setMeta('property', 'og:site_name', APP_NAME)
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:url', canonical)
  setMeta('property', 'og:image', image)
  setMeta('name', 'twitter:card', 'summary_large_image')
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', description)
  setMeta('name', 'twitter:image', image)

  // JSON-LD is replaced wholesale rather than patched: a stale `Product`
  // block left behind on a category page is a structured-data error Google
  // reports against the whole site.
  document.head
    .querySelectorAll(`script[type="application/ld+json"][${MANAGED}]`)
    .forEach((node) => node.remove())

  const blocks = options.jsonLd
    ? Array.isArray(options.jsonLd)
      ? options.jsonLd
      : [options.jsonLd]
    : []
  for (const block of blocks) {
    if (!block) continue
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.setAttribute(MANAGED, '')
    // `<` is the only character that can break out of a script element.
    script.textContent = JSON.stringify(block).replace(/</g, '\\u003c')
    document.head.appendChild(script)
  }
}

/**
 * Per-route head tags. Pass what the page knows; everything else falls back
 * to the platform default, so a page can start with just a title and refine
 * once its fetch resolves.
 *
 *   useSeo({
 *     title: [product?.name, store.name],
 *     description: product?.description,
 *     canonical: storeProductUrl(store.slug, productSlug),
 *     image: product?.media[0]?.url,
 *     type: 'product',
 *     jsonLd: productJsonLd(...),
 *   })
 */
export function useSeo(options: SeoOptions) {
  // Options are rebuilt every render (fresh arrays/objects), so the effect is
  // keyed on the serialized value rather than on identity — otherwise it
  // would rewrite the whole head on every keystroke elsewhere on the page.
  const key = JSON.stringify(options)
  useEffect(() => {
    applySeo(JSON.parse(key) as SeoOptions)
  }, [key])
}

/**
 * Title-only shorthand — the original hook, now one line over `useSeo`.
 * Because it goes through the same writer, a page using it still RESETS the
 * description, canonical, card image and JSON-LD to the platform defaults
 * instead of inheriting the previous route's.
 */
export function usePageTitle(...parts: (string | undefined | null)[]) {
  useSeo({ title: parts })
}

/**
 * For pages that are real but must never be a search result: a cart, a
 * checkout, an order confirmation, an address book, a support thread.
 *
 * `robots.txt` already disallows these paths, but the two do different jobs —
 * a disallow stops the crawl, `noindex` removes a URL that was indexed
 * anyway (from a link someone shared, which is exactly how an order
 * confirmation escapes). Belt and braces is the right posture here, because
 * the failure is a stranger's order details in a results list.
 *
 * `follow` is kept: these pages link back into the store, and there is no
 * reason to strand that.
 */
export function usePrivatePageTitle(...parts: (string | undefined | null)[]) {
  useSeo({ title: parts, robots: 'noindex, follow' })
}

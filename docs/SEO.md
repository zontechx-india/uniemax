# SEO & Discoverability — Source of Truth

> **Status (4 Oct 2026):** per-page head tags, structured data, `robots.txt`,
> XML sitemaps, global category pages (`/c/{slug}`) and **page shells**
> (per-page tags in the first byte of HTML, real 404s) are **live on dev and
> production**. **Share images** (small JPEG link previews) and server-side
> image normalization are **live on dev and production** (`v1.21.0`), and
> every existing image has been brought up to date ([§9](#9-operations)).
> **Sized photos** (`srcset` — phones download a copy that fits, not the
> original; [§4.6](#46-sized-photos-srcset)) are **live on dev and production** (`v1.22.0`).
> **Live on dev and production** (`v1.23.0`, 4 Oct 2026): page shells for `/` and `/sell` (absolute
> `og:image`, own canonical), **store cards** (wide link previews for store
> pages, [§4.7](#47-store-cards-wide-link-previews)), product images in the
> store sitemaps, `/sell` in the sitemap, and the category-page **coverage**
> report for admins ([§10](#10-known-gaps-and-caveats)).
> Everything else in the [roadmap](#11-roadmap) is not started.
>
> **This file owns SEO.** What SEO is for this platform, how it is built, the
> per-page rules, what is live, what is planned and why. Other docs point
> here instead of repeating it. Two exceptions, by design:
> endpoint contracts (the sitemap and page-shell routes) live in
> [`API.md`](./API.md), and server commands (nginx) live in
> [`DEPLOYMENT.md`](./DEPLOYMENT.md). This file links to both.
>
> **Keep it current.** Any change to SEO-related code — the files listed in
> [§12](#12-keeping-this-file-and-the-code-in-sync) — must update this file
> in the same task: the rule tables, the status lines, the roadmap and the
> [change log](#13-change-log). This is enforced through
> [`CLAUDE.md`](../CLAUDE.md) (Documentation Maintenance), which every Claude
> Code session in this repo reads. Nothing updates it automatically.

---

## Contents

1. [SEO in five minutes](#1-seo-in-five-minutes) — for anyone new to this
2. [Why a marketplace needs this](#2-why-a-marketplace-needs-this)
3. [What is live](#3-what-is-live)
4. [Architecture](#4-architecture)
5. [Per-page head rules](#5-per-page-head-rules)
6. [Indexing policy](#6-indexing-policy)
7. [Structured data rules](#7-structured-data-rules)
8. [Sitemaps](#8-sitemaps)
9. [Operations](#9-operations)
10. [Known gaps and caveats](#10-known-gaps-and-caveats)
11. [Roadmap](#11-roadmap)
12. [Keeping this file and the code in sync](#12-keeping-this-file-and-the-code-in-sync)
13. [Change log](#13-change-log)

---

## 1. SEO in five minutes

**SEO** (search engine optimisation) is everything that decides whether a
page shows up — and how it looks — when someone searches Google or Bing, or
shares a link on WhatsApp, Instagram, Facebook, X or Slack.

None of those services look at the page the way a person does. A program
(a **crawler** for search engines, a **scraper** for link previews) downloads
the page's HTML and reads a few tags from its `<head>`:

| Tag | What it is for | Example on a product page |
| --- | --- | --- |
| `<title>` | The blue link in a search result; the browser tab | `MRF Genius Bat · Rahul Sports · UnieMax` |
| `<meta name="description">` | The grey snippet under the link | `Buy MRF Genius Bat from ₹2,999 — Cricket Bats from Rahul Sports on UnieMax…` |
| `<link rel="canonical">` | "The one true URL of this page" — merges duplicates (`?utm_source=…`, `?page=2`) into one | `https://uniemax.com/store/rahul-sports/product/mrf-genius-bat` |
| `<meta name="robots">` | Whether a search engine may list this page (`index`/`noindex`) and follow its links (`follow`) | `index, follow` |
| `og:*` / `twitter:*` (Open Graph) | The **link preview card**: title, text, image | `og:image` = the product photo |
| JSON-LD (`<script type="application/ld+json">`) | **Structured data**: machine-readable facts (price, stock, address) that Google turns into rich results | `{"@type":"Product","offers":{"price":2999,…}}` |

Two more site-wide files help crawlers:

- **`robots.txt`** — paths crawlers should not fetch at all (carts, checkout…).
- **XML sitemaps** — the full list of URLs worth crawling, so a crawler does
  not have to discover every product by clicking through pages.

### The problem with a React app (and why "page shells" exist)

The storefront is a **single-page app (SPA)**: the server sends one tiny
`index.html` for every URL, and React then fetches the product over the API
and draws the page in the browser. The `<head>` tags above are written by
JavaScript *after* that happens.

- **Googlebot** runs JavaScript, so it eventually sees the real tags.
- **Link-preview scrapers** (WhatsApp, Instagram, Facebook, X, Slack) and most
  other crawlers **do not run JavaScript**. They saw only the platform's
  default tags — every shared product link previewed as "UnieMax" with the
  logo, not as the product.
- A deleted product still answered **HTTP 200** (the SPA fallback serves
  `index.html` for anything), so search engines could not tell it was gone.

**Page shells** fix both for every page meant to be found or shared (the
home page, `/sell`, store and category pages): the backend sends the same
`index.html`, but with *that page's* tags already written into it — every URL
absolute — and a real **404** when the page does not exist. See
[§4](#4-architecture).

> **Common question — does `index.html` now contain all our products?** No.
> It is a ~8 KB template that never grows. For each request the backend looks
> up **one** page's data in the database, writes ~2 KB of tags into a copy of
> the template in memory, and sends that. Nothing is saved anywhere; 200,000
> products or 20 million, the file is the same size.

---

## 2. Why a marketplace needs this

Sellers bring their own traffic first — they **share links** (mostly on
WhatsApp). A preview showing the product photo and price gets clicked; a
generic "UnieMax" card does not. That is why first-byte tags were step 1.

For search, nobody googles a shop they have never heard of; they google
"men's jackets" or "cricket bat". Two surfaces exist for that:

- **Product and store pages** (`/store/{slug}/…`) — rank for exact product
  names and the shop's own name; `Product` structured data can show price and
  stock in results.
- **Global category pages** (`/c/{slug}`) — one page per *kind* of product,
  drawing from every published store, so a category search has a page on this
  site to land on. The page hands each visitor on to the seller's own
  storefront. (UI and data: [`FRONTEND_CONTEXT.md`](./FRONTEND_CONTEXT.md) →
  Global category pages; [`BACKEND_CONTEXT.md`](./BACKEND_CONTEXT.md) → global
  category pages.)

---

## 3. What is live

| Capability | Where | Since |
| --- | --- | --- |
| Per-route head (title, description, canonical, robots, OG/Twitter, JSON-LD) written in the browser | `frontend/src/shared/seo.ts` (`useSeo`, `usePageTitle`, `usePrivatePageTitle`) | 23 Sep 2026 (titles only since 25 Jul) |
| Structured data: `Product`/`Offer`/`AggregateOffer`, `Store`/`Organization`, `BreadcrumbList`, `ItemList`, `WebSite` | `frontend/src/storefront/features/publicStore/structuredData.ts` + page components | 23 Sep 2026 |
| `robots.txt` (per-customer pages, consoles, affiliate redirects, `?q=` disallowed; declares the sitemap) | `frontend/public/robots.txt` | 23 Sep 2026 |
| XML sitemaps (index · stores · categories · one per store); per-store files list product photos and the logo as `<image:image>` | `backend/src/modules/seo/sitemap.service.ts` · contract in [`API.md`](./API.md) → Sitemaps | 23 Sep 2026; images and `/sell` 4 Oct 2026 (`v1.23.0`) |
| Global category landing pages `/c/{slug}` | `frontend/src/storefront/pages/BrowseCategoryPage.tsx` · `backend/src/modules/discovery/browse.service.ts` | 23 Sep 2026 |
| **Page shells**: per-page tags in the first byte for `/store/**` and `/c/**`, real 404s | `backend/src/modules/seo/pageShell.*`, `pageHead.ts` · contract in [`API.md`](./API.md) → Page shells | 1 Oct 2026, dev + prod |
| Page shells for `/` and `/sell` (absolute `og:image`, own canonical, `WebSite` JSON-LD in the first byte) | same files; nginx step in [`DEPLOYMENT.md`](./DEPLOYMENT.md) → Adding `/` and `/sell` | 4 Oct 2026, dev + prod (`v1.23.0`) |
| **Store cards**: store pages' `og:image` is the logo on a 1200×630 card, so WhatsApp shows the large preview — see [§4.7](#47-store-cards-wide-link-previews) | `renderCardImage` in `backend/src/package/storage/images.ts` · contract in [`API.md`](./API.md) → Image derivatives | 4 Oct 2026, dev + prod (`v1.23.0`) |
| Share button (native share sheet / copy link) on store header and product page | `frontend/src/storefront/features/publicStore/ShareButton.tsx` | before Sep 2026 |
| **Share images**: every product page's `og:image` is a preview-safe JPEG (≤ 1200 px, < 300 KB) of the cover photo, so WhatsApp shows it — see [§4.5](#45-share-images-link-preview-images) | `backend/src/package/storage/images.ts`, `backend/src/modules/media/` · contract in [`API.md`](./API.md) → Share images | 4 Oct 2026, dev + prod (`v1.21.0`) |
| **Sized photos**: every stored image is offered at 320/640/960/1280 px via `srcset`, so the browser downloads the copy that fits — see [§4.6](#46-sized-photos-srcset) | `frontend/src/shared/media/MediaImg.tsx`, `backend/src/package/storage/images.ts` · contract in [`API.md`](./API.md) → Image derivatives | 4 Oct 2026, dev + prod (`v1.22.0`) |
| Measurement: GA4 + Meta Pixel (not SEO, but how SEO results are measured) | `frontend/index.html`, `frontend/src/shared/analytics/` · [`FRONTEND_CONTEXT.md`](./FRONTEND_CONTEXT.md) | 28 Sep 2026 |

---

## 4. Architecture

### 4.1 Request flow

```text
                    Browser / Googlebot / WhatsApp scraper
                                  │
                                nginx
          ┌───────────────────────┼─────────────────────────────┐
          │                       │                             │
  /, /sell, /store/**,     /api/** (JSON API)        everything else
  /c/** (page shells)             │                  ( /cart, /checkout/,
          │                       │                    /mystores, /assets/ … )
          ▼                       ▼                             ▼
  Fastify GET / · /sell    Fastify /api/v1/…         static files from the
  Fastify GET /store/*                                frontend build
  Fastify GET /c/*                                    (index.html as built)
          │
          ├─ 1. load frontend/dist/index.html (cached until the file changes)
          ├─ 2. look up the page with the SAME public services the API uses
          ├─ 3. replace the region between <!-- seo:start --> … <!-- seo:end -->
          │     with that page's tags
          └─ 4. answer 200 (page exists) or 404 (it does not) — same HTML
                                  │
                                  ▼
            Browser boots React from that HTML as usual; seo.ts then
            keeps the head up to date on every in-app navigation.
```

If the backend is down, slow (> 1.5 s), throws, or rate-limits, the visitor
still gets a working page: the backend serves `index.html` unmodified, or
nginx serves its own static copy. A page can never be worse than before
page shells existed.

### 4.2 Two writers, one head

The same tags are written in two places, and they must agree:

| Who writes | When | Who sees it | Code |
| --- | --- | --- | --- |
| **Backend** (page shell) | Before the first byte, for `/`, `/sell`, `/store/**` and `/c/**` | Everyone — scrapers, every crawler, the browser | `backend/src/modules/seo/pageShell.service.ts` (rules), `pageHead.ts` (rendering) |
| **Browser** (`seo.ts`) | After React mounts, and on every in-app navigation, on every route | Googlebot and visitors (tab title) | `frontend/src/shared/seo.ts` + each page's `useSeo` call |

So every per-page rule exists twice — the page component's `useSeo` call and
its **server twin** in `pageShell.service.ts`. Two helper files are **ports**
(copies) of frontend code:

| Frontend original | Backend port |
| --- | --- |
| `storefront/features/publicStore/structuredData.ts` | `backend/src/modules/seo/structuredData.ts` (origin passed explicitly) |
| `storefront/features/publicStore/productDescription.ts` (`parseDescription`, `productMetaDescription`) + `formatPrice` in `storesApi.ts` | `backend/src/modules/seo/productText.ts` |
| `shared/seo.ts` → `applySeo` | `backend/src/modules/seo/pageHead.ts` → `renderHead` |

**A change to one side belongs in both.** If they drift, Googlebot (which
reads the browser's version) and WhatsApp (which reads the server's) see
different things — not an error, but inconsistent.

### 4.3 The managed region in `index.html`

`frontend/index.html` brackets the `<title>` and every SEO/social tag:

```html
<!-- seo:start -->
<title>UnieMax — Online Shops You Can Buy From Directly</title>
<meta name="description" content="…platform description…" />
<meta name="robots" content="index, follow" />
<meta property="og:…" … />   <meta name="twitter:…" … />
<!-- seo:end -->
```

- The backend replaces **everything between the markers** and reads the
  platform defaults (title, description, `og:image`) back out of it. Keep the
  markers, and keep each tag's attributes in the order written
  (`name=` then `content=`) — the backend matches that shape.
- Without the markers the backend serves `index.html` untouched (and logs a
  warning) rather than half-editing it.
- Routes not served by page shells (cart, checkout, account, the seller
  console) get this file as built, so these values must describe the
  **platform**, never a page. Its `og:image` is a relative path
  (`/og-image.jpg`, the platform's 1200×630 card); page shells make it
  absolute, which is why every shareable page is a page shell.

Hand-over details between the two writers:

- **`data-default`** on the server's `<title>`, description and `og:image`
  holds the *platform* value. `seo.ts` reads its fallbacks from it — without
  it, a product's description would become the "default" for every page
  opened after it.
- **`data-seo`** on the server's JSON-LD blocks is the attribute `seo.ts`
  uses to find and replace its own, so a server-written `Product` block can
  never linger on the next page (a stale block is a structured-data error
  against the whole domain).

### 4.4 Page-shell behaviour in detail

| Aspect | Behaviour |
| --- | --- |
| Template | `WEB_SHELL_PATH`, default this clone's `../frontend/dist/index.html`. Re-read whenever its mtime/size changes, so a frontend-only deploy needs no backend restart. Missing build → `503`, which nginx swaps for its static file. |
| Data | `getPublicStoreShell` (store home), `getVisibleStore` (other store pages), `getPublicCategory`, `getPublicProduct`, `browseCategory` — the public services, so visibility rules are identical to the API's. |
| Viewer | **Anonymous.** An owner's unpublished store is a 404 here; the SPA still loads their draft over the API with their session. |
| Status | `200` real page · `404` unknown/unpublished store, product, category, `/c/` node, unknown sub-path, undecodable path (same HTML, `noindex`) · `200` unmodified on timeout/error. |
| Time limit | 1.5 s; past it the default head is served and a warning logged. |
| Cache | Resolved **200** heads cached in process 60 s (≤ 500 entries) to absorb a viral link. **404s are never cached**, so a store is shareable the moment it publishes. |
| Headers | `text/html; charset=utf-8`, `cache-control: no-cache` (same as nginx gives `index.html`). Helmet is **off** for these routes: its `Referrer-Policy: no-referrer` on a document would break the referrer-restricted Google Maps key on every page opened afterwards. |
| Query params | Read like the SPA reads them, never rejected. `utm_*`, `fbclid` etc. are ignored and never reach the canonical. |
| URL limits | Path params up to 500 chars (`maxParamLength` in `app.ts`) — long product names make long slugs. |
| Images | `og:image` / `twitter:image` are **share images** on product pages ([§4.5](#45-share-images-link-preview-images)) and **store cards** on store pages ([§4.7](#47-store-cards-wide-link-previews)), never originals. JSON-LD `image` keeps the full-size originals — Google wants the largest. |

### 4.5 Share images (link-preview images)

**The problem they solve.** WhatsApp builds a link preview **on the sender's
phone**, at the moment the link is pasted, and silently drops an image it
cannot download quickly — roughly anything over 300–600 KB. Instagram and
Facebook fetch previews on Meta's servers and accept large images. So a
product whose photo was a 2.2 MB PNG previewed with its photo on Instagram
and without it on WhatsApp — and "sometimes worked" on WhatsApp, on a fast
connection. WhatsApp also caches each URL's preview on the phone, so a
re-share reuses whatever it got first.

**The fix, at the root — two layers** (`backend/src/package/storage/images.ts`):

1. **Uploads are normalized by the server.** Every image upload — product
   photos, banners, logos — is stored upright, size-capped (1920 px; logos
   1024 px), EXIF-stripped WebP, whatever client sent it. The browser editor
   already did this, but the server used to trust it, so uploads that
   skipped the editor went in at full size. An image that already meets the
   rules is stored untouched. Details: [`BACKEND_CONTEXT.md`](./BACKEND_CONTEXT.md) → Media storage.
2. **Previews use a dedicated copy.** A preview-safe JPEG of each product
   cover (logos get a wide store card instead — [§4.7](#47-store-cards-wide-link-previews)):
   ≤ 1200 px, white behind transparency, < 300 KB,
   JPEG (the one format every preview service renders; progressive, from
   sharp's `mozjpeg` encoder — Meta's Sharing Debugger renders it). It lives
   beside the original at `derived/share/<key>.jpg` (no DB column — originals
   are immutable, so their share image is too) and is served by
   `GET /api/v1/public/images/share/{bucket}/{key}.jpg`.

**Lifecycle.** Rendered and stored on the first request for it, read back
afterwards (first request ~0.5 s, then ~0.1 s); warmed in the background
right after a cover/logo upload; pre-rendered for existing images by
`npm run optimize-media`. The URL reaches pages as `shareImageUrl` on the
public store shell and product detail, so the browser (`useSeo`) and the
page shell emit the same `og:image`. `npm run audit-media` judges a
`derived/` object by its source image (orphaned only when the source is).

Measured on the image that triggered this: 2,262 KB PNG → stored as a
163 KB WebP, previewed as a 114 KB JPEG.

### 4.6 Sized photos (`srcset`)

**The problem.** Every photo was stored once (≤ 1920 px) and that one file
was sent wherever it appeared — a 180 px grid card on a phone downloaded the
same file as a zoomed product photo on a laptop. Slow pages on mobile data,
and page speed (Core Web Vitals, LCP) is a Google ranking signal.

**The fix, at the root.**

1. **Server: sized copies of every stored image** at a fixed set of widths
   (320, 640, 960, 1280; WebP), made by the same derived-image mechanism as
   share images ([§4.5](#45-share-images-link-preview-images)): rendered on
   first request, stored at `derived/w{width}/…`, cached forever, and
   rendered for every upload in the background by `storeUpload` — the one
   function every upload is written with. Served by
   `GET /api/v1/public/images/w/{width}/{bucket}/{key}`.
2. **Server publishes the rules** (widths, each bucket's URL root, the
   accepted key pattern) in `/public/media-config`, so the frontend can
   never ask for a copy the server would not serve.
3. **Frontend: one component** — every stored image is drawn with
   `<MediaImg src sizes>` (`shared/media/MediaImg.tsx`), never a bare
   `<img>`. It builds the `srcset` (copies + the original as the largest
   candidate) and each call site states how wide the image is drawn
   (`sizes`, required), so the browser picks the copy. URLs it does not
   recognise (local previews, outside links) render as is.

The product page's main photo keeps the original on desktop on purpose:
hover-zoom draws it at 1.9×. Phones (no zoom) get a sized copy.

Measured on dev, same pages and photos, old code vs new (phone 390 px @3×):
marketplace home 1,646 → 750 KB (desktop 611 KB), store home 157 → 69 KB,
product page 429 → 223 KB. Production after release (phone): KC Trends'
watch page 464 KB where the same images at full size are 2,160 KB; the
marketplace home 1,257 KB vs 3,216 KB.

### 4.7 Store cards (wide link previews)

**The problem.** WhatsApp, Facebook and LinkedIn pick the card layout from
the image's shape: a wide image (~1.91:1) gets the **large** card, a square
one only a small thumbnail beside the text. Store logos are square (or
portrait), so every shared store link got the small card — while a product
photo shared next to it got the large one.

**The fix, at the root.** A **store card** derived image
(`renderCardImage` in `backend/src/package/storage/images.ts`), registered
beside share images and sized copies, so it gets the same lifecycle for free
(rendered on first request, stored at `derived/card/<key>.jpg`, cached
forever, warmed on every logo upload, pre-rendered by `optimize-media`):

- **1200×630** JPEG (progressive, like share images), typically 10–30 KB.
- The logo's blank margin is trimmed, then the mark is scaled to a centred
  840×400 box (enlarged if small — a tiny mark in a big card reads as an
  empty preview) with margin for X's 2:1 crop.
- The canvas is the logo's **own background colour** when its edges are one
  flat colour (an orange square logo becomes an orange card, with no box
  around the mark), otherwise white — the same backdrop share images use.

Which preview a kind of image gets is decided in **one place**
(`PREVIEW_BY_BUCKET`: product photos → share image, logos → card), and every
`og:image` URL is built by `shareImagePath(bucket, key)`, so store home,
category, shop and product-fallback heads all switched with no change at the
call sites. Old logo share-image URLs keep working for previews cached
before the switch.

The platform's own card (`frontend/public/og-image.jpg`, the default
`og:image`) is the logo lockup rendered by the same function.

No text is drawn on the card: the store name is already the `og:title`
printed under it, and text rendering would need fonts for every script a
store name can be written in.

---

## 5. Per-page head rules

Title format everywhere: parts joined with ` · ` and suffixed ` · UnieMax`
(no parts → the platform title in `index.html`, "UnieMax — Online Shops You
Can Buy From Directly"; only the home page has none). Descriptions are flattened and cut at ~160 chars on a
word boundary. Canonicals are absolute, built from `PUBLIC_WEB_URL` on the
server and `window.location.origin` in the browser; when a page gives no
canonical it is the current path **without** the query string.

**S** = also written by the page shell (server); **B** = browser only.

| Page | Title parts | Description | Canonical | Robots | Image | JSON-LD | Missing → |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Store home `/store/{s}` **S** | store | Footer "About" text, else `Shop {first 6 shelves} at {store} on UnieMax. Order online with delivery or store pickup.`, else `Shop {store} on UnieMax — …` | `/store/{s}` | index (draft: noindex, browser only) | store card | `Store` (has a footer address) or `Organization` | 404 "Store not available" |
| Category `/store/{s}/category/{c}` **S** | category, store | `{cat} at {store} — {subcategories}. …` or `Shop {cat} at {store} on UnieMax. …` | itself | index | store card | `BreadcrumbList` | 404, title = store, noindex |
| Product `/store/{s}/product/{p}` **S** | product, store | Seller's prose → their bullet highlights → `Buy {name} from ₹{price} — {category} from {store} on UnieMax. …` | itself | index | cover photo's share image, else the store card | `Product` + `Offer`/`AggregateOffer` (full-size photos), `BreadcrumbList` | 404, title = store, noindex |
| Shop `/store/{s}/shop` **S** | `Shop` / `Search "{q}"` / section name, store | `Browse every product from {store} on UnieMax — …` (unscoped only) | `/store/{s}/shop` | `?q=` or `?section=` → noindex | store card | — | 404 "Store not available" |
| Store support `/store/{s}/support` **S** | `Help & Support`, store | platform default | path | index | platform | — | — |
| Support thread `/store/{s}/support/{id}` **S** | `Support request`, store | platform default | path | noindex | platform | — | — |
| Global category `/c/{slug}` **S** | category, `Shop by category` | `Shop {cat} on UnieMax — {n} products from {k} independent shops. …` (or a no-count line when empty) | `/c/{slug}` | noindex when empty, `?page=` > 1, or `?sort=` ≠ newest | platform | `BreadcrumbList` + `ItemList` (indexable pages only) | 404, noindex |
| Marketplace home `/` **S** | — (the platform title) | platform description | `/` | index | platform card (`og-image.jpg`) | `WebSite` | — |
| `/sell` **S** | `Create your free online store` | seller pitch | `/sell` | index | platform card | — | — |
| Cart, checkout, order confirmation, account, addresses, marketplace support **B** | page name | platform | path | **noindex** (`usePrivatePageTitle`) + `robots.txt` disallow | platform | — | — |

---

## 6. Indexing policy

| Kind of page | Treatment | Why |
| --- | --- | --- |
| Store home, category, product, unscoped shop, `/c/{slug}` page 1 | `index, follow`, in the sitemaps | Real destinations |
| Search results (`?q=`), merchandising rows (`?section=`), `/c/` page 2+ or re-sorted | `noindex, follow`, canonical to the bare page | Duplicates of pages already indexed — but their links still get followed |
| Empty `/c/` node | `noindex`, left out of the sitemap | A thin page dilutes every page that works |
| Owner's unpublished draft | `noindex` (browser) and 404 (page shell) | Must never reach a results list |
| Missing store / product / category | **404** (page shell) + `noindex` (browser, for one that vanishes while the tab is open) | Lets search engines drop it |
| Per-customer pages (cart, checkout, orders, addresses, support, profile) | `noindex` **and** `robots.txt` disallow | A disallow stops crawling; `noindex` removes a URL that got indexed anyway (e.g. a shared order-confirmation link) |
| Seller console (`/mystores`, `/stores`), `/admin`, affiliate redirects (`/a/`) | `robots.txt` disallow | Not content |
| Everything on `dev.uniemax.zontechx.com` | `X-Robots-Tag: noindex, nofollow` header (nginx, dev host only — `docs/DEPLOYMENT.md` → Security hardening) | A second copy of the site on another domain must never be indexed or mistaken for uniemax.com |
| `hideFromSearch` products | Left out of sitemaps and on-site search; the product page itself stays indexable | The flag means "not in search results", not "hidden" |

---

## 7. Structured data rules

- **Never invent a fact.** There is no review system, so no `aggregateRating`
  or `review`. Claiming either is grounds for a manual action against the
  whole domain.
- **Omit rather than guess.** `prune()` drops empty fields — an absent
  optional is valid, an empty string is an error.
- `brand` is the **store name**: products have no brand field yet (see
  roadmap step 2).
- The store's address is one free-text `streetAddress` with
  `addressCountry: IN` — never split on commas into invented parts.
  A store without a footer address is an `Organization`, because a
  `LocalBusiness` without `address` is invalid.
- Variant products quote an `AggregateOffer` (low/high price across sellable
  variants); simple products a single `Offer`. `availability` comes from total
  stock.
- Seller specifications map onto `additionalProperty`.

---

## 8. Sitemaps

A marketplace cannot rely on crawlers clicking through: a product sits behind
Load-More listings, so a crawler reaches the newest handful and stops. The
sitemaps list everything, and `lastmod` is what gets a price change
re-crawled.

- `robots.txt` declares `https://uniemax.com/api/v1/public/sitemap.xml`
  (an index → `sitemap-stores.xml` (`/`, `/sell` and every store's front
  page), `sitemap-categories.xml`, one `sitemap-store-{slug}.xml` per
  published store).
- **Image sitemap:** each per-store file lists the logo on the store home and
  every product's photos (gallery order, full-size originals) as
  `<image:image>`, so photos reach Google Images even though the page draws
  them with JavaScript. Alt text is read from the page itself — sellers set
  it per photo ("Describe this photo" in the product editor), falling back
  to the product name.
- One file per store on purpose: Search Console reports coverage per
  sitemap, which answers "how much of this seller's catalog is indexed".
- Same visibility predicates as the storefront, plus `hideFromSearch`
  products excluded. 1 h in-process cache.
- Exact contents and limits: [`API.md`](./API.md) → Sitemaps.

---

## 9. Operations

| Item | State |
| --- | --- |
| nginx forwards `/store/` and `/c/` to the API | **Live since 1 Oct 2026** on all four vhosts (dev → `:4001`, prod → `:4000`). Commands, verification and rollback: [`DEPLOYMENT.md`](./DEPLOYMENT.md) → Page shells. |
| nginx forwards `/` and `/sell` to the API | **Applied on dev and prod, 4 Oct 2026** ([`DEPLOYMENT.md`](./DEPLOYMENT.md) → Adding `/` and `/sell`). Page shells on both since `v1.23.0`. |
| Store cards for existing logos | **Done on dev and production, 4 Oct 2026** (`optimize-media -- --apply --only=logos`): dev 20, prod 30 logos; nothing re-encoded. New logos get theirs on upload. |
| ⚠️ Rolling production back past `747a9b3` | Remove the prod page-shell include **first** — an older backend answers those paths with a JSON 404. |
| Google Search Console / Bing Webmaster Tools | **Not confirmed.** The repo has no verification tag (only Meta's `facebook-domain-verification`), so if they are set up it is by DNS. Submit `sitemap.xml` in both. |
| `PUBLIC_WEB_URL` | Origin for canonicals, `og:url`, `og:image` and sitemap `<loc>`s. Prod: `https://uniemax.com`. |
| Sized copies for existing images | **Done on dev and production, 4 Oct 2026** (`optimize-media -- --apply`): prod 121 images (86 product photos, 28 logos, 7 banners), dev 84; nothing failed. New uploads get them via `storeUpload`, so this is not a recurring job. |
| Existing images (`npm run optimize-media`) | **Done on dev and production, 4 Oct 2026.** Prod: 8 product photos (KC Trends' 2–3 MB PNGs, 22.7 MB → 2.1 MB), 20 logos (1.4 MB → 0.6 MB) and 1 banner (1.4 MB → 59 KB) re-encoded; 57 share images rendered; nothing failed. Dev: 2 logos, 3 banners, 42 share images. New uploads are normalized on arrival, so this is not a recurring job — re-run only if images were written around the upload path. Commands: [`backend/README.md`](../backend/README.md). |

Quick checks (public, safe to run any time):

```bash
curl -s https://uniemax.com/store/<slug> | grep -o '<title[^<]*</title>'   # the store's own title
curl -s -o /dev/null -w '%{http_code}\n' https://uniemax.com/store/no-such-store-zz9   # 404
curl -s https://uniemax.com/store/<slug> | grep -o 'og:image" content="[^"]*'   # …/images/card/logo/….jpg
curl -s https://uniemax.com/ | grep -o 'og:image" content="[^"]*'   # https://uniemax.com/og-image.jpg (absolute)
```

External tools: Meta **Sharing Debugger** (developers.facebook.com/tools/debug)
shows exactly what WhatsApp/Facebook read and can force a re-scrape; Google
**Rich Results Test** validates the JSON-LD. WhatsApp caches a preview per
URL — a link shared before a fix keeps its old card; any query string
(`?v=2`) gets a fresh one.

Automated tests: `backend/test/page-shell.test.mjs` (read-only; part of
`npm run test:api`, see [`backend/README.md`](../backend/README.md)).

---

## 10. Known gaps and caveats

- **WhatsApp caches previews per URL** on each phone. A link shared before
  share images went live keeps its image-less card there; any query string
  (`?v=2`) gets a fresh one.
- **Product photos are previewed in their own shape.** A square product photo
  still gets WhatsApp's compact card; it is kept as is on purpose — the photo
  itself, large, is what sells, and padding it onto a wide canvas would shrink
  it. Store pages use wide store cards ([§4.7](#47-store-cards-wide-link-previews)).
- **Static fallback.** Any page served as the static `index.html` (backend
  down) carries the relative `og:image` `/og-image.jpg`, which some scrapers
  cannot load.
- **Meta's Sharing Debugger warns "missing properties: fb:app_id"** on every
  page. Not an SEO or preview problem: the preview renders fully without it,
  and no search engine reads it. `fb:app_id` only links the domain to a
  Facebook App for Facebook's own sharing insights. To clear the warning:
  create a Facebook App and add `<meta property="fb:app_id" content="…">`
  to the `seo:start` region of `index.html` (and to `renderHead` in
  `pageHead.ts`, [§4.2](#42-two-writers-one-head)). Not done — nothing
  depends on it.
- **Logic exists twice** (browser + server, [§4.2](#42-two-writers-one-head)).
  There is no shared package between `frontend/` and `backend/`, so the twins
  are kept in step by hand.
- **`/c/` page shells** run the full `browseCategory` (including per-child
  counts) to build the head — the slowest page shell, still well under the
  1.5 s limit.
- **Legacy free-text shelves** whose products have no global category are
  invisible on `/c/` pages and the category sitemap until an admin converts
  them (conversion stays admin-only: it renames or merges a shop's shelves).
  The gap is **measured**: the admin Category mapping page shows the share of
  live products on category pages, the products missing (no category ·
  disabled category) and a "Convert first" list of the stores holding the
  most (`GET /admin/catalog/coverage`); sellers see such shelves flagged
  "not shown on UnieMax category pages". Dev, 4 Oct 2026: 35 of 38 live
  products reached, 3 missing on 3 shelves.
- ESLint crashes on this project (tooling issue, not SEO) — verify frontend
  changes with `tsc -b` + `vite build`.

---

## 11. Roadmap

Planned 30 Sep 2026, ordered by traffic gained for the work involved. When a
step lands: mark it done here, move its details into §3–§8, and add a
change-log line.

| # | Step | What it involves | Status |
| --- | --- | --- | --- |
| 1 | **Per-page tags in the first byte** | Page shells for `/store/**`, `/c/**`; real 404s | ✅ Done 1 Oct 2026 |
| 2 | **Free shopping listings** | Google Merchant Center + Meta catalog product feeds; new product fields `brand`, `gtin`/`mpn`, `condition`; `shippingDetails` + `hasMerchantReturnPolicy` in `Product` JSON-LD | Not started |
| 3 | **Image sizes** | Server-side normalization of every upload + share images for `og:image`; sized copies (320–1280 px) served with `srcset` through `MediaImg` ([§4.6](#46-sized-photos-srcset)) | ✅ Done 4 Oct 2026, dev + prod (`v1.22.0`) |
| 4 | **Reviews & ratings** | Reviews only from buyers with a delivered order; then `aggregateRating` in JSON-LD (stars in results) | Not started |
| 5 | **Better listings from sellers** | Listing quality score in the product editor; duplicate-description warning; optional seller SEO title/description/share image with a result preview; prompt to tag products on the global taxonomy; finish converting legacy shelves (progress measured on the admin Category mapping page) | Not started (per-photo alt text exists — "Describe this photo") |
| 6 | **More landing pages** | Brand pages (after step 2); city pages ("cricket bats in Kochi") only where stock exists, thin ones `noindex`; a crawlable `/search?q=` page (enables the `WebSite` `SearchAction`); "more from this store" / "other sellers" links | Not started |
| 7 | **Tools for sellers' own traffic** | WhatsApp share with prefilled text; QR poster; generated share images with price; per-seller traffic analytics (referrer/UTM); seller's own Pixel/GA4 IDs; seller Search Console verification tag (needs page shells — now possible) | Not started (basic Share button exists) |
| 8 | **Operations** | Submit sitemaps in Search Console + Bing; IndexNow ping on publish/price change (not Google's Indexing API — jobs/livestreams only); HTTP caching on public API responses ([`IMPROVEMENTS.md`](../IMPROVEMENTS.md) #17); `pg_trgm` search index (#15) | Not started (absolute `og:image` for `/` and `/sell`: done, page shells, `v1.23.0`) |

Things to never do: fake or incentivised reviews, keyword stuffing, letting
search/filter URLs get indexed, mass-produced pages with nothing on them.

---

## 12. Keeping this file and the code in sync

**SEO-related code** — touching any of these means updating this file:

| Area | Files |
| --- | --- |
| Browser head | `frontend/src/shared/seo.ts`, `frontend/src/shared/usePageTitle.ts`, every `useSeo` / `usePageTitle` / `usePrivatePageTitle` call |
| Template | `frontend/index.html` (the `seo:start`/`seo:end` region) |
| Structured data / snippets | `frontend/src/storefront/features/publicStore/structuredData.ts`, `…/productDescription.ts` |
| Server | everything in `backend/src/modules/seo/` and `backend/src/modules/media/` |
| Images | `backend/src/package/storage/images.ts` (upload rules, derived images incl. store cards, `PREVIEW_BY_BUCKET`), `storeUpload`/`imageDelivery` in `package/storage/index.ts`, `shareImageUrl` in `publicStore.service.ts`, `backend/src/scripts/optimizeMedia.ts`, `frontend/src/shared/media/MediaImg.tsx` + `imageSrcSet.ts`, every `<MediaImg sizes>`, `frontend/public/og-image.jpg` |
| Crawl control | `frontend/public/robots.txt`, sitemap visibility rules |
| Landing pages | `BrowseCategoryPage.tsx`, `backend/src/modules/discovery/browse.service.ts` (SEO shape only, `DISCOVERABLE_PRODUCT`), `getCoverage` in `adminCategoryMapping.service.ts` |
| Infra | the nginx page-shell snippets (record changes in `DEPLOYMENT.md` too) |
| Data that feeds tags | new product/store fields used in titles, descriptions, images or JSON-LD |

**Paired changes** — change one, change the other:

| If you change… | Also change… |
| --- | --- |
| A page component's `useSeo` call | Its resolver in `backend/src/modules/seo/pageShell.service.ts`, and the [§5](#5-per-page-head-rules) table |
| `structuredData.ts` (frontend) | `backend/src/modules/seo/structuredData.ts`, and [§7](#7-structured-data-rules) |
| `productDescription.ts` / `formatPrice` | `backend/src/modules/seo/productText.ts` |
| `applySeo` in `seo.ts` (which tags, fallbacks) | `renderHead` in `backend/src/modules/seo/pageHead.ts` |
| `SECTION_TITLES` (`storesApi.ts`) or `PAGE_SIZE` (`BrowseCategoryPage.tsx`) | The copies at the top of `pageShell.service.ts` |
| A storefront route under `/store/` or `/c/` | `storePage` / `browsePage` routing in `pageShell.service.ts` |
| Page-shell routes or responses | [`API.md`](./API.md) → Page shells |
| Sitemap contents | [`API.md`](./API.md) → Sitemaps |
| Which image a page previews with | Both the page's `useSeo` `image` and its resolver in `pageShell.service.ts` — always a `shareImageUrl`, never an original |
| Upload size caps in `images.ts` | Keep them ≥ the browser editor's (`MAX_EDGE` in `cropImage.ts`, `BANNER_FORMAT.width`) |
| How wide a stored image is drawn (grid columns, thumbnail size) | That `<MediaImg>`'s `sizes` — a stale one makes the browser download the wrong copy |
| `IMAGE_WIDTHS` in `images.ts` | Nothing else — the frontend reads them from `/public/media-config`; run `optimize-media -- --apply` to pre-render the new width |
| How a derived image looks (`renderCardImage`, `renderShareImage`, …) | Stored copies are immutable and never re-rendered, so a visible change needs a new preset name in `DERIVATIVES` (e.g. `card2`, which also gives scrapers a new URL). For `renderCardImage`, also re-render `frontend/public/og-image.jpg` from `app_logo_with_name.png` |
| The `seo:start`/`seo:end` tags in `index.html` | Keep attribute order; re-run `backend/test/page-shell.test.mjs` |

---

## 13. Change log

| Date | Change |
| --- | --- |
| 25 Jul 2026 | Per-route `document.title` (`usePageTitle`) |
| 23 Sep 2026 | `seo.ts` writes the full head per route; JSON-LD (`Product`, `Store`, `BreadcrumbList`); `robots.txt`; XML sitemaps; global category pages `/c/{slug}` |
| 30 Sep 2026 | SEO roadmap agreed ([§11](#11-roadmap)) |
| 1 Oct 2026 | Page shells (`747a9b3`): per-page tags in the first byte for `/store/**` and `/c/**`, real 404s; nginx forwarding live on dev and prod |
| 3 Oct 2026 | Path params up to 500 chars (`b15e72f`) so long product slugs resolve; this file created as the SEO source of truth |
| 4 Oct 2026 | Share images for `og:image` (WhatsApp dropped large product photos); server-side normalization of every image upload; `npm run optimize-media` for existing images; media audit understands `derived/` objects. Released as `v1.21.0`; existing images updated on dev and prod |
| 4 Oct 2026 | Sized photos (`srcset`): copies at 320/640/960/1280 px for every stored image, one derived-image registry shared with share images, every upload via `storeUpload`, `<MediaImg>` on every stored image in the frontend; roadmap step 3 done. Released as `v1.22.0`; copies pre-rendered on dev and prod |
| 4 Oct 2026 | Page shells for `/` and `/sell` (absolute `og:image` + canonical, `WebSite` JSON-LD first byte); no title parts → the platform title, not "UnieMax", in both writers; platform card `og-image.jpg`; store cards (1200×630, logo's own edge colour) as store pages' `og:image`, preview kind chosen per bucket; product photos + logo in per-store sitemaps, `/sell` in the marketplace sitemap; admin category-page coverage report. Released as `v1.23.0`; nginx `/` + `/sell` applied and logo cards pre-rendered on dev and prod |
| 4 Oct 2026 | Dev host `dev.uniemax.zontechx.com` sends `X-Robots-Tag: noindex, nofollow`; the bare-IP copies of the site are gone (part of the Search Console "Possible phishing detected on user login" response) |

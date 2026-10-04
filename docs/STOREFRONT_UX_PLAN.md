# Public Storefront (`/store/{slug}`) — UX Plan

The storefront is where a customer decides to buy — usually from a link shared
on WhatsApp, opened on a phone. Today it only looks good when the seller has
customised a lot and listed many products. Most sellers will do neither, so the
page must look **good by default**, for a shop with **one** product as much as
for one with hundreds.

Status legend: ☐ planned · ◐ in progress · ☑ done

---

## 1. What is wrong today (seen on `/store/print-xerox`, 390 px phone)

Store facts: 4 products, 1 category ("Office & Business") with 1 sub-category
("Printing"), no banners, no about text, no contact details, brand colour blue.

| # | Problem | Where |
| - | ------- | ----- |
| 1 | **Product photos look small and broken.** Cards draw the photo `object-contain` with padding inside a grey square, inside a bordered card — a wide promo image becomes a thin strip in a grey box, with two frames around it. | `ProductCard.tsx:146` |
| 2 | **The same products appear three times.** Hero art (covers), the "Office & Business" collection row and "All Products" all show the same 2 cards — with only 4 products, the page repeats itself instead of showing all 4 once. | `StoreHomePage.tsx` `heroCovers`, `CategoryShelves`, `catalog` |
| 3 | **Category UI for a shop with one category.** A "Shop by Category" band with one chip, a hero button "Shop by Category" that scrolls to it, and a category page whose only content is one more chip ("Printing 4"). Customers tap twice to see the same 4 products. | `CategoryStrip`, `StoreCategoryPage.tsx` |
| 4 | **Hero is generic and text-heavy.** 44 px logo, "W E L C O M E  T O", "Browse our full range — 4 products across 1 category, delivered to your door", two buttons, then cropped photo squares that are not tappable. Nothing says *why buy here*. | `Hero` / `HeroArt` |
| 5 | **No trust or contact.** The store accepts Cash on Delivery and has free delivery above ₹1,000 — the home page never says so. No Call / WhatsApp the shop. The footer is mostly empty headings. | `Hero`, `StoreFooter.tsx` |
| 6 | **Card text is noisy.** 10 px uppercase category eyebrow ("PRINTING") on every card, seller's ALL-CAPS names, "4 Variants Available" (jargon). | `ProductCard.tsx:64`, `:234` |
| 7 | **Product page: Buy button scrolls away**; photo letterboxed the same way; an option name ("250ML-750ML") shows as a specification row. | `StoreProductPage.tsx` |
| 8 | **Listing controls are heavy on a phone** — a large "Newest" select and a Filter button above four products. | `ListingControls.tsx` |
| 9 | **Category art is never shown** although both the seller's shelf (`StoreCategory.imageUrl`) and the platform taxonomy (`Category.imageUrl`) have an image field — the public API does not send it, so tiles are letter monograms. | `publicStore.service.ts`, `PublicCategory` |

## 2. Principles

1. **Good by default.** Every rule works for a seller who changed nothing.
2. **Adapt to catalogue size** — 1 product, a few, or many get different pages.
3. **Never show a product twice** above the fold, and never show a section with nothing to choose (one category ⇒ no category picker).
4. **Photos first.** Fill the frame without cropping away what the seller made.
5. **Answer "can I trust this shop?" on the first screen** — delivery charge, COD, contact — using only facts the store really has (no invented ratings, see SEO.md).
6. **One thumb, one action.** The buy action is always reachable on a phone.
7. **The shop's own brand**, not UnieMax's: colours stay from `storeVars()`; glass only on sticky chrome (header, bottom bars), never on product cards — speed and photo clarity win on a storefront.
8. **SEO parity.** Any head/structured-data change is made in the browser *and* the server page shell together (`docs/SEO.md`).

## 3. Shop-size modes (the core idea)

Computed from what the store actually has — no setting needed (the Store
Builder can still override layouts per section).

| Mode | When | Home page |
| ---- | ---- | --------- |
| **Showcase** | 1 product | The home *is* the product: shop identity strip, then the product's gallery, price, options, Add to cart / Buy now, delivery & COD facts, shop contact. No category UI, no "All products". |
| **Small shop** | 2–12 products, or one category | Identity + trust strip, then **every product once** in one grid. Category chips only if ≥ 2 categories. No duplicate rows. |
| **Full shop** | more | Identity + trust, category tiles with pictures, curated rows (Featured / New / Best) and per-category shelves — but a product already shown in an earlier row is not repeated in "All products". |

Category trees also **collapse single-child chains**: "Office & Business ›
Printing" with nothing else becomes one level, "Printing".

## 4. Phases (ranked by impact on customers)

### Phase 1 — Product card & photos ☑ *(biggest visible win, every page)*
- Photo fills the card edge-to-edge (one frame, not two); **no-crop fill**: the image `contain`ed over a blurred, scaled copy of itself, so a wide banner or a tall photo both fill the square without losing text.
- Name in 2 lines at a readable size; category eyebrow removed from cards (kept on the product page); price large in the shop colour, MRP struck through with "% off" when real.
- "4 Variants Available" → "4 sizes" / "Choose size"; sold-out badge kept.
- Quick **Add** button on simple products (no options) — one tap to cart.
- ALL-CAPS names shown in Title Case (`displayName`), abbreviations kept.
- *Not done:* quick **Add** on cards (cards stay one link; the listing payload has no variant id).

### Phase 2 — Adaptive home (shop-size modes) ☑
- Showcase / Small / Full as in §3; dedupe rows; hide category UI below 2 categories; collapse single-child chains (shared helper used by home, category page, breadcrumbs, footer).
- `StoreHomePage.tsx` `shapeHome()` + `features/publicStore/shopShape.ts`; small shops fold the curated rows into All Products (picks first) instead of repeating them; the empty strip above the footer removed.

### Phase 3 — Mobile hero → identity & trust strip ☑
- Compact identity card: larger logo, shop name, the seller's about line when written (no "Welcome to", no catalogue arithmetic).
- **Trust chips from real settings**: "Cash on delivery", "Delivery ₹200 · free above ₹1,000", "Delivers all India" / pincode check, "Pickup available".
- One primary action ("Shop now" scrolling to products — or nothing in Showcase mode); banners, when the seller has them, sit above as today.
- Hero art becomes tappable mini product cards (or is dropped in Small mode, where the grid is right below).

### Phase 4 — Category navigation ◐ *("select by category")*
- ☑ Public API sends `imageUrl` (seller shelf image → taxonomy image); the storefront falls back to a cover of one of the category's products already on the page.
- ☑ Home: round picture row; category page hides a lone subcategory chip that holds everything.
- Home: round picture tiles in one swipeable row (≥ 2 categories); "See all" opens a full-screen category sheet.
- Category page: sub-category picture chips, collapsed chains, product count; sort & filter move into one bottom sheet button; sticky category tabs while scrolling a listing.

### Phase 5 — Product page on phones ◐
- ☑ Sticky bottom bar already existed (shows once the real buttons scroll away).
- ☑ Main photo uses the blur fill; name through `displayName`.
- Swipe gallery with dots, same no-crop fill, tap to zoom.
- Bigger option chips with price per choice; "Ask on WhatsApp about this" when the shop has a number.
- Specifications: never list an option name as a spec; hide the table when empty.

### Phase 6 — Contact, footer & trust ☐
- "Call shop" / "WhatsApp shop" block on home and product pages when a number exists.
- Footer collapses empty groups; shows delivery/payment summary and policies only when written.
- Seller side (`/mystores`): a "Make your shop page trusted" nudge — add WhatsApp number, about line, banner — in the setup checklist.

### Phase 7 — Header & search ☐
- Compact sticky header (logo + name, search icon that expands, cart with count badge, menu sheet); hides on scroll down, shows on scroll up.
- Search suggestions from the shop's own products.

### Phase 8 — Speed, SEO, Store Builder alignment ☐
- First product photo / banner as the LCP image (`fetchpriority`), skeletons shaped like the new cards, no layout shift.
- Server page shell & structured data kept in step (`pageShell.service.ts`, `structuredData.ts`).
- Store Builder sections and preview reflect the new compositions; defaults documented in `FRONTEND_CONTEXT.md`.

## 5. Verification (every phase)
- `npx tsc -b && npx vite build` (frontend), backend typecheck when the API changes.
- Phone screenshots at 360 / 390 px (CDP emulation) for **three fixture shops**: 1 product, 4 products / 1 category (print-xerox shape), 40 products / 6 categories — light and dark, plus 1280 px desktop.
- No horizontal scroll, tap targets ≥ 44 px, text ≥ 13 px on cards, LCP image loads eagerly.
- SEO: page shell output unchanged unless the phase intends it; `docs/SEO.md` change log updated when it does.

## 6. Decisions taken
1. ALL-CAPS names → Title Case for display only (implemented).
2. Seller phone on the storefront → still only the footer support number; a "Show my mobile to customers" switch is not built yet.
3. Showcase for 1-product shops → automatic (implemented).

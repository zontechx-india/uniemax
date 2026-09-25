# UnieMax — Flow, UI & UX Improvement Backlog

> Full-system review of the customer flow (public storefront), owner flow
> (store management), UI and UX — what's missing, what's inconsistent, and
> what to build next. Reviewed: 24 Jul 2026 · last pruned 25 Sep 2026
> (completed items are removed from this list).
>
> Priorities: 🔴 critical · 🟡 UX improvement · 🟢 trust/SEO/a11y ·
> 🔵 performance & scale

---

## 🟡 Storefront UX

- [ ] **3. Live search suggestions.** Products/categories dropdown while
  typing (the UX proposal lists it as optional); the header currently only
  submits on Enter.
- [ ] **6. Empty-homepage risk.** With nothing merchandised the homepage is
  hero + categories only. Correct behaviour, but the owner isn't told —
  see item 8.

---

## 🟡 Owner / management UX

- [ ] **8. Merchandising visibility in the Homepage editor.** The section
  list reorders rows but doesn't show *what's in them*; a per-row count
  ("Best Sellers — 0 products ⚠") would connect the Homepage and Products
  screens.
- [ ] **10. Confirm-per-checkbox fatigue.** Merchandising confirmations are
  right for safety, but flagging 20 products = 20 dialogs. Add a
  "don't ask again this session" option.
- [ ] **11. Category display order.** Owners can't reorder categories —
  nav and homepage cards follow creation order. Reuse the drag-and-drop
  pattern built for homepage sections (`StoreCategory` needs a
  `displayOrder`).

---

## 🟢 Trust, SEO & accessibility

- [ ] **13. Real meta/OG tags (SSR/prerender).** Per-route `document.title`
  shipped (25 Jul 2026, `shared/usePageTitle.ts`), but crawlers that don't
  run JS still see one static title and no OG tags — sharing previews and
  SEO need prerendering or SSR for the public storefront routes.
- [x] **14. Store trust surface is empty.** ~~Footer is only
  "Powered by UnieMax" — no about/contact/policies.~~ Resolved by Footer
  management (July 2026): owner-configured locations, contacts, social,
  policies, support and copyright now render in the storefront footer.

---

## 🔵 Performance & scale (fine today, will matter)

- [ ] **15. Search index.** Product search is `ILIKE contains` — add a
  `pg_trgm` index when catalogs grow.
- [ ] **16. Keyset pagination.** Offset pagination degrades deep into
  thousands of rows — move to cursor-based when needed.
- [ ] **17. HTTP caching.** The store shell/home endpoints were built to be
  cacheable — actually send `Cache-Control`/ETag (published-store responses
  only — never the owner draft preview).
- [ ] **19. Owner products list loads everything.** Fine at 17 products,
  not at 1,000 — paginate the owner-side list too.

---

## Recommended order (top 4)

1. **Checkout + orders (COD)** — completes the loop everything else feeds
2. **Product images (S3)** — once credentials are available
3. **Merchandising visibility + empty-homepage nudge** (6 · 8)
4. **Onboarding checklist** (7)

> Checkout is the only one needing real design discussion up front:
> guest OTP flow, per-store order splitting, shipping-rule evaluation.

# Phase 3: Supplier products in the seller's store ◐

> Built 20 Oct 2026 (migration `20261021100000_dropship_resales`). Left: the
> walkthrough of the screens on dev. The API suite
> (`test/dropship-supplier-products.test.mjs`) passes on dev with the flag on (21 Oct 2026).

## Goal

The seller browses their suppliers' products, sees "You earn ₹X", and adds one
or many to their store at their own price. Price, stock, options, delivery
area and COD stay in sync with the supplier. Orders are not routed yet.

## Read

- [supplier-products/context.md](../supplier-products/context.md): all of it
- [data-model/supplier-products/context.md](../data-model/supplier-products/context.md)
- [architecture/context.md](../architecture/context.md): events, host, config
- [glossary.md](../glossary.md)

## Before you start

Phase 2 done. Check the product editor (`frontend/src/storefront/pages/stores/products/`,
`StoreProductsPage.tsx`) and `storeCatalog.service.ts` for any change since 19 Oct 2026.

## Build: backend

- ☑ `dropship.prisma`, Phase 3 models (+ migration).
- ☑ Catalogue: the offered products of `ACTIVE` links, with "You earn" worked
  out from this store's own delivery charge.
- ☑ Add one or many (`host.createCopy` in one transaction per product):
  - photos copied, options copied, no SKU;
  - the supplier's effective delivery rule, and `codAvailable` from the link;
  - an existing or new shelf;
  - delivery settings in place for pickup-only stores.
- ☑ Pricing: follow with `lastCost` (idempotent), MRP cap, fixed-price switch,
  and price bounds through `product.saving`.
- ☑ `resale.sync`, driven by the catalog events and link or supplier changes.
  Pause and resume with `resumeOnClear`.
- ☑ Editor locks and the Duplicate refusal (`product.saving`).
- ☑ Refresh (latest photos, description, new options) and remove.
- ☑ The `order.placing` hook refuses supplier products with *"Coming soon"* (C-24).

## Build: frontend

- ☑ **Supplier products**: browse, filters, select many, and the empty-catalogue entry point.
- ☑ The add sheet: price or "Add on top [₹ | %]", the result line, the MRP
  note, the follow sentence and switch, the shelf picker or new shelf, and
  delivery in place.
- ☑ Product list: the "Supplied by" badge, and the paused banner with its one-tap fix.
- ☑ Editor: read-only *Set by supplier* fields, the Supplier block, Duplicate hidden.

## Tests

C-1…C-24, including:
- running follow-price twice changes nothing (C-21);
- the MRP cap (C-18);
- a switched-off copy stays off after a pause clears (C-15);
- SKUs never clash (C-16).

### Verified (20 Oct 2026)

- `npm run typecheck` and `npm run test:unit` (93 pass; `test/unit/dropship-sync.test.ts`
  covers `planSync` — C-1, C-2, C-5…C-7, C-15, C-18, C-21 run twice — and the
  default price, add on top, earnings and delivery labels).
- An `app.inject` run on the dev database with throwaway stores (deleted
  after): 26 checks — the catalogue and "You earn", C-1, 3, 4, 7, 8, 10, 11,
  14, 15, 16, 17, 18, 19, 20, 21, 24, the one-tap price fix, a supplier
  stock change by event, SU-5, SU-8, SU-11, SU-17 and "Sold by N sellers".
- Frontend: `tsc -b`, `vite build`, `check:ui` (no budget rises); the
  catalogue, add sheet (one, many, pickup-only store), product list (badge,
  paused note), empty list and the copy's Price and Delivery steps checked at
  390 px with mocked data (no overflow, no console errors).
- `npm run test:api` against dev (flag on, `DROPSHIP_ENABLED=true` in the dev server's `.env.development`): 61 of 64 pass; the 3 failures are `page-shell` (2) and `images` (1), none dropship. `test/dropship-supplier-products.test.mjs` passes in full (6 tests:
  add, C-10, C-1 / C-21, C-4 / C-17, SU-7, C-14).

## Done when

On dev, a seller adds supplier products. They show in the storefront with the
right price, stock and COD. A supplier's price, stock or option change reaches
them. Checkout refuses them with "Coming soon".

## Docs to update

- `FRONTEND_CONTEXT.md` for any shared editor change (core).
- Here: flip markers in [supplier-products](../supplier-products/context.md),
  [data-model](../data-model/context.md), [phases](context.md) and the README status.

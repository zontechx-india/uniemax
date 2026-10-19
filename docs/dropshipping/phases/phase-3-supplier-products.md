# Phase 3: Supplier products in the seller's store ☐

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

- ☐ `dropship.prisma`, Phase 3 models (+ migration).
- ☐ Catalogue: the offered products of `ACTIVE` links, with "You earn" worked
  out from this store's own delivery charge.
- ☐ Add one or many (`host.createCopy` in one transaction per product):
  - photos copied, options copied, no SKU;
  - the supplier's effective delivery rule, and `codAvailable` from the link;
  - an existing or new shelf;
  - delivery settings in place for pickup-only stores.
- ☐ Pricing: follow with `lastCost` (idempotent), MRP cap, fixed-price switch,
  and price bounds through `product.saving`.
- ☐ `resale.sync`, driven by the catalog events and link or supplier changes.
  Pause and resume with `resumeOnClear`.
- ☐ Editor locks and the Duplicate refusal (`product.saving`).
- ☐ Refresh (latest photos, description, new options) and remove.
- ☐ The `order.placing` hook refuses supplier products with *"Coming soon"* (C-24).

## Build: frontend

- ☐ **Supplier products**: browse, filters, select many, and the empty-catalogue entry point.
- ☐ The add sheet: price or "Add on top [₹ | %]", the result line, the MRP
  note, the follow sentence and switch, the shelf picker or new shelf, and
  delivery in place.
- ☐ Product list: the "Supplied by" badge, and the paused banner with its one-tap fix.
- ☐ Editor: read-only *Set by supplier* fields, the Supplier block, Duplicate hidden.

## Tests

C-1…C-24, including:
- running follow-price twice changes nothing (C-21);
- the MRP cap (C-18);
- a switched-off copy stays off after a pause clears (C-15);
- SKUs never clash (C-16).

## Done when

On dev, a seller adds supplier products. They show in the storefront with the
right price, stock and COD. A supplier's price, stock or option change reaches
them. Checkout refuses them with "Coming soon".

## Docs to update

- `FRONTEND_CONTEXT.md` for any shared editor change (core).
- Here: flip markers in [supplier-products](../supplier-products/context.md),
  [data-model](../data-model/context.md), [phases](context.md) and the README status.

# Phase 1: Core seams for packages ☐

## Goal

Generic seams that let a package take part in placement, cancellation,
checkout options and product edits, and ship parcels on an order's behalf.
**No visible change**: with no package registered, everything behaves exactly
as before.

## Read

- [architecture/context.md](../architecture/context.md): code facts, hooks,
  events, host, core changes
- [shipments/context.md](../shipments/context.md): rule 7 (parcels drive status)
- [data-model/context.md](../data-model/context.md): "Core additions → Phase 1"

## Before you start

Phase 0 done. Nothing open.

## Build: backend

- ☐ `package/events/hooks.ts`: the registry and `runHooks`, for
  `order.placing`, `order.unplacing`, `order.cancelling`, `checkout.options`
  and `product.saving`.
- ☐ Hook calls:
  - the placement transaction, after `order.create`;
  - the gateway-undo transaction, before `order.delete`;
  - `cancelOrder` and `cancelMyOrder`, inside their transactions;
  - the checkout quote and placement (`checkout.options`, merged with the
    existing COD rule and its reasons);
  - in `storeCatalog.service.ts`: `updateProduct`, `replaceProductOptions`,
    `updateVariant`, `copyProduct`.
- ☐ Catalog events, emitted after commit: `catalog.product.changed`,
  `catalog.variant.changed`, and `catalog.store.changed` (shipping settings,
  COD switch, admin suspension).
- ☐ `OrderItem.fulfilledBy` (+ migration). Parcel-driven `SHIPPED` /
  `DELIVERED` for orders that have tagged items, keeping COD → `PAID` on
  `DELIVERED`. The seller's own ship and deliver actions cover untagged items only.
- ☐ Functions the host will call, as a system actor: create a parcel
  (`source: PACKAGE`, `senderName`), update tracking, mark delivered, mark came
  back, confirm order, cancel order.
- ☐ `NotificationKind.DROPSHIP` (+ migration).

## Build: frontend

- ☐ Seller order page: tagged items show *"Shipped by {sender}"* and no ship
  or deliver buttons. Only reachable once a package tags items.

## Tests

- All existing unit and API tests pass unchanged.
- A dummy hook in a unit test can:
  - veto placement, with stock rolled back;
  - veto a product save;
  - hide COD and pickup with a reason.
- Parcel rollup: tagged items only reach `SHIPPED` once every item is in a
  parcel; a COD order becomes `PAID` when every parcel is delivered.

## Done when

All existing tests pass, and every seam is covered by a test using a dummy
registration.

## Docs to update

- `BACKEND_CONTEXT.md` (hooks, events, data model), core.
- Here: markers in [architecture](../architecture/context.md),
  [shipments](../shipments/context.md) (rule 7),
  [data-model](../data-model/context.md), [phases](context.md) and the README status.

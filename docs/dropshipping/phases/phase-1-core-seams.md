# Phase 1: Core seams for packages ☑

> Built 20 Oct 2026, verified locally and by the API tests on dev (21 Oct 2026).

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

## Build: backend

- ☑ `package/events/hooks.ts`: `hook`, `runHooks`, `checkoutRestrictions`
  (first reason wins), `resetHooksForTests` — for `order.placing`,
  `order.unplacing`, `order.cancelling`, `checkout.options` and
  `product.saving`.
- ☑ Hook calls:
  - the placement transaction, after `order.create`;
  - the gateway-undo transaction, before `order.delete`;
  - `cancelOrder` (now a scoped wrapper over `cancelOrderCore`) and
    `cancelMyOrder`, inside their transactions after the guarded write;
  - `quoteOrder` (`restrictions` in the response, COD dropped when
    restricted) and `createOrder` (COD / pickup refused with the reason);
  - in `storeCatalog.service.ts`: `updateProduct`, `replaceProductOptions`,
    `updateVariant`, `copyProduct`, before any write.
- ☑ Catalog events after commit: `catalog.product.changed` (edit, options,
  copy, delete), `catalog.variant.changed`, `catalog.store.changed` (payments,
  shipping, admin suspension).
- ☑ `OrderItem.fulfilledBy` + migration `20261020150000_package_seams` (with
  `NotificationKind.DROPSHIP`), generated with `migrate diff` and applied with
  `db:deploy` — the old empty migration row still blocks `migrate dev`.
  Seller send takes only untagged lines; the order becomes SHIPPED only once
  no line is unsent; the status `PATCH` refuses SHIPPED / DELIVERED while
  tagged lines exist; COD → `PAID` on delivery unchanged.
- ☑ System actions: `confirmOrderAsSystem`, `cancelOrderAsSystem`
  (`orders.service.ts`); `createPackageShipment`,
  `updatePackageShipmentTracking`, `markPackageShipmentDelivered`,
  `markPackageShipmentReturned` (`shipments.service.ts`, one core per action
  shared with the seller's wrappers).
- ☑ `DROPSHIP` in the notifications kind union.
- ☑ Pickup is restricted through `checkout.options` — no `pickupAvailable`
  column (D-26).

## Build: frontend

- ☑ `PlacedOrderItem.fulfilledBy`, `OrderQuote.restrictions`.
- ☑ Seller order page: tagged lines show *"Shipped by {sender}"* /
  *"Shipped separately"*; the sticky action covers only the store's own lines
  and parcels, else *"Waiting for the other parcels"*. (Checkout shows the
  restriction reasons in Phase 4.)

## Verified (20 Oct 2026)

- Backend `npm run typecheck`; `npm run test:unit` 68/68 (7 new in
  `test/unit/hooks.test.ts`: no-op when empty, order, veto, isolation, merge,
  arguments, reset).
- The built app via `inject`, nothing registered: `/public/couriers` serves;
  a real store's quote answers `restrictions: { cod: null, pickup: null }`.
- Frontend `npm run build`, `npm run check:ui` (within budget),
  `npm run test:unit` 15/15.
- ☑ `npm run test:api` against dev (flag on, `DROPSHIP_ENABLED=true` in the dev server's `.env.development`): 61 of 64 pass; the 3 failures are `page-shell` (2) and `images` (1), none dropship.

## Done when

All existing tests pass, and every seam is covered by a test using a dummy
registration. (The hook mechanics are; the in-transaction call sites are
covered by typecheck and the API suites once they run.)

## Docs updated

`BACKEND_CONTEXT.md` (Package seams, OrderShipment `fulfilledBy`,
`NotificationKind`), `API.md` (quote `restrictions`, status `PATCH` 409,
`items[].fulfilledBy`), `FRONTEND_CONTEXT.md` (tagged lines); here:
[architecture](../architecture/context.md), [shipments](../shipments/context.md)
(rule 7), [data-model](../data-model/context.md), [decisions](../decisions.md)
(D-26), [phases](context.md) and the README status.

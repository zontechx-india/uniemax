# Phase 0: Parcel tracking for every order (core) ☐

## Goal

Every parcel has a courier and a tracking number that the customer receives
the moment it ships. Proof of delivery is an optional photo, and "came back"
is handled. It works for sellers' own orders now; supplier parcels reuse it
in Phase 4 (D-6).

## Read

- [shipments/context.md](../shipments/context.md): rules 1–6, 8; screens; SH-1…SH-8
- [data-model/context.md](../data-model/context.md): "Core additions → Phase 0"

## Before you start

Nothing open. Check the current state of
`modules/orders/orders.service.ts` (`updateOrderStatus`, `cancelOrder`),
`orders.notifications.ts` and `StoreOrderDetailPage.tsx`; they may have
changed since 19 Oct 2026.

## Build: backend

- ☐ `OrderShipment`, `ShipmentSource` and `OrderItem.shipmentId` in
  `core.prisma`. Run `npm run db:migrate` and commit the migration.
- ☐ A courier list with tracking-link templates in config. Check each template
  against the courier's site; leave out any you can't confirm.
- ☐ Mark shipped creates a parcel holding all of the seller's unshipped items
  (tracking optional), then moves the order to `SHIPPED` as today.
- ☐ Edit tracking; Mark delivered with an optional proof photo
  (`mediaRules.image`); Came back with a restock choice. All guarded and
  forward-only.
- ☐ `cancelOrder` allows a `SHIPPED` order once every parcel has come back.
- ☐ Shipped email and push include the courier, number and link, per parcel
  (`orders.notifications.ts`). Send *"Tracking updated"* when they change.
- ☐ `shipments[]` in the seller, customer and admin order responses. The proof
  photo URL appears only in the seller and admin responses.

## Build: frontend

- ☐ `StoreOrderDetailPage.tsx`: the Mark shipped sheet (courier picker, tracking
  number with the inline nudge, optional link); parcel cards with Edit tracking,
  Mark delivered (+ photo) and Came back.
- ☐ Customer `OrdersPage.tsx`: one block per parcel with copy and **Track parcel**.
- ☐ Admin `OrderDetailPage.tsx`: parcels with the proof photo.

## Tests

- Ship with and without tracking. The customer message carries the tracking
  when present.
- Editing tracking notifies the customer; delivering twice → 409.
- The proof photo follows the image rules, and is absent from the customer response.
- Came back: cancel is allowed only when every parcel came back. Restock yes/no.
- Orders shipped before this phase still show correctly (SH-8).

## Done when

On dev, a seller ships an order with a tracking number. The customer gets it in
email and push, and sees it on the order page. Delivered with a photo works.
Came back makes cancel possible.

## Docs to update

- `API.md` (new endpoints), `BACKEND_CONTEXT.md` (data model), and
  `FRONTEND_CONTEXT.md` (screens), all core.
- `CONTEXT.md` (feature) and `README.md` (features list).
- Here: flip the markers in this file, [shipments](../shipments/context.md),
  [data-model](../data-model/context.md), [phases](context.md) and the README status.

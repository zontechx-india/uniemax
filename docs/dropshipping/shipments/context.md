# Parcels and tracking (core)

> **Read when:** working on tracking numbers, proof of delivery, "came back",
> the Shipped notification, or how an order's `SHIPPED` / `DELIVERED` follow its
> parcels. **Update when:** any of those change. This is a **core** feature:
> once built, the endpoints go to `API.md`, the model to `BACKEND_CONTEXT.md`,
> and the screens to `FRONTEND_CONTEXT.md`. This file keeps the rules and
> links to those docs.

Status: ☐ planned. Phase 0 builds rules 1–6; Phase 1 builds rule 7.

## Why it is core

Orders have no tracking field today (`core.prisma`), and the Shipped message
says only *"{store} has shipped your order — it's on the way."*
(`orders.notifications.ts`). Tracking belongs to the order the customer sees,
so every seller gets it for their own parcels, and supplier parcels reuse it
(D-6). Model: [data-model](../data-model/context.md), Phase 0 section.

## Rules

1. **A parcel** (`OrderShipment`) has a courier, a tracking number, an optional
   tracking link, the order items inside it (`OrderItem.shipmentId`), and
   shipped / delivered / came-back times.
2. **Tracking number:** optional on the seller's own parcels (some sellers
   hand-deliver locally), with an inline nudge: *"Add the tracking number so
   your customer can follow the parcel."* **Required** on supplier parcels (D-4).
3. **Courier picker:** a short list of common Indian couriers in config, each
   with a tracking-link template, plus **Other** with an optional link field.
   Check every template against the courier's site when building; never guess one.
4. **Customer is told at once:** the moment a parcel ships, the customer gets
   the Shipped email and push with the courier, tracking number and link, one
   message per parcel. A corrected number sends *"Tracking updated"*.
   Supplier parcels say *"Shipped by {supplier}"* (D-2).
5. **Proof of delivery:** an optional photo or screenshot on **Mark
   delivered**, under the existing image rules (`mediaRules.image`; there is no
   PDF kind yet). It is shown only in signed-in seller, supplier and admin
   views, never in customer emails or public pages. Keys are random
   (`newObjectKey`), but there is no private bucket, so the URL must never be
   printed anywhere public.
6. **Came back:** a shipped parcel can be marked **Came back** (undelivered,
   returned to sender), with *"Put the stock back? Yes / No"*. When every
   shipped parcel of an order has come back, the order can be cancelled even
   though it shipped (today `cancelOrder` refuses `SHIPPED`). A prepaid order
   then becomes `REFUNDED`, like any paid cancellation (refunded by hand today).
7. **Parcels drive status** (Phase 1): for an order with items another party
   ships (`OrderItem.fulfilledBy` set), the order becomes `SHIPPED` when every
   item is in a shipped parcel and `DELIVERED` when every parcel is delivered.
   A COD order is still marked `PAID` on `DELIVERED`. The seller's buttons ship
   and deliver only the seller's own items. Orders with only the seller's items
   behave exactly as today, plus tracking.
8. Updates are forward-only and guarded (`where` on the expected state), like
   `updateOrderStatus`. The same request sent twice gets a 409.

## Screens

- **Seller order page** (`frontend/src/storefront/pages/stores/StoreOrderDetailPage.tsx`):
  a **Mark shipped** sheet (courier, tracking number, link); parcel cards with
  tracking, **Edit tracking**, **Mark delivered** with an optional proof photo,
  and **Came back**.
- **Customer order page** (`frontend/src/storefront/pages/OrdersPage.tsx`): one
  block per parcel with the courier, tracking number (with a copy button), a
  **Track parcel** link and status; "Shipped by {supplier}"; "Parcel 1 of 2".
- **Admin order page** (`frontend/src/admin/pages/OrderDetailPage.tsx`):
  parcels, including the proof photo.

## API (core)

Paths are decided in Phase 0 and written to `API.md`. What they cover:
- Seller: create a parcel (mark shipped), edit tracking, mark delivered
  (multipart, optional proof photo), came back.
- Seller, customer and admin order responses include `shipments[]`.
- Packages (Phase 1): `createShipment` / `updateShipmentTracking` /
  `markShipmentDelivered` / `markShipmentReturned` through the host
  ([architecture](../architecture/context.md)).

## Failure cases

| # | What goes wrong | Solution |
| --- | --- | --- |
| SH-1 | The seller ships their own parcel without tracking. | Allowed, with the nudge in rule 2. The customer's message says shipped without a number. Supplier parcels can't (F-5 in [orders](../orders/context.md)). |
| SH-2 | Wrong tracking number. | **Edit tracking** while the parcel isn't delivered. The customer gets *"Tracking updated"*. |
| SH-3 | Courier not in the list. | **Other**: the typed courier name, the number, and an optional link. |
| SH-4 | The proof photo shows the customer's name, address or signature. | Rule 5: only signed-in seller, supplier and admin views. |
| SH-5 | **Mark shipped** is tapped twice. | The guarded update only takes items without a parcel; the second request gets 409 and the page refreshes. |
| SH-6 | Marked delivered by mistake. | No undo for the seller; an admin can correct it. |
| SH-7 | The parcel came back. | Rule 6: cancel becomes possible once all parcels came back; stock is put back if chosen. |
| SH-8 | An existing order shipped before this feature. | Has no parcels; its page shows the status exactly as today. |

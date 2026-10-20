# Parcels and tracking (core)

> **Read when:** working on tracking numbers, proof of delivery, "came back",
> the Shipped notification, or how an order's `SHIPPED` / `DELIVERED` follow its
> parcels. **Update when:** any of those change. This is a **core** feature:
> the endpoints are in [`API.md`](../../API.md) (Customer Stores → **Parcels**),
> the model in [`BACKEND_CONTEXT.md`](../../BACKEND_CONTEXT.md) (Data Model →
> **OrderShipment**), and the screens in [`FRONTEND_CONTEXT.md`](../../FRONTEND_CONTEXT.md)
> (Orders → **Parcels**). This file keeps the rules and failure cases.

Status: ☑ all rules built — 1–6 and 8 in Phase 0, rule 7 in Phase 1 (20 Oct 2026).

## Why it is core

Orders had no tracking field (`core.prisma`), and the Shipped message said
only *"{store} has shipped your order — it's on the way."* Tracking belongs to
the order the customer sees, so every seller gets it for their own parcels,
and supplier parcels reuse it (D-6). Model:
[data-model](../data-model/context.md), core additions.

## Rules

1. ☑ **A parcel** (`OrderShipment`) has a courier, an optional tracking
   number, an optional tracking link, the order items inside it
   (`OrderItem.shipmentId`), and shipped / delivered / came-back times.
2. ☑ **Tracking number:** optional on the seller's own parcels (some sellers
   hand-deliver locally), nudged inline: *"Add it so your customer can follow
   the parcel."* Own delivery (`self`) keeps no number or link. **Required** on
   supplier parcels (D-4, Phase 4).
3. ☑ **Couriers and links** (D-24): a list in `modules/orders/couriers.ts`
   (served at `GET /api/v1/public/couriers`) — Delhivery, Blue Dart, DTDC,
   Ekart, XpressBees, Shadowfax, India Post, The Professional Couriers,
   Shiprocket, Own delivery, Other. **No per-number tracking links are
   generated**: none of the couriers' direct tracking URLs could be confirmed
   (JavaScript pages, OTP or captcha). A parcel links to its tracking only
   through a link the **seller pasted**; otherwise the customer copies the
   number and opens the courier's own website (`site`, checked 20 Oct 2026;
   Ekart has none, Ecom Express is left out — merged into Delhivery, expired
   certificate).
4. ☑ **Customer is told at once:** sending a parcel emails and pushes the
   courier, tracking number and the link (pasted link, else the courier's
   website), one message per parcel — it replaces the plain Shipped message.
   Correcting the courier, number or link sends *"Tracking updated"*.
   Seller-typed values are HTML-escaped. Supplier parcels will say
   *"Shipped by {supplier}"* (D-2).
5. ☑ **Proof of delivery:** an optional photo or screenshot on **Mark
   delivered**, shrunk to WebP in the browser and stored under the image rules
   at `pod/{storeId}/{orderId}/…` (`npm run audit-media` counts it as
   referenced). Shown only in the seller's and admins' views — never in the
   buyer's responses, customer emails or public pages. Keys are random, but
   there is no private bucket, so the URL is never printed anywhere public.
6. ☑ **Came back** (D-25): a parcel on its way can be marked **Came back**
   (undelivered, returned to sender). Its items stay with the order. The seller
   then **sends it again** (a new parcel with those items; stock untouched — the
   goods are still set aside for this order) or **cancels**: once every parcel
   came back, cancel is allowed although the order shipped, and its dialog
   asks *"Put the items that came back into stock?"* (nothing pre-selected —
   they may be damaged). Items that never shipped always go back. A prepaid
   order then becomes `REFUNDED`, like any paid cancellation (refunded by
   hand today).
7. ☑ **Parcels drive status** (Phase 1): for an order with lines another party
   ships (`OrderItem.fulfilledBy` set), the order becomes `SHIPPED` once no
   line is left unsent and `DELIVERED` once no parcel is on its way and every
   line went out; a COD order is still marked `PAID` on `DELIVERED`. The
   seller's send takes only untagged lines and the seller's status `PATCH` to
   SHIPPED / DELIVERED is refused (409) while tagged lines exist. Package
   parcels come from `createPackageShipment` (`source: PACKAGE`, tracking
   number required, D-4).
8. ☑ Every write is guarded on the state read before it (`updateMany` with the
   expected state) — a repeat or a second tab gets 409. Sending a parcel holds
   the order's row lock (a guarded write on its status), and cancel re-checks
   for a parcel on its way inside its own transaction, so "send again" and
   "cancel" from two tabs can't cross.

## Where it lives

- Backend: `modules/orders/shipments.service.ts` (send / tracking /
  delivered / came back), `shipments.shape.ts` (per-audience shaping),
  `couriers.ts`; status changes through `writeStatusChange` /
  `announceStatusChange` in `orders.service.ts`; messages
  `notifyParcelShipped` / `notifyTrackingUpdated` in `orders.notifications.ts`.
- Seller: `frontend/src/storefront/pages/stores/orders/` — `ShipDialog`
  (send, add tracking, send again, edit), `DeliveredDialog`, `ParcelCard` —
  wired in `StoreOrderDetailPage.tsx`.
- Customer: `frontend/src/storefront/features/stores/ParcelTracking.tsx` —
  the **Tracking** section of `OrderSuccessPage` (the `/order/{slug}/{id}`
  page notifications open) and `ParcelLine` on My Orders.
- Admin: the **Parcels** card on `admin/pages/OrderDetailPage.tsx`.
- Tests: `backend/test/unit/shipments.test.ts` (courier list, link and input
  rules, escaping); `backend/test/order-shipments.test.mjs` (API flow — needs a
  running server and the `QA_*` accounts; passes on dev, 21 Oct 2026).

## Failure cases

| # | What goes wrong | Solution |
| --- | --- | --- |
| SH-1 | The seller sends their own parcel without tracking. | Allowed, with the nudge in rule 2; the card says the customer can't follow it. Supplier parcels can't (F-5 in [orders](../orders/context.md)). |
| SH-2 | Wrong tracking number. | **Edit tracking** while the parcel is on its way; the customer gets *"Tracking updated"*. After delivered / came back → 409. |
| SH-3 | Courier not in the list. | **Other**: the typed courier name, the number and an optional link. |
| SH-4 | The proof photo shows the customer's name, address or signature. | Rule 5: only the seller's and admins' views. |
| SH-5 | **Mark as sent** is tapped twice. | The second request finds nothing left to send → 409; the page shows the error and the parcel. |
| SH-6 | Marked delivered by mistake. | No undo in Phase 0 (forward-only). Support corrects it by hand if it ever matters; an admin "reopen parcel" tool is Phase 7 if needed. |
| SH-7 | The parcel came back. | Rule 6: send it again, or cancel (asks about the returned items' stock). |
| SH-8 | An order sent before parcels existed. | No parcel; its card says no tracking was added and offers **Add tracking** (a parcel without a status change). Its Delivered keeps the old confirm. |
| SH-9 | A tracking link that runs script (`javascript:`) or is broken. | Only http(s) links are accepted (400), and every link is escaped in emails. |
| SH-10 | "Send again" in one tab while another tab cancels. | Rule 8: one waits for the other's row lock; the later one gets 409. |
| SH-11 | The proof photo uploaded, then the delivered write lost a race. | The stored photo is removed (best effort) and the error shown. |
| SH-12 | A courier changes its website. | Fix `site` in `couriers.ts` once — links are built when an order is read, so every parcel follows. |

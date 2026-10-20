# Phase 0: Parcel tracking for every order (core) ◐

> Built 20 Oct 2026 and verified locally (see "Verified"). Still open: the
> walkthrough on dev and a run of the API tests with the `QA_*` accounts —
> then flip this to ☑.

## Goal

Every parcel has a courier and a tracking number that the customer receives
the moment it ships. Proof of delivery is an optional photo, and "came back"
is handled. It works for sellers' own orders now; supplier parcels reuse it
in Phase 4 (D-6).

## Read

- [shipments/context.md](../shipments/context.md): rules 1–6, 8; where it lives; SH-1…SH-12
- [data-model/context.md](../data-model/context.md): "Core additions → Phase 0"

## Build: backend

- ☑ `OrderShipment`, `ShipmentSource` and `OrderItem.shipmentId` in
  `core.prisma`; migration `20261020120000_order_shipments`. (`migrate dev`
  wanted to reset dev over an old, empty migration row
  `20260911083137_product_groups_list_all_members`, so the SQL was generated
  with `migrate diff` and applied with `db:deploy` — no reset.)
- ☑ Courier list in `modules/orders/couriers.ts` + `GET /public/couriers` —
  **websites, not per-number templates** (D-24: none could be confirmed).
- ☑ Send: a parcel with everything not already on its way (also "add
  tracking" on an older order and "send again" after a parcel came back);
  moves the order to `SHIPPED` when it isn't yet.
- ☑ Edit tracking; Mark delivered with an optional proof photo; Came back —
  guarded and forward-only. (The restock question moved to cancel — D-25.)
- ☑ `cancelOrder` allows a `SHIPPED` order once every parcel came back and
  asks `restockReturned` for the returned items.
- ☑ Shipped email and push carry the courier, number and link per parcel
  (`notifyParcelShipped`); *"Tracking updated"* on a change; HTML-escaped.
- ☑ `shipments[]` in seller, buyer, public-link and admin order responses,
  shaped per audience; the proof photo only for the seller and admins.
- ☑ `audit-media` counts `OrderShipment.podKey` as referenced.

## Build: frontend

- ☑ Seller `StoreOrderDetailPage.tsx` + `pages/stores/orders/`: `ShipDialog`,
  `DeliveredDialog` (photo shrunk to WebP in the browser), `ParcelCard`;
  **Send again**; **Parcel came back** in the ⋯ menu; the cancel stock
  question (`ConfirmDialog` gained `confirmDisabled`); timeline notes.
- ☑ Customer: **Tracking** section on `OrderSuccessPage` (the page
  notifications open) and a `ParcelLine` on My Orders (`OrdersPage`).
- ☑ Admin `OrderDetailPage.tsx`: **Parcels** card with the proof photo.

## Verified (20 Oct 2026)

- Backend `npm run typecheck`; `npm run test:unit` 61/61 (8 new in
  `test/unit/shipments.test.ts`); the built app via `inject`: the courier
  list serves, all four parcel routes exist on both mounts and refuse
  anonymous calls.
- Frontend `npm run build`, `npm run check:ui` (within budget),
  `npm run test:unit` 15/15.
- Phone-width (390 px) screenshots of every state through a temporary
  preview: sent, ship sheet, delivered sheet, delivered with photo, came back
  + send again, cancel with the stock question, older order without
  tracking, and the customer blocks.
- ☐ `npm run test:api` — `test/order-shipments.test.mjs` is written but not
  yet run: it needs a running server and the `QA_*` test accounts.
- ☐ Walkthrough on dev after deploy.

## Done when

On dev, a seller ships an order with a tracking number. The customer gets it in
email and push, and sees it on the order page. Delivered with a photo works.
Came back makes send-again and cancel possible.

## Docs updated

`API.md` (Parcels, `/public/couriers`, `shipments[]`), `BACKEND_CONTEXT.md`
(OrderShipment, status helpers, cancel rules), `FRONTEND_CONTEXT.md` (Parcels
UI), `CONTEXT.md` and `README.md` (features), `backend/README.md`
(`audit-media`); here: [shipments](../shipments/context.md),
[data-model](../data-model/context.md), [decisions](../decisions.md) (D-24,
D-25), [architecture](../architecture/context.md), [phases](context.md) and
the README status.

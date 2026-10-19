# Phase 4: Orders and shipping ☐

## Goal

Orders for supplier products reach the supplier. The supplier ships with a
tracking number that the customer gets at once. Every order finishes or fails
cleanly, prepaid and COD.

## Read

- [orders/context.md](../orders/context.md): all of it
- [shipments/context.md](../shipments/context.md): rules 2, 4, 6, 7
- [data-model/orders/context.md](../data-model/orders/context.md), plus the core additions in [data-model](../data-model/context.md)
- [architecture/context.md](../architecture/context.md): hooks, host, the hourly job
- [admin/context.md](../admin/context.md): Needs action
- [terms/context.md](../terms/context.md): the snapshot rule, T-1…T-8
- [money/context.md](../money/context.md): "Amounts" only (stored now, shown in Phase 5)

## Before you start

Phase 3 done. Check the checkout quote and placement code in
`orders.service.ts` for any change since 19 Oct 2026.

## Build: backend

- ☐ `dropship.prisma`, Phase 4 models (+ migration).
- ☐ `order.placing`:
  - re-check each line, reserve the supplier's stock, and tag the items;
  - create the supplier orders with their amounts and the full **terms
    snapshot**, read inside the transaction. `settleVia` is always `DIRECT`
    until Phase 6;
  - set `NEW` for COD or already-paid orders, otherwise `AWAITING_PAYMENT`;
  - remove the Phase 3 "Coming soon" refusal.
- ☐ `order.unplacing` and `order.cancelling` (release stock, close supplier
  orders, tell the supplier).
- ☐ `checkout.options`: no pickup; COD only as one parcel (D-13).
- ☐ `order.paid` → `NEW`, or re-reserve from `EXPIRED`. Expiry runs in the
  hourly job (the job skeleton is built now; more steps come in Phase 5).
- ☐ Supplier actions: confirm, ship (`host.createShipment`; tracking
  required), edit tracking, can't ship, delivered (+ optional photo), came back.
  All guarded, each writing a `SupplierOrderEvent`.
- ☐ Rollup: confirm; auto-cancel on can't ship or came back for orders with
  no items of the seller's own; ask the seller on mixed orders.
- ☐ Slips (one or many) with the COD amount.
- ☐ Seller: the parts on an order, the Shipments list, mark delivered, report
  a problem (`host.openTicket`, statement line `HELD`).
- ☐ Admin **Needs action**, including **Refunds to make**.
- ☐ Notifications (kind `DROPSHIP`) as listed in the orders file.

## Build: frontend

- ☐ Supplier **Orders to ship**: tabs, the COD chip, Ship sheet, Can't ship,
  Delivered (+ photo), Came back, Edit tracking, Print slips.
- ☐ Seller order page: supplier blocks, earnings line, Report a problem; the
  mixed-order behaviour; the in-place "cancel whole order?" prompt.
- ☐ Seller **Shipments** page.
- ☐ Admin **Needs action**.

## Tests

K-1…K-12, F-1…F-16 and T-1…T-8, including:
- a fee or COD change after placement leaves the order's snapshot untouched;
- the two-buyer race for the last unit;
- the gateway-undo release;
- expiry, then a late payment, with and without stock left;
- COD single parcel;
- auto-cancel on can't ship and on came back;
- a customer cancelling a COD order.

## Done when

On dev, with the flag on, prepaid and COD orders flow end to end. The customer
gets tracking when the supplier ships. Failures land where the rules say:
auto-cancel, the seller's prompt, or admin's list.

## Docs to update

Here: flip markers in [orders](../orders/context.md),
[data-model](../data-model/context.md), [admin](../admin/context.md),
[phases](context.md) and the README status.

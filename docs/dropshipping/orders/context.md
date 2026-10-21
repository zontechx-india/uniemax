# Orders: checkout, supplier orders, shipping

> **Read when:** working on checkout rules for supplier products (stock, COD,
> pickup), supplier orders and their states, the supplier's inbox, slips,
> shipping, cancellations, problems, or the seller's view of all this.
> **Update when:** any of those change.

Status: ◐ built 21 Oct 2026 (Phase 4; API tests pass on dev, screen walkthrough pending); reminders and the statement flips: Phase 5 (21 Oct 2026). Code:
`backend/src/package/dropship/services/{supplierOrders,orderViews}.ts`, `hooks.ts`,
`events.ts`; `frontend/src/packages/dropship/pages/{supplier,seller,admin}/`
(`OrdersToShipPage`, `SlipsPage`, `SupplierParts`, `ShipmentsPage`, `NeedsActionPage`).
Tables: [data-model/orders](../data-model/orders/context.md).
Parcels: [shipments](../shipments/context.md).

## Checkout rules

1. **Pickup** is not offered when the cart has supplier products
   (`checkout.options`): *"Home delivery only — some items ship from a supplier."*
2. **Cash on delivery** is offered only when all of these hold:
   - the store accepts COD;
   - every supplier product's link allows it (`codAvailable`, the existing
     product rule; D-5);
   - the whole order ships as **one parcel**: all items from one supplier, or
     none from suppliers (D-13).

   Otherwise COD is hidden with the reason: *"Cash on delivery isn't available
   when items ship from different places."*
3. **`order.placing`** (inside the placement transaction):
   - re-check each supplier line: supplier and link `ACTIVE`, product and option
     offered, cost ≤ price (a refused line says *"…is no longer available — remove it
     from your cart"*), and COD still allowed for the link (T-3);
   - reserve the supplier's stock with a conditional decrement, refusing with
     the core's *"just sold out"* wording;
   - tag the items `fulfilledBy = "dropship"`;
   - create one supplier order per supplier with its lines and the **terms
     snapshot** ([terms](../terms/context.md)): `paymentMode`, `collectAmount`
     (COD: the order total), `costTotal`, `shippingFee`, `supplierShare`,
     `shipWithinDays`, `returnDays`, `returnFeePayer`, `platformFee` and
     `settleVia`. Read the link and supplier rows inside the transaction (T-8).
     Nothing later reads the current settings.

   The core has already taken the ordering copy's own stock in the same transaction
   (D-36); the hook takes the supplier's. `platformFee` is the rate in force ×
   this supplier's lines (D-20). Status at creation:
   - **COD**, or an order already `PAID` at placement (dev simulation) →
     `NEW`, with `shipBy = now + shipWithinDays`;
   - online and unpaid → `AWAITING_PAYMENT`.
4. **`order.unplacing`** (gateway refused): release the stock and delete the
   supplier orders in the same transaction.
5. **`order.paid`**:
   - `AWAITING_PAYMENT` → `NEW`, with `shipBy` set and the supplier notified;
   - `EXPIRED` → reserve again → `NEW`, or `REJECTED` if the stock is gone.
6. **Unpaid online orders** past `unpaidHoldHours` → `EXPIRED`, and the stock
   is released (hourly job). The core never cancels unpaid orders itself.

## Supplier order states

```
online unpaid ─▶ AWAITING_PAYMENT ──paid──▶ NEW
                   └──unpaid > hold──▶ EXPIRED ──paid later: re-reserved──▶ NEW
                                                └──paid later: stock gone──▶ REJECTED
COD / already paid ─────────────────────────────▶ NEW
NEW ──confirm (optional)──▶ ACCEPTED
NEW / ACCEPTED ──ship (tracking required)──▶ SHIPPED ──▶ DELIVERED (optional proof photo)
                                                └──▶ RETURNED ("came back")
NEW / ACCEPTED ──can't ship (reason)──▶ REJECTED
AWAITING_PAYMENT / EXPIRED / NEW / ACCEPTED ──order cancelled──▶ CANCELLED
```

- Defined once in `domain.ts` as a table: `from → allowed to[] + who`. Every
  write is `update … where { id, status: expectedFrom }`. If zero rows change,
  return 409 *"This order was just updated — refresh"*. Each change writes a
  `SupplierOrderEvent`.
- Stock is released on `EXPIRED`, `REJECTED` and `CANCELLED`. On `RETURNED`
  the supplier chooses whether to put it back.
- **Ship** creates the core parcel (`host.createShipment`: courier, tracking
  number, link, `senderName` = the supplier), so the customer is told at once
  (D-4). **Delivered** and **Came back** update that parcel.

| Who | Can |
| --- | --- |
| System | paid, expire, cancel |
| Supplier | confirm, ship, edit tracking, can't ship, delivered, came back |
| Seller | delivered (the customer confirmed), report a problem |
| Admin | any transition, with a note |

Status words for each side: [glossary](../glossary.md).

## Rolling up to the customer order

The customer order never runs ahead of its slowest parcel.
- **Confirmed:** an order with no items of the seller's own becomes `CONFIRMED`
  once every supplier order is confirmed or shipped (`host.confirmOrder`).
  Mixed orders: the seller confirms as today.
- **Shipped / Delivered:** come from the parcels (core rule 7 in
  [shipments](../shipments/context.md)). The seller's buttons ship only the
  seller's own items. An order made only of supplier products shows no
  ship or deliver buttons to the seller.
- **Statement (Phase 5):** *Delivered* and *Came back* make the order's line count on the account
  (`statementState` `OWED`); a reported problem holds it (`HELD`) and resolving returns it to counted.
  Reminders go out once each from the hourly job: **F-1** to the supplier, **F-2** to the seller (it is
  late), **F-10** to the supplier.
- **Can't ship:**
  - no items of the seller's own → the order is cancelled automatically
    (`host.cancelOrder`). The customer is told; a paid order goes on admin's
    **Refunds to make**; the seller is told *"Order #… was cancelled because
    the supplier couldn't ship it ({reason})."*
  - mixed → the seller is asked in place: *"The supplier can't ship Saree
    (Red). Cancel the whole order and refund the customer?"* **Cancel order** /
    **Not now**. Partial cancel is Phase 7.
- **Came back:** when every parcel has come back, an order with no items of the
  seller's own is cancelled automatically (COD: nothing to refund; prepaid:
  **Refunds to make**). A mixed order asks the seller.
- **Cancel:** refused once any parcel has shipped, unless every shipped parcel
  came back (core). A supplier's parcel on its way also refuses it from our hook (F-4). `order.cancelling` releases the stock and closes the
  supplier orders in the same transaction, and tells the supplier *"Cancelled —
  don't ship"*.

## Screens

**Supplier: Orders to ship** (tabs New · Shipped · Done, sorted by "Ship by"):
- Each card: the "Ship by" date; **Collect ₹748 cash** (COD), or **Prepaid —
  don't collect cash**; items (photo, name, option, the supplier's SKU);
  delivery name, phone and address; the seller's store name and phone.
- Actions: **Confirm** (optional one tap) · **Ship** sheet (courier from the
  list or *Other*, tracking number, optional link) · **Can't ship** with reason
  chips (*Out of stock · Damaged · Can't deliver to this pincode · Other*) ·
  on shipped orders, **Delivered** (optional proof photo), **Came back** (*Put
  the stock back?*) and **Edit tracking**.
- **Print slips** for one order or all new orders. Each slip: *Sold by {store}*
  (with its logo), *Shipped by {supplier}*, order number, items with the
  supplier's SKU, delivery name, address and phone, **COD ₹X** or **Prepaid**,
  and the supplier's return address. No item prices.

**Seller:**
- The order list shows a **Supplier ships** chip.
- The order page shows one block per supplier order: status, parcel tracking,
  the supplier's name and phone, **Report a problem**, and *"You earn ₹238 on
  this order"*.
- **Shipments** page: every supplier parcel, with order number, supplier,
  courier, tracking number (copy button), shipped date, status and **Track**.
  Filters: in transit · delivered · came back · late.

**Notifications** (kind `DROPSHIP`; everything else is the existing order mail):
- Supplier: new order to ship, cancelled, ship-by reminder, COD setting changed.
- Seller: only when something needs them: can't ship, late, came back, product
  paused or resumed, problem resolved.
- Customer: the core parcel messages, with tracking.

## API: `/api/v1/dropship` ☑ (as built)

**Supplier** (`requireSupplier`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/stores/:storeId/supplier-orders?tab=new\|shipped\|done` | Inbox: `{ items, counts: { new, shipped } }`, sorted by Ship by. `done` lists finished orders the supplier had seen |
| GET | `/stores/:storeId/supplier-orders/:id` | Detail (no customer email, no item prices) |
| POST | `/stores/:storeId/supplier-orders/:id/confirm` | |
| POST | `/stores/:storeId/supplier-orders/:id/ship` | `{ carrierCode, carrierName?, trackingNumber, trackingUrl? }` — the core's courier list and link rules; "Own delivery" is refused (D-39) |
| PATCH | `/stores/:storeId/supplier-orders/:id/tracking` | Same body as ship; only while shipped. The customer gets *Tracking updated* |
| POST | `/stores/:storeId/supplier-orders/:id/cant-ship` | `{ reason: OUT_OF_STOCK \| DAMAGED \| PINCODE \| OTHER, note? }` |
| POST | `/stores/:storeId/supplier-orders/:id/delivered` | multipart, optional `pod` photo |
| POST | `/stores/:storeId/supplier-orders/:id/came-back` | `{ restock: boolean }` |
| GET | `/stores/:storeId/supplier-orders/slips?ids=a,b` | Slip data (up to 200): sold by, shipped by + return address, items with SKU, delivery, COD amount; no prices |

**Seller** (`requireCustomer` + owns `:storeId`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/stores/:storeId/orders/:orderId/parts` | `{ orderStatus, hasOwnItems, parts[] }`: status, supplier name + phone, items, parcel, **You earn**, terms line, problem, `needsDecision` |
| POST | `/stores/:storeId/orders/:orderId/parts/:id/delivered` | Mark delivered (F-10) |
| POST | `/stores/:storeId/orders/:orderId/parts/:id/problem` | `{ note }` (F-9) |
| GET | `/stores/:storeId/shipments?state&supplierId&page` | Shipments page; `state` is `in_transit \| delivered \| came_back \| late`; also returns the supplier list for the filter |

Every supplier action answers with the updated order. A move on an order that
changed returns 409 *"This order was just updated — refresh."*, or *"This order
was cancelled."*.

**Admin** (`/api/v1/admin/dropship`): `GET /needs-action?kind&page` (kinds `late ·
cant_ship · came_back · problem · refund`) and `POST /needs-action/:supplierOrderId/resolve
{ note }`. Forcing a status is not built (D-37).

**Customer:** no dropship endpoint. Parcels come with the core order response.

## Failure cases

### Checkout

| # | What goes wrong | Solution |
| --- | --- | --- |
| K-1 | Two sellers sell the supplier's last unit at the same moment. | Conditional decrement on the supplier's variant inside each placement transaction. The loser gets *"just sold out"* before paying. |
| K-2 | The supplier sells the last unit in its own store at the same time. | Same counter, same atomic rule. |
| K-3 | COD isn't allowed for this supplier. | Hidden by the existing `codAvailable` rule, which names the products. |
| K-4 | COD with items shipping from different places. | Hidden, with the reason (rule 2). |
| K-5 | The shopper picks store pickup. | Not offered for supplier products (rule 1). |
| K-6 | Place Order is double-tapped or retried. | The existing `idempotencyKey`. The hook runs once, inside the one transaction. |
| K-7 | The supplier or link goes inactive, or the cost passes the price, between cart and placement. | `order.placing` re-checks and refuses that line (*"no longer available"*). |
| K-8 | The customer never pays. | `EXPIRED` after `unpaidHoldHours`; stock released. |
| K-9 | The customer pays after expiry (**Pay again**). | Reserve again → `NEW`; stock gone → `REJECTED` → can't-ship rollup. |
| K-10 | The gateway refuses to open a payment. | `order.unplacing` releases the stock and deletes the supplier orders in the core's undo transaction. |
| K-11 | Payment lands after the order was cancelled (late capture). | The existing refund-required alert. The supplier order stays `CANCELLED`. |
| K-12 | Dev build without gateway keys marks the order paid at placement. | Treated as paid: `NEW` straight away. |

### Fulfilment

| # | What goes wrong | Solution |
| --- | --- | --- |
| F-1 | The supplier hasn't opened a new order. | Reminder after `confirmReminderHours`, to the supplier only. |
| F-2 | Not shipped by `shipBy`. | Flagged late to the seller and on admin's list. The seller can cancel or wait. |
| F-3 | The supplier can't ship. | Reason required; stock released; statement line `VOID`; then the rollup above. |
| F-4 | Can't ship, but another parcel of the order has already shipped. | Cancel is refused. Goes on admin's **Needs action** for a manual partial refund. |
| F-5 | The supplier tries to ship without tracking. | Refused: courier and tracking number are required (D-4). |
| F-6 | Wrong tracking number. | **Edit tracking** while shipped. The customer gets *"Tracking updated"*. Audited. |
| F-7 | Marked shipped by mistake. | No un-ship for suppliers. An admin can move it back, with a note. |
| F-8 | The parcel came back (refused, wrong address). | **Came back** + restock choice; then the rollup above. Who pays the supplier's shipping fee follows the order's own `returnFeePayer` (D-17, T-2). |
| F-9 | The customer reports damage, a wrong item, or nothing arrived. | The seller taps **Report a problem**: a `PLATFORM` / `ORDERS` support ticket with the order attached, and the statement line goes `HELD` until it's resolved. |
| F-10 | Nobody marks it delivered. | Reminder to the supplier; the seller can mark it. It counts as owed after `owedFallbackDays`. The order status is not changed automatically. |
| F-11 | Two people update the same supplier order at once. | Guarded update; the loser gets 409. |
| F-12 | The supplier wants customer email, prices, or old addresses. | Supplier responses carry only delivery name, phone, address, items, cost and the COD amount. Phone and address are hidden `customerDataDays` after closing. |
| F-13 | A supplier ships many orders a day. | Bulk **Print slips**; inbox sorted by "Ship by". |
| F-14 | The COD amount is entered wrongly at the courier. | The card and slip show **Collect ₹X** prominently. The statement uses `collectAmount`, so any shortfall is settled between the seller and the supplier. |
| F-15 | The customer cancels a COD order before the supplier ships. | The core allows it before the order is confirmed. `order.cancelling` closes the supplier order, and the supplier is told *"Cancelled — don't ship"*. |
| F-16 | The supplier confirms or ships an order that was just cancelled. | The guarded update fails: *"This order was cancelled."* |

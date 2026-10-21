# Terms and snapshots

> **Read when:** adding or changing anything a seller or supplier agrees to
> (prices, fees, COD, returned-parcel fee, ship-within, returns, platform fee,
> how the supplier is paid), or any calculation that uses them.
> **Update when:** a term is added or its rules change.

Status: ◐ link terms, the change log and change notices built (Phase 2, 20 Oct
2026; `services/terms.ts`, `domain.ts#describeChange`). Snapshots built in Phase 4 (21 Oct 2026; `services/supplierOrders.ts` `place`, shown on the order screens as "Terms for this order").
`settleVia = SPLIT`: Phase 6.

## The rule (D-18)

**An order follows the terms in force when it was placed.** Placement copies
every term onto the supplier order and its lines, inside the placement
transaction. Every later step reads only that copy: shipping, slips, the
statement, refunds and splits. The current settings are never consulted. A
change to a term affects orders placed after it, never before.

## The terms

| Term | Set by | Lives on | Copied at placement onto |
| --- | --- | --- | --- |
| Price for sellers, per option | supplier | `SupplyVariant.cost` | `SupplierOrderLine.unitCost` |
| Shipping fee per order | supplier | `Supplier.shippingFee` | `SupplierOrder.shippingFee` |
| Ship within N days | supplier | `Supplier.shipWithinDays` | `SupplierOrder.shipWithinDays`; `shipBy` = when it became `NEW` + that |
| Returns accepted (days) | supplier | `Supplier.returnDays` | `SupplierOrder.returnDays` |
| Cash on delivery allowed | seller (D-5) | `SupplierLink.codAllowed` | `SupplierOrder.paymentMode` |
| Returned-parcel fee paid by | seller, agreed with the supplier (D-17) | `SupplierLink.returnFeePayer` | `SupplierOrder.returnFeePayer` |
| Platform fee | UnieMax (D-20) | config `platformFeePct` (rate: Q-5) | `SupplierOrder.platformFee` |
| How the supplier is paid | system: `SPLIT` when Easy Split is live and both the seller's and this supplier's payout accounts are active, else `DIRECT` | — | `SupplierOrder.settleVia` |
| Seller's selling price | seller | `StoreProductVariant.price` | `OrderItem.unitPrice` (core already) |

## Changing a term

- A change applies to orders placed after the save. Scheduled changes ("from
  tomorrow") are Phase 7.
- Every change is logged in `TermsChange` (who, what, from, to, when). Both
  sides see the log on the **Terms** panel of their link.
- The other side is told in plain words, with the effect. For example:
  *"From now on, Sri Textiles charges no shipping fee. Orders placed before
  20 Oct, 3:15 pm keep the ₹60 fee. You now earn ₹60 more per order."*
- A supplier that disagrees with a seller's change can pause or end supplying
  that seller (D-19).

## Where the snapshot is shown

- Supplier order detail, on both sides: *"Terms for this order: supplier price
  ₹450 × 1 · shipping fee ₹60 · cash on delivery · returned-parcel fee paid by
  the seller · paid directly"*.
- Statement lines and refunds use only the snapshot.

## Failure cases

| # | What goes wrong | Solution |
| --- | --- | --- |
| T-1 | The supplier charged a shipping fee yesterday and stops today. Yesterday's order is delivered today. | Yesterday's order keeps the ₹60 it was placed with (`SupplierOrder.shippingFee`). Today's orders get ₹0. |
| T-2 | The seller changes who pays the returned-parcel fee, then a parcel from an older order comes back. | The order's own `returnFeePayer` decides. |
| T-3 | The seller turns COD off while a customer is at checkout. | Placement re-reads the link inside the transaction and refuses COD: *"Cash on delivery is no longer available for {product}. Please pay online."* Nothing is placed. |
| T-4 | The seller turns COD off after a COD order was placed. | That order stays COD (`paymentMode`). The supplier collects what its slip says. |
| T-5 | The supplier changes its price for sellers between cart and placement. | Placement snapshots the price in force at that moment. The follow-price rule (C-1) and the placement check (cost ≤ price) still apply. |
| T-6 | The supplier changes its ship-within days. | Orders already placed keep their deadline. |
| T-7 | Several changes in one day. | Each order uses the terms in force at its own placement time. The log shows the order of the changes. |
| T-8 | A change is saved at the same moment an order is placed. | Placement reads one consistent set of terms inside its transaction. A change committed after that read applies to the next order. |
| T-9 | Easy Split goes live, or a supplier adds its bank account. | Orders placed before stay `DIRECT`; orders after become `SPLIT`. |
| T-10 | A `SPLIT` supplier's payout account fails after the order was placed. | The only allowed change to `settleVia` after placement: it falls back to `DIRECT`, logged, and both sides are told (PS-2 in [money](../money/context.md)). |
| T-11 | The two sides dispute what was agreed. | The `TermsChange` log and the order's snapshot are the record. Admins can see both. |
| T-12 | The platform fee rate changes. | Each order keeps the `platformFee` it was placed with. |

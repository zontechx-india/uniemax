# Words

> **Read when:** writing any screen, email, notification or error text.
> **Update when:** a new term or status appears in the UI.

Use the "People see" column in every screen, email and notification. The "In
code" column is for code only. Never show these words in the UI: *payable,
margin, RTO, dropship, resale, copy, link*.

| In code | People see | Meaning |
| --- | --- | --- |
| seller (`sellerStoreId`) | *(just "you")*; **Seller** on the supplier side | The store that sells to customers. |
| `Supplier` | **Supplier** | A store that ships orders for the sellers it is linked to. |
| `SupplierLink` | **Your supplier** (seller) / **Seller** (supplier) | One seller–supplier relationship, with its COD setting and statement. |
| `SupplierInvite` | **Invite** | A one-time link a seller sends to a supplier. |
| `SupplyProduct` | **Offered to sellers** | A supplier's own product made available to its sellers. |
| `Resale` (resale copy) | **Supplier product**, badge "Supplied by {supplier}" | The seller's own `StoreProduct` made from a supply product. |
| `Order` | **Order** | The existing customer order, unchanged. |
| `SupplierOrder` | **Order to ship** (supplier) / **Shipped by supplier** (seller) | One supplier's share of one customer order. |
| `OrderShipment` (core) | **Parcel** | One package with a courier and tracking number. |
| proof of delivery (`podKey`) | **Proof of delivery** | An optional photo of the courier's delivery proof. |
| `cost` | **Supplier price** (seller) / **Price for sellers** (supplier) | What the seller pays the supplier per unit. |
| a supplier account's own `price` | **Suggested price** (supplier) | What customers usually pay; sellers' copies start from it. Never "shop price" or "selling price" — a supplier account has no shop. |
| `isActive` on a supplier account's product | **Available** / **Paused** (supplier) | Whether sellers can sell it at all; never "Showing" / "Hidden" or "publish". |
| `supplierShare` | **Supplier gets** (seller) / **You get** (supplier) | `cost × qty + shipping fee` for one supplier order. |
| earnings | **You earn** | What the seller keeps on a sale. |
| `collectAmount` | **Collect ₹X cash** | What the supplier's courier collects on a COD parcel. |
| statement | **Account with {name}** | Running list of who owes whom, per supplier. |
| terms (`TermsChange` log) | **Terms**, "Changed on {date} · applies to orders placed from then" | What a seller and supplier agreed, and every change to it. |
| `returnFeePayer` | **Returned-parcel fee paid by** | Who pays the supplier's shipping fee when a parcel comes back. |
| `settleVia = DIRECT` | **Paid directly** | The seller and supplier pay each other; UnieMax records it. |
| `settleVia = SPLIT` | **Paid by UnieMax** | Easy Split pays the supplier's share. |
| `Settlement` | **Payment recorded** | A payment one side made to the other, recorded in UnieMax. |

## Supplier order status words

| Status | Supplier sees | Seller sees | Customer sees |
| --- | --- | --- | --- |
| `AWAITING_PAYMENT`, `EXPIRED` | *(hidden)* | Waiting for payment | as today |
| `NEW` | New | With supplier | Order placed |
| `ACCEPTED` | Confirmed | Supplier confirmed | Confirmed |
| `SHIPPED` | Shipped | Shipped | Shipped · {courier} {tracking number} · "Shipped by {supplier}" |
| `DELIVERED` | Delivered | Delivered | Delivered |
| `REJECTED` | Couldn't ship | Supplier couldn't ship | Cancelled |
| `CANCELLED` | Cancelled | Cancelled | Cancelled |
| `RETURNED` | Came back | Came back to supplier | Cancelled once all parcels came back |

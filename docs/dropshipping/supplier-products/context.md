# Supplier products in the seller's store

> **Read when:** working on the supplier catalogue, adding supplier products,
> pricing (follow / fixed, MRP), sync from the supplier, editor locks, or
> pause and resume. **Update when:** any of those change.

Status: ◐ built 20 Oct 2026 (Phase 3; API tests pass on dev, screen walkthrough pending). Code:
`backend/src/package/dropship/services/{catalog,resale}.ts`, `hooks.ts`, `events.ts`;
`frontend/src/packages/dropship/pages/seller/` (`SupplierProductsPage`, `AddSheet`,
`SuppliedNote`, `SuppliedSteps`). Tables:
[data-model/supplier-products](../data-model/supplier-products/context.md).

## Rules

1. The catalogue shows only the offered products of the seller's `ACTIVE`
   links, grouped by supplier.
2. **Adding** creates a real `StoreProduct` in the seller's store (D-9), live
   straight away:
   - photos copied (storage `get` + `put` to `products/{storeId}/supplied/…`;
     sized versions render on first view); live only once it has a photo;
   - options and option names copied;
   - **no SKU** copied (SKUs are unique per store);
   - delivery rule = the supplier's effective rule;
   - `codAvailable` = the link's `codAllowed`.
3. **Pricing** (D-12): follow by default. When the supplier's price changes,
   `price += cost − lastCost`, capped at MRP. The seller can switch to a fixed
   price. A price must always be at least the supplier price and at most MRP.
   A **%** markup (add on top, or the default `suggestedMarkupPct`) lands on
   a whole rupee, rounded up. The supplier's MRP is written to the copy only
   when it is above the copy's price (D-35).
4. **Sync is the only path** by which supplier changes reach copies (below).
5. **Locked on copies:** options, stock, COD and delivery area (shown as *Set
   by supplier*), and **Duplicate** is refused. Editable: name, description,
   photos, shelf, price and the homepage flags. In the product wizard the
   **Price & choices** and **Delivery & payment** steps are the package's on a
   copy (D-34); Duplicate lives in the core Price step, so it disappears.
6. Orders for supplier products are routed from Phase 4 (the Phase 3 *"Coming
   soon"* refusal is gone): [orders](../orders/context.md).

## Flows

**Entry points:** store management → **Suppliers** → the **Products to add** tab
(`/suppliers/products`), the **Add from suppliers** button on Products once the shop
has a supplier, and the empty product list: *"No products yet? Sell your suppliers' products. No stock needed,
they ship for you."*

**Browse card:** photo, name, supplier, **Supplier price ₹450**, **Suggested
price ₹699**, **You earn ₹189**, delivery area ("All India" / "Selected PIN codes (N)" / "All India
except N PIN codes", D-33), returns ("7-day returns" / "No returns"), "Ships within N days".
Filters: supplier, category (each shown once there are two or more). Search.
A product already in the store shows **In your shop — view** instead of the
add button and its tick box.

**Add sheet (one product):**
- The product's photo and name at the top.
- **Your selling price.** One field when every option has the same supplier
  price. When they differ: **Add on top of supplier price [₹ | %] [ 120 ]**,
  with the resulting price per option. *Set each price myself* expands
  per-option fields. Prefilled with the supplier's own shop price if it has one,
  otherwise supplier price + `suggestedMarkupPct`.
- **Result line, using the seller's own delivery charge:** *"If someone buys 1:
  customer pays ₹748 (₹699 + ₹49 delivery) → supplier gets ₹450 + ₹60 shipping
  → UnieMax fee ₹15 → **you earn ₹223**."* (Example figures; the fee comes from
  `platformFeePct`, D-20.) Amber below `minMarginWarnPct`, red below 0. It warns
  and never blocks.
- **MRP** is stated inline: *"Can't be more than ₹999 (MRP)."*
- Under the price, in plain words: *"If the supplier changes their price, yours
  changes by the same amount, so you keep earning ₹238."* Next to it, a switch:
  **Keep my price fixed instead**.
- **Shelf:** pre-picked when one of the store's shelves carries the same global
  category. Otherwise **+ New shelf: {category}** creates the shelf for the
  supplier product's own taxonomy category (D-32). A product with no category
  needs an existing shelf.
- **Pickup-only store:** the sheet shows the store's delivery settings in place
  (*"Supplier products need home delivery. Turn on delivery: ₹__ per order"*).
- **Add to my store** → live (with a photo), and a toast: *"Added to your shop
  — see it in Products"*.

**Add many:** tick cards → **Add N to my store** → one sheet with one shelf and
**Add on top [₹ | %]**, plus each product's price and earnings. The shelf
choice includes **Each on its own category shelf**.

**Looking after them:** a **Supplied by {supplier}** badge in the product list.
A paused copy shows the reason, and for `COST_ABOVE_PRICE` a one-tap fix:
*"Supplier ₹520 · yours ₹499. At ₹569 you keep earning ₹49. [Set price to
₹569]"*. The fix price is `cost + max(0, price − lastCost)`, capped at MRP.
`LINK_INACTIVE` links to **Suppliers**. Once the store has a supplier, the
empty product list carries the entry point. In the editor, **Your price** shows
each option's price, supplier price, MRP and "You earn", the follow switch,
**New option available** (price + **Add it**), **Get supplier's latest photos
and description** and **Remove from my store**; **Delivery & payment** shows
the delivery area and COD read-only, *Set by {supplier}*.

## Sync rules (`resale.sync`)

Triggered by the catalog events, by `order.placed` / `order.cancelled` of a
supplier store (stock), by link and supplier status changes, by supply edits,
and by the hourly job (`jobIntervalMs`). For each copy linked to the changed store, product, variant or link:

1. **Options and option names** := the supplier's (renames follow).
2. **Stock** := the supplier variant's stock. **MRP** := the supplier's.
3. **Price**, when `followCost` is on and `cost ≠ lastCost`:
   `price += cost − lastCost`, capped at MRP; then `lastCost := cost`.
   `lastCost` moves only here and when the seller saves a price (or takes the
   one-tap fix), so the fix can offer the old margin.
4. **Delivery area** := the supplier's effective rule (its product override,
   otherwise its store default). **`codAvailable`** := the link's `codAllowed`.
5. **supplyOk** := supplier `ACTIVE` ∧ supplier store not suspended ∧ link
   `ACTIVE` ∧ product offered ∧ variant offered ∧ variant active ∧ cost ≤ price ∧
   (price ≤ MRP when MRP is set).
6. **Live or paused:**
   - not supplyOk and the copy is live → switch it off, `PAUSED`, `resumeOnClear = true`;
   - supplyOk and `PAUSED` → `ACTIVE`, and switch it back on **only if**
     `resumeOnClear`. Sync never switches on a copy that the seller or an admin
     switched off.
7. Notify the seller only when the state or the price changes.

## API: `/api/v1/dropship` ◐ (seller: `requireCustomer` + owns `:storeId`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/stores/:storeId/catalog?supplierId&q&categoryId&minPrice&maxPrice&page&pageSize` | Browse (`pageSize` ≤ 60, default 24): `{ items, meta, filters: { suppliers, categories }, store: { mode, deliveryRate, shelves, platformFeePct, minMarginWarnPct } }`. Each item has its variants (cost, shop price, MRP, suggested, stock), "You earn" for this store, and `inStoreProductId` |
| POST | `/stores/:storeId/resales` | Add 1–50 → 201 `[{ supplyProductId, productId, added, isActive }]`. Body: `{ items: [{ supplyProductId, prices?: [{ supplyVariantId, price }] }], shelf: { shelfId } \| { newShelf: true }, addOnTop?: { amount } \| { percent }, followCost, deliveryAmount? }` (`deliveryAmount` required for a pickup-only store). 409 C-10, 400 C-11 |
| GET | `/stores/:storeId/resales?productId` | Supplier products: state, pause reason and text, supplier, each option's price / cost / MRP / You earn / one-tap `fixPrice`, and `newOptions`. `productId` narrows to one copy (the editor) |
| PATCH | `/stores/:storeId/resales/:id` | `{ followCost }`; turning it on takes today's cost as `lastCost` |
| POST | `/stores/:storeId/resales/:id/refresh` | Latest photos and description (C-20) |
| POST | `/stores/:storeId/resales/:id/options` | `{ supplyVariantId, price }`: add a new supplier option (C-8) |
| POST | `/stores/:storeId/resales/:id/fix-price` | The one-tap fix: each option with a `fixPrice` takes it, then sync |
| DELETE | `/stores/:storeId/resales/:id` | Remove from the store (C-14) |

## Failure cases

| # | What goes wrong | Solution |
| --- | --- | --- |
| C-1 | The supplier raises its price. | **Follow on:** the price rises by the same amount, capped at MRP, and the seller is told *"…you still earn ₹E"*. **Follow off:** if cost > price the copy pauses (`COST_ABOVE_PRICE`) with a one-tap *"Set price to ₹X"*. The placement hook also refuses cost > price. |
| C-2 | The supplier lowers its price. | Follow on: the price drops and earnings stay the same. Follow off: the price stays and the seller earns more. The seller is notified once. |
| C-3 | The seller saves a price below the supplier price or above MRP. | `product.saving` refuses inline: *"Price must be between ₹450 (supplier price) and ₹999 (MRP)."* |
| C-4 | The seller edits options, stock, COD or delivery area on a copy. | Shown read-only (*Set by supplier*); the server refuses via `product.saving`. |
| C-5 | The supplier disables or deletes a product or option. | The copy, or that option, pauses (`SOURCE_REMOVED`). Open orders keep their snapshots. |
| C-6 | The supplier stops offering a product. | Copies pause (`SUPPLY_CLOSED`); the seller is notified. |
| C-7 | The supplier, its store, or the link becomes inactive. | Copies pause (`SUPPLIER_INACTIVE` / `LINK_INACTIVE`). |
| C-8 | The supplier adds a new option. | Not added automatically. *"New option available — add it"* with a price. |
| C-9 | The supplier deletes a photo the copy used. | Copies own their photos (copied at add time). |
| C-10 | The seller adds the same product twice. | `@@unique([sellerStoreId, supplyProductId])` → 409 *"Already in your store"*; the catalogue card shows **In your shop — view**. |
| C-11 | Products of a supplier the seller isn't linked to. | Not in the catalogue; `add` refuses them. |
| C-12 | The supplier narrows its delivery area. | The effective rule is mirrored; the storefront's pincode check applies. |
| C-13 | The stock mirror drifts (lost event, crash). | Checkout reserves the **supplier's** stock, so drift can't oversell; the hourly job re-mirrors. |
| C-14 | The seller removes a product that has open orders. | Removing only switches off and detaches the copy; open orders complete. |
| C-15 | The seller switched a copy off, then a supply pause clears. | It stays off (`resumeOnClear = false`). Switching on a paused copy is refused, with the reason and its one-tap fix. |
| C-16 | The supplier's SKU clashes with one in the seller's store. | Copies take no SKU. The supplier's SKU is snapshotted on supplier order lines for its slip. |
| C-17 | **Duplicate** on a copy. | Hidden; `copyProduct` refuses (it would make an unlinked product the seller can't stock). |
| C-18 | A follow-price rise would pass MRP. | The price stops at MRP and the seller is told earnings dropped to ₹E. If the cost itself passes MRP, the copy pauses. |
| C-19 | The supplier renames an option ("Red" → "Maroon"). | Mirrored; carts and new orders show the new name; past orders keep theirs. |
| C-20 | The supplier improves its description or photos. | Copies keep their own; **Get supplier's latest photos and description** is one tap. |
| C-21 | A follow-price change is applied twice (re-run, duplicate event). | Computed against `ResaleVariant.lastCost`, so the second run changes nothing. |
| C-22 | A pickup-only store adds a supplier product. | Delivery settings are asked for in place on the add sheet. |
| C-23 | The seller's earnings are negative after delivery charge and affiliate commission. | The result line shows red. Warns, never blocks. |
| C-24 | Someone buys a supplier product before Phase 4 exists. | **Retired in Phase 4**: the order is routed to the supplier. |

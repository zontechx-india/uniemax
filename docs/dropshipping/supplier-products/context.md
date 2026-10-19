# Supplier products in the seller's store

> **Read when:** working on the supplier catalogue, adding supplier products,
> pricing (follow / fixed, MRP), sync from the supplier, editor locks, or
> pause and resume. **Update when:** any of those change.

Status: ☐ planned (Phase 3). Tables:
[data-model/supplier-products](../data-model/supplier-products/context.md).

## Rules

1. The catalogue shows only the offered products of the seller's `ACTIVE`
   links, grouped by supplier.
2. **Adding** creates a real `StoreProduct` in the seller's store (D-9), live
   straight away:
   - photos copied (storage `get` + `put`; sized versions render on first view);
   - options and option names copied;
   - **no SKU** copied (SKUs are unique per store);
   - delivery rule = the supplier's effective rule;
   - `codAvailable` = the link's `codAllowed`.
3. **Pricing** (D-12): follow by default. When the supplier's price changes,
   `price += cost − lastCost`, capped at MRP. The seller can switch to a fixed
   price. A price must always be at least the supplier price and at most MRP.
4. **Sync is the only path** by which supplier changes reach copies (below).
5. **Locked on copies:** options, stock, COD and delivery area (shown as *Set
   by supplier*), and **Duplicate** is refused. Editable: name, description,
   photos, shelf, price and the homepage flags.
6. Until Phase 4 routes orders, the `order.placing` hook refuses supplier
   products with *"Coming soon"*.

## Flows

**Entry points:** **Supplier products** in store management, and the empty
catalogue: *"No products yet? Sell your suppliers' products. No stock needed,
they ship for you."*

**Browse card:** photo, name, supplier, **Supplier price ₹450**, **Suggested
price ₹699**, **You earn ₹189**, delivery area ("All India" / "Kerala, Tamil
Nadu"), returns ("7-day returns" / "No returns"), "Ships within N days".
Filters: supplier, category, price. Search.

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
  category. Otherwise **+ New shelf** opens inline with the supplier's category
  name typed in.
- **Pickup-only store:** the sheet shows the store's delivery settings in place
  (*"Supplier products need home delivery. Turn on delivery: ₹__ per order"*).
- **Add to my store** → live, and a toast offers **View**.

**Add many:** tick cards → **Add N to my store** → one sheet with one shelf and
**Add on top [₹ | %]**, plus each product's price and earnings.

**Looking after them:** a **Supplied by {supplier}** badge in the product list.
A paused copy shows the reason with a one-tap fix, for example *"The supplier's
price is now ₹520 and your price is ₹499. [Set price to ₹569 — you keep
earning ₹49]"*. In the editor, a **Supplier** block shows the supplier price,
MRP and "You earn", the follow switch, **Get supplier's latest photos and
description**, **New option available — add it**, and **Remove from my store**.

## Sync rules (`resale.sync`)

Triggered by the catalog events, after every reserve or release, and by the
hourly job. For each copy linked to the changed store, product, variant or link:

1. **Options and option names** := the supplier's (renames follow).
2. **Stock** := the supplier variant's stock. **MRP** := the supplier's.
3. **Price**, when `followCost` is on and `cost ≠ lastCost`:
   `price += cost − lastCost`, capped at MRP; then `lastCost := cost`.
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

## API: `/api/v1/dropship` ☐ (seller: `requireCustomer` + owns `:storeId`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/stores/:storeId/catalog?supplierId&q&category&minPrice&maxPrice&page` | Browse, with "You earn" worked out for this store |
| POST | `/stores/:storeId/resales` | Add one or many: `{ items: [{ supplyProductId, variants?: [{ supplyVariantId, price }] }], shelf: { categoryId } \| { newShelfName }, addOnTop?: { amount } \| { percent }, followCost, delivery? }` |
| GET | `/stores/:storeId/resales` | Supplier products with state and pause reason |
| PATCH | `/stores/:storeId/resales/:id` | `{ followCost }` |
| POST | `/stores/:storeId/resales/:id/refresh` | Latest photos and description, new options |
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
| C-10 | The seller adds the same product twice. | `@@unique([sellerStoreId, supplyProductId])` → *"Already in your store"* with **View**. |
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
| C-24 | Someone buys a supplier product before Phase 4 exists. | The placement hook refuses it with *"Coming soon"* (rule 6). |

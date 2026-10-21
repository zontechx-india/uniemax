# Suppliers: invite, join, settings, offering products

> **Read when:** working on inviting a supplier, a supplier joining, the
> seller–supplier link and its COD setting, supplier settings, or offering
> products to sellers. **Update when:** any of those change.

Status: ◐ built 20 Oct 2026 (Phase 2) — API tests pass on dev; screen walkthrough pending. Effects on copies built in Phase 3 (D-31). Tables:
[data-model/suppliers](../data-model/suppliers/context.md). Words: [glossary](../glossary.md).

## Rules

1. Only a seller can bring a supplier, by invite (D-3). There is no public
   supplier list in the MVP.
2. One invite is one one-time link, valid for `inviteExpiryDays`. The seller can
   resend it (a new link, D-27) or revoke it. Only a sha-256 hash of the token is stored.
3. Whoever opens the link and signs in (the existing OTP sign-in) becomes the
   supplier for that seller. The seller then sees the supplier's business name
   and phone, and can end the link (SU-2).
4. The supplier is a store (D-8): one it already owns, or a new **supply-only**
   store created when it joins (unpublished, no logo, storefront set-up steps
   hidden; marked by `Supplier.supplyOnly`, D-28).
5. The link carries two **terms** set by the seller: **`codAllowed`** (D-5) and
   **`returnFeePayer`**, who pays the supplier's shipping fee when a parcel comes
   back (D-17). Both are asked when inviting (no answer pre-selected), shown to
   the supplier before it accepts, and editable later. Every order keeps the
   terms it was placed with; a change applies to new orders only and is logged
   ([terms](../terms/context.md)).
6. No admin approval for invited suppliers (D-7). Admins can suspend a supplier.
7. A supplier offers its own products only (never a copy), with a **price for
   sellers** per option. In the MVP one price applies to all its sellers;
   per-seller prices are Phase 7.
8. Joining needs no bank account. Until Easy Split is live, money settles
   directly between the seller and the supplier (D-16). From Phase 6 the supplier
   is asked in place to add one, so UnieMax can pay it for prepaid orders.
   Without one, its orders settle directly (PS-1); nothing is blocked
   ([money](../money/context.md)).
9. Either side can pause or end the link (D-19).

## Flows

### The seller invites a supplier
Store management → **Suppliers** → **Invite a supplier**:
- The supplier's name, and a phone or an email (at least one).
- **"Can customers pay cash on delivery for this supplier's products?"** No
  answer pre-selected: *Yes — the supplier collects the cash through their
  courier* / *No — online payment only*. If Yes and the store doesn't accept
  COD yet, the store's COD switch appears right on the sheet (`host.setStoreCod`).
- **"If a parcel comes back undelivered, who pays the supplier's shipping
  fee?"** No answer pre-selected: *I pay it* / *The supplier bears it*.
- **Send invite** emails the link if an email was given, and always offers
  **Share on WhatsApp** and **Copy link**, using the share sheet the Store Share
  Kit already uses.

### The supplier joins
Open the link → sign in (OTP) → **Join {seller} as a supplier**:
- What it means, with the seller's terms: *"{Seller} sells your products in
  their store. You ship to their customers. Cash on delivery: Yes / No. If a
  parcel comes back, your shipping fee is paid by: {seller} / you."*
- Owns a store already: **Use {store name}** or **Create a supplier account**.
  Otherwise a short form: business name, phone, pickup address (the same
  address fields as the bank page).
- **Shipping fee per order** · **Ship within [ ] days** (up to
  `shipWithinDaysMax`) · **Do you accept returns?** *No* / *Yes, within N
  days*. Asked, never pre-selected.
- **Join** → the link is active. Next step offered: **Add the products you'll
  supply** (the store's product editor), or **Choose products to offer** for an
  existing store.

### The supplier offers products
**Products for sellers**: a switch per product, a **Price for sellers** per
option, and "Sold by N sellers". Bulk: tick products → **Offer at shop price −
[20] %**, which fills the prices (still editable). A price above the shop
price shows a warning but is allowed.

### Managing the link (both sides)
- Seller: **Suppliers** page with **Invited** (resend / revoke) and **Your
  suppliers**. Supplier: **Sellers** page.
- Each link opens a **Terms** panel showing COD, who pays the returned-parcel
  fee, the supplier's shipping fee, ship-within and returns. The seller edits
  its two terms there. The panel lists the change log, and each change says
  *"applies to orders placed from now on"*.
- Either side can **Pause** (copies pause with `LINK_INACTIVE`; no new orders)
  or **End** (the same, for good). Open orders still complete and the
  statement stays. The other side is told.

## API: `/api/v1/dropship` ◐

Built 20 Oct 2026 in `backend/src/package/dropship/routes/`; registered only
when `DROPSHIP_ENABLED=true`. `:storeId` is the store's id or slug.

| Method | Path | Guard | Purpose |
| --- | --- | --- | --- |
| GET | `/status` | — | `{ enabled: true }`; a 404 means the package is off (D-30) |
| GET | `/stores/:storeId/role` | owner | `{ supplier: { status, supplyOnly } \| null, hasSuppliers }` — drives the nav |

**Seller** (`requireCustomer` + owns `:storeId`; another store → 404, SU-10)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/stores/:storeId/suppliers` | `{ invites, suppliers }`: open invites (SENT / EXPIRED) and every link with the supplier's store card and profile |
| POST | `/stores/:storeId/supplier-invites` | `{ name, phone?, email?, codAllowed, returnFeePayer, turnOnStoreCod? }` (phone or email; both terms required, no default) → 201 `{ invite, inviteUrl, shareText, emailed }`. 409 "Already your supplier" (SU-14) |
| POST | `/stores/:storeId/supplier-invites/:id/resend` | A new link with a fresh expiry; the old link stops working (D-27) → same shape |
| POST | `/stores/:storeId/supplier-invites/:id/revoke` | SENT / EXPIRED → REVOKED |
| PATCH | `/stores/:storeId/suppliers/:linkId` | `{ codAllowed?, returnFeePayer?, status?, turnOnStoreCod? }`. Each term change is logged and the supplier notified. ENDED is final (409) |
| GET | `/stores/:storeId/suppliers/:linkId/terms` | `{ current, log }` — see [terms](../terms/context.md) |

**Invite** (token in the path; 30 requests/min)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/invites/:token` | Public preview: seller name + logo, both terms, effective status, expiry, the ship-within / returns limits |
| GET | `/invites/:token/stores` | `requireCustomer`. The caller's stores for the join sheet: `hasAddress`, `isSeller` (the inviting store), existing supplier terms |
| POST | `/invites/:token/accept` | `requireCustomer`. `{ storeId \| newStore: { name, phone, address }, shippingFee?, shipWithinDays?, returnDays? }` — the three terms are required unless that store already supplies. → `{ linkId, storeId, storeSlug, supplyOnly, alreadyJoined }` |

**Supplier** (`requireCustomer` + owns `:storeId` + `requireSupplier` = an `ACTIVE` Supplier; otherwise 403, SU-9)

| Method | Path | Purpose |
| --- | --- | --- |
| GET / PATCH | `/stores/:storeId/supplier` | Profile: `shippingFee`, `shipWithinDays` (1…`shipWithinDaysMax`), `returnDays` (0…`returnDaysMax`). Changes logged; every seller not ended is notified |
| GET | `/stores/:storeId/sellers` | The sellers it supplies, with each link's terms |
| PATCH | `/stores/:storeId/sellers/:linkId` | `{ status }` (D-19) → the updated list |
| GET | `/stores/:storeId/sellers/:linkId/terms` | `{ current, log }` |
| GET | `/stores/:storeId/supply` | Own products; each option with shop price, stock, `cost`, `isOpen`, `aboveShopPrice` |
| PUT | `/stores/:storeId/supply/:productId` | `{ isOpen, variants: [{ variantId, cost \| null, isOpen }] }`. An offered option needs a price; `cost: null` withdraws it. Price changes are logged as `cost:{variantId}` |
| POST | `/stores/:storeId/supply/bulk` | `{ productIds, discountPct (0–90) }` → every option at shop price − N %, rounded to paise; the full list back |

Admin routes: [admin](../admin/context.md).

## Screens ◐ (`frontend/src/packages/dropship`)

- Seller: `/mystores/:slug/suppliers` — the invite sheet, the share step
  (WhatsApp to the given number, Copy link, an "emailed" note), the **Your
  suppliers** and **Invited** lists, and each supplier's **Terms** sheet (edit
  the two terms, the change log, Pause / Resume / Stop working together).
- Join: `/supplier-invite/:token` — preview, sign in in place, then the join
  sheet. A store without a business address can't be chosen; the address is
  asked only for a new supplier account (SU-16). After joining: **Add the
  products you'll supply** (supply-only) or **Choose products to offer**.
- Supplier: `supply` (**Products for sellers**, with the bulk bar), `sellers`,
  `supplier-settings`. A supply-only store's dashboard is `SupplierHome`.
- Words: [glossary](../glossary.md). Nav rows: `docs/FRONTEND_CONTEXT.md`.

## Failure cases

| # | What goes wrong | Solution |
| --- | --- | --- |
| SU-1 | Invite sent to the wrong person. | **Revoke**. Links are one-time and expire after `inviteExpiryDays`. |
| SU-2 | The link is forwarded to someone else. | The token is the authority. The seller sees who joined (business name, phone) and can **End**. |
| SU-3 | The supplier already has a UnieMax store. | It chooses that store, or creates a supplier account. |
| SU-4 | The same supplier is invited by two sellers. | One `Supplier`, two links, each with its own COD setting and statement. |
| SU-5 | The seller changes COD or who pays the returned-parcel fee. | New orders only: each order keeps its snapshot ([terms](../terms/context.md)). The change is logged and the supplier notified. Copies' `codAvailable` re-syncs (built). |
| SU-6 | The seller picks COD but the store doesn't accept COD. | The store's COD switch is shown on the invite sheet. |
| SU-7 | The seller pauses or ends a supplier. | Status + `statusBy` set and the supplier told. Copies pause (`LINK_INACTIVE`) and resume when it's active again (built). Open supplier orders complete; the statement stays. |
| SU-8 | Admin suspends the supplier, or its store. | Built: `SUSPENDED` blocks the supplier routes and the supplier is told; copies pause (`SUPPLIER_INACTIVE`) on admin suspend and on `catalog.store.changed`, and resume on restore. Open orders go on admin's **Needs action**. |
| SU-9 | A non-supplier calls supplier routes. | `requireSupplier` → 403. |
| SU-10 | A seller reads another store's suppliers. | Every seller route resolves the store through `host.getOwnedStore`. |
| SU-11 | A supplier offers a product that is itself a copy. | Refused: only the supplier store's own products can be offered, and never a copy (`isCopy` in `services/supply.ts` checks `Resale`) (built). |
| SU-12 | Price for sellers above the shop price. | Warning, not blocked. |
| SU-13 | The invite is accepted twice (double tap, two devices). | A guarded claim (`SENT → ACCEPTED`) runs before anything is created; the same supplier gets the link already made (`alreadyJoined`), anyone else 409. A failure after the claim gives the invite back. |
| SU-14 | The seller invites a supplier they already have. | *"Already your supplier"*, with a link to it. |
| SU-15 | The seller invites their own store. | Refused at accept: the inviting store can't be chosen (400). Another store of the same owner may supply it. |
| SU-16 | The supplier's address is missing. | Asked on the join sheet itself. |
| SU-17 | The supplier no longer wants to supply a seller (for example, it disagrees with changed terms). | It can **Pause** or **End** too (D-19); the seller is told. Copies pause (`LINK_INACTIVE`) (built); open orders complete. |
| SU-19 | A supplier account is put on the marketplace (its owner taps Publish on the products page). | **Refused** (`store.publishing` hook, 409): a supplier account has no shop (D-28), so it is never listed or searchable, and its stock can't be bought from there. The Publish prompt is hidden for it, and its Products page says only the offered products reach sellers. To sell to customers it needs a store of its own. |
| SU-18 | A supplier wants UnieMax to pay it but has no bank account. | Phase 6 asks for it in place. Until then its prepaid orders settle directly (PS-1); nothing is blocked. |

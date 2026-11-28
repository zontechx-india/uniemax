# Create a New Bill — build plan

**Status (24 Nov 2026):** **link bills are built in the real app** — backend
`modules/bills` (+ migration `20261124120000_seller_bills`), seller pages
`/mystores/{slug}/bills/**`, the customer page `/b/{token}`, admin Commerce →
Seller bills and the Orders Source filter. Real docs: `docs/API.md` (Seller
bills), `docs/BACKEND_CONTEXT.md` (Seller bills, Data Model → Bill),
`docs/FRONTEND_CONTEXT.md` (Seller bills). Differences from this prototype:
no per-store switch (the feature is additive); a product with ONE option is
picked the same way as Colour × Size (choose → quantity → Add), not by tap
cells. **25 Nov 2026:** "already paid" bills are built too (payment method
`OFFLINE` — cash / UPI / bank / other; "Already paid me" at step 3, not
step 1), plus order ownership by the bill's phone. **Still prototype only:**
one-off items and the PDF receipt.
**Asked by:** a seller ("Create a manual order — Send Bill / Payment Link").
Decided: a bill is always **products from the shop**. A payment link with only
an amount is **not** built (UnieMax is a shop platform, not a payment-collection
tool). A missing item is added as a **one-off item** instead (see §3.3).

Try it: `prototype/start.cmd`, then
- seller app → **Bills** (or Orders → **Create a bill**)
- the customer's page → **Open** on a bill, or `http://localhost:5180/pay.html`
- admin console → **Commerce → Seller bills**, and Orders → **Source: Seller bill**

---

## 1. The flow

```
SELLER (seller app)                     CUSTOMER (link on their phone)         ADMIN
1 Create a bill                         
  customer phone · items · how to pay   
2 Make bill  ─────────────┐             
3 Send on WhatsApp        │ wa.me opens the SELLER'S WhatsApp, message filled in
  (or Copy link)          └───────────► 4 Opens uniemax.com/b/<token>
                                           sees the bill (items, sizes, total)
  "Opened · not paid"  ◄──────────────── 5 Pay → OTP to their phone → address
                                           → UPI / card / net banking (PaymentHub)
  "Bill paid — order N" ◄─────────────── 6 Receipt with the order number           Seller bills,
  order is Confirmed → pack & send                                                  Orders (Source)
```

**Cash instead:** at step 1 the seller picks "Customer paid me already". The
order is made at once, marked paid (delivered at once if they took it from the
shop). The link then works as a receipt the seller can share.

## 2. Why this approach is stable (does not touch the rest of the app)

| Risk | How we avoid it |
| ---- | --------------- |
| Breaking checkout / orders | Bills live in their **own module and tables**. Nothing changes for normal checkout. A bill touches orders **once** — when it is paid — through the same guarded order-placing code checkout uses. |
| Stock held by unpaid bills | A link bill **holds no stock**. Stock goes down only at payment (guarded decrement, like checkout). Sold out meanwhile → the customer sees "sold out, ask the shop". |
| Price changes | Prices are **copied onto the bill** when it is made and never change after. |
| WhatsApp templates / shared number | **Not needed.** The seller sends from their own WhatsApp (`wa.me` link with the text filled in). No Meta approval, no spam risk to the UnieMax number, and the customer sees a number they know. Sending from UnieMax's number can come later. |
| Paying twice | One bill → one order. A paid, expired or cancelled bill refuses payment. |
| Rollout | A **per-store switch** (off by default). Turn it on for the seller who asked, watch, then for everyone. Off = the Bills screens hide; links already sent keep showing the bill. |
| Search engines | `/b/<token>` is a per-customer page: `noindex` + disallowed in `robots.txt` (docs/SEO.md rule). |

## 3. Seller screens (phone-first)

Look: the seller app's `ws-form` scale — controls 8 px, cards 10 px, sheets
12 px corners (the same steps as `ADMIN_UI_THEME.md`), 44 px tap targets,
48 px fields. Chosen cells are solid ink (`bg-fg` + `text-surface`) like the
real `SegmentedControl`. One primary action per screen. The bill number is
shown in two halves, `5541 2110`, so it is easy to read out on a call.

### 3.1 Bills (`/bills`) — nav: Overview → Bills
- **Content:** "N bills waiting · ₹total · M not shared yet"; tabs **All ·
  Waiting · Paid · Expired or cancelled** (segmented); rows: customer, total,
  time, items, number, status + stage ("Not shared yet", "Shared · not
  opened", "Opened · not paid") or "Cash".
- **Actions:** Create a bill (primary).
- **States:** skeleton · empty with Create a bill · empty tab.

### 3.2 Create a bill (`/bills/new`) — also Orders → Create a bill
1. **Customer** — mobile (+91, required), name (optional). Known phone →
   "Returning customer · N orders before", name (and address) filled in.
2. **What they are buying** — lines: photo, name, **size**, price each, stock
   left, − / + (− on 1 removes), line total. **Add items** opens the picker.
3. **How will they pay?** — cards (solid ink when chosen):
   - **Send a bill to pay online** → link open for **1 / 3 / 7 days**.
   - **Customer paid me already** → Deliver to them (address) / Took it from
     the shop. Note: "Coming later: the customer confirms with a one-time code".
4. **Delivery charge and discount** — delivery (empty = store rate), discount
   ₹ / %, note to the customer.
- **Bill total** card; sticky bar: items count, total, **Review bill**.
- **Review sheet:** lines, totals, what happens next → **Make bill** /
  **Save — paid in cash**.
- **Errors** sit under their field (phone, items, address, discount).

### 3.3 The item picker (built for 1,000+ products, 20+ categories)
A full-height sheet. The seller usually bills the same few items, then searches.
- **Search first** (autofocus): every word must match the product name, SKU
  (product or size) or category — "blouse maroon", "KS-1042", "kurti teal".
  Names that start with the words come first, then in-stock.
- **Category button** → a list of the tree with counts (Sarees 511 › Soft silk
  61 …). Chosen category shows as a solid chip with Clear. The picker always
  opens on **All categories** (a left-over filter hides items).
- **Often billed** (no search, no category): the store's last-billed items,
  size included, one tap to add.
- **Rows:** photo, name (2 lines), price · stock or the options ("3 colours ·
  5 sizes"). Picking follows the product's real `optionTypes` (up to 3 types,
  up to 100 variants — `OPTION_LIMITS`):
  - **No options** (one default variant) → **+**, then − n +.
  - **One option** (Size) → tap to open the **cells** (32 · 34 · 36 …, stock
    under each, sold out greyed); tap = add one, the cell turns solid with its count.
  - **Two or three options** (Colour × Size …) → one **chip row per option**,
    like the storefront. A value is greyed when no in-stock combination is left
    with it given the other choices (combinations the seller never listed do not
    exist). Changing one option drops a choice that no longer fits. When every
    option is chosen: "Teal / M · ₹1,749 · 8 left", − qty +, **Add N to bill**.
    The photo follows the chosen colour (the variant's own photo in the real app).
  - **Pre-chosen for speed:** a value typed in the search ("kurti teal" → Teal)
    and any option with only one value left in stock.
  - Under an open product: **On the bill** — each of its variants already added,
    with − / +, so the seller can fix amounts without leaving the picker.
  - Search also matches option values (colour names).
- **30 at a time** → "Show 30 more · N left".
- **Nothing found in a category** → "Search all categories · N found".
- **Not in your shop?** (after a search) → **one-off item**: name, price,
  quantity → on the bill now; saved at "Make bill" as a **hidden product**
  (category "Added from bills", stock = quantity), so the order, stock and
  earnings stay correct. The seller can later add a photo and show it in the shop.
- **Footer:** "N items on the bill · ₹total" + Done. The list keeps its
  scroll position while adding.

### 3.4 One bill (`/bills/:id`)
- Hero: status + stage, total, customer, number, open till.
- **Send the bill to `name`**: the exact message as a chat bubble, the link,
  Open (prototype: opens the customer page).
- Customer (address or "the customer adds it when they pay"), items + totals +
  note, timeline (made → shared → opened → paid / cancelled / expired).
- **Sticky bar:** open → **Send on WhatsApp** (green, "Send again" after) +
  copy link · paid → Open order · cash without receipt → Send receipt ·
  closed → Make a new bill like this. **Cancel this bill** sits low on the
  page, away from the main action.

## 4. Customer page (`uniemax.com/b/<token>`, prototype `pay.html#/b/<token>`)

In the **shop's colour** (storeVars), no shop navigation, phone-first.
1. **Bill** — "Your bill from `shop`"; the bill (number, date, pay by, items
   with size and qty, delivery, discount, to pay, the seller's note); Call /
   WhatsApp the shop; sticky **Pay ₹x**.
2. **Confirm your number** — OTP to the bill's phone (existing customer
   login; "Change number" allowed). Wrong code → clear error.
3. **Where should it go?** (delivery bills) — saved address of a returning
   customer, or name + address + 6-digit pincode.
4. **Pay** — address with Change; UPI / card / net banking; "you pay on the
   payment partner's page"; **Pay ₹x** → PaymentHub.
5. **Payment received** — order number, where it goes, payment reference,
   the bill, "updates on WhatsApp when confirmed, sent and delivered".
- Closed: **expired** ("ask the shop for a new bill"), **cancelled**,
  **paid in cash** (receipt), **not found**.

## 5. Admin (read-only)
- **Orders:** Bill chip, **Source** filter (Shop checkout / Seller bill).
- **Order page:** "Seller bill" card — bill link, made by, paid how (UPI /
  card / cash), payment reference, seller discount, shared how and when.
- **Seller bills:** numbers (open, paid by link, paid in cash, expired or
  cancelled), tabs, search, filters; open bills show their stage.
- **One bill:** items with size + SKU (+ "one-off item"), customer, timeline,
  "Shared by the seller" log, order, money, link.

## 6. Statuses and rules

| Status | Stage (open only) | Set by |
| ------ | ----------------- | ------ |
| `OPEN` | Not shared yet → Shared · not opened → Opened · not paid | Seller makes it; seller taps Send/Copy; customer opens the link |
| `PAID` | — | Customer pays, or the seller saves a cash bill |
| `EXPIRED` | — | Worked out from `expiresAt` (a sweep job also writes it) |
| `CANCELLED` | — | Seller |

- Every line is a real **product + variant** (one-off items become hidden products).
- Prices fixed on the bill; stock taken only at payment (cash: at once).
- Bill number = the order's 8-digit number (same pool as orders).
- The seller is notified when the customer **opens** the bill and when they **pay**.
- "Shared" means the seller tapped Send or Copy — we cannot see the chat.
- A paused shop cannot make bills.

## 7. Real build (dev → live)

### 7.1 Data (Prisma) — additive only
- **`Bill`**: id, number (unique), storeId, token (unique), customerName?,
  customerPhone, address Json?, items Json (productId, variantId, name,
  variantName, sku, imageKey, unitPrice, qty, oneOff), subtotal,
  shippingCharge, discountType, discountValue, discount, total, note?,
  payWay (`LINK|CASH`), handover (`DELIVERY|IN_SHOP`), status
  (`OPEN|PAID|EXPIRED|CANCELLED`), expiresAt, sharedAt?, openedAt?, paidAt?,
  cancelledAt?, orderId? (unique), createdById, timestamps.
  Indexes `(storeId, createdAt)`, `(status, expiresAt)`.
- **`BillShare`** (or Json on Bill): at, via (`WHATSAPP|COPY|SHARE`).
- **`Order`**: `source` (`CHECKOUT|BILL`, default CHECKOUT), `billId?` (unique).
  `PaymentMethod` + `CASH`. Fulfilment: reuse `PICKUP` for "took it from the
  shop" or add `IN_SHOP` — **decide**.
- **Store** feature switch: `features.bills` (default false).
- One-off items: a `StoreProduct` (isActive false) + one default
  `StoreProductVariant`, in a hidden system `StoreCategory` "Added from bills".

### 7.2 API (`modules/bills`)
Seller (`/api/v1/stores/:id/bills`, owner, switch on):
- `GET /` (tab, page) · `GET /:billId` · `POST /` create · `POST /:billId/share` `{via}` · `POST /:billId/cancel`
- Picker: `GET /api/v1/stores/:id/bill-catalog?q=&categoryId=&cursor=` — 30
  products with variants (price, stock, sku), name/SKU/category search (use
  the seller products list if it already does this) · `GET …/bill-catalog/often`.
Public (`/api/v1/public/bills/:token`):
- `GET` the bill (+ sets openedAt, notifies the seller once)
- `POST /pay` — **customer token** (OTP, `requireCustomer`); body address;
  places the order (`AWAITING_PAYMENT`, bill prices, guarded stock, hooks) via
  the shared order-placing function, then `createPaymentSession`. Webhook paid
  → order **Confirmed**, bill **Paid**. Window closes → order cancelled as
  today; the bill stays open until `expiresAt`.
Admin: `GET /api/v1/admin/bills`, `GET /api/v1/admin/bills/:id`, `source` filter on orders.

### 7.3 Order code — the one shared piece
Extract the stock-decrement + order-create part of `createOrder` into one
function used by checkout **and** bills, so both follow the same rules. Run
the existing order tests before and after — checkout must not change.

### 7.4 Money (seller finance)
Link bill = online order (same fees, payout). Cash bill = like COD (platform
fee to OWED, no gateway fee) — `finance.rules.ts` already treats non-`ONLINE`
this way; confirm in `docs/seller-finance/`.

### 7.5 Frontend
- Seller: `mystores/{slug}/bills`, `…/new`, `…/:billId`; nav; Orders button +
  chip; picker sheet with `MediaImg` thumbnails (`sizes="44px"`).
- Customer: `/b/:token` with storeVars; noindex + robots disallow `/b/`.
- Admin: Seller bills + Source filter + order card.
- `npm run check:ui` must not go up.

### 7.6 Build order
1. Schema + migration, switch, `Bill` service, seller API (create, list, get,
   share, cancel), picker endpoint.
2. Shared order-placing function + public pay endpoint + webhook branch.
3. Seller UI (list, create, picker, bill page) → test on dev with the switch on.
4. Customer page `/b/:token` (+ SEO rules).
5. Cash bills, admin pages, expiry sweep.
6. Tests: totals, stock race at pay, paid/expired/cancelled refuse payment,
   one order per bill, number uniqueness, one-off item. Docs: `API.md`,
   `BACKEND_CONTEXT.md`, `FRONTEND_CONTEXT.md`, `SEO.md`,
   `docs/seller-finance/`, `CONTEXT.md`.
7. Live: switch on for the requesting seller only, then everyone.

**Later:** OTP confirmation for cash bills · send from the UnieMax WhatsApp
number (Meta templates) · bulk bills (one bill to many past customers, with
limits) · coupons.

## 8. Not in this feature
Amount-only payment links · SMS · new payment gateway · part payments / EMI ·
editing a sent bill · GST invoice PDF.

## 9. Try it in the prototype

| Start in | Do this | You see |
| -------- | ------- | ------- |
| Seller (phone width) | Create a bill → phone `98400 11223` → Add items | Often billed; search "blouse maroon"; tap a product → sizes |
| Seller | In the picker search "silk thread" → Add as a one-off item | It lands on the bill; after Make bill it is a hidden product |
| Seller | Review → Make bill → Send on WhatsApp / copy | Stage "Shared · not opened" |
| Seller | Bill → Open | The customer page in a new tab |
| Customer | Pay → code `123456` → saved address → UPI → Pay | Receipt; seller gets "opened" then "Bill paid — order N" (Confirmed) |
| Customer | `pay.html` → an expired bill | "This bill has expired — ask the shop" |
| Seller | Customer paid me already → Took it from the shop | Order Delivered at once, paid in cash |
| Admin | Seller bills → a paid bill / Orders → Source: Seller bill | Sizes + SKU, shared log, payment reference |

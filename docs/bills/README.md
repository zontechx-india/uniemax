# Seller bills — knowledge base

**Start here for anything about seller bills.** This file is the one place
that explains the whole feature: why it exists, what was decided, every data
flow, every file, the money rules and what is not built. Exact request /
response shapes stay in [`docs/API.md`](../API.md) → *Seller bills* and
*Seller bill link*; this file says which endpoint does what.

**Status (25 Nov 2026):** live on **dev and prod** (tag `v1.130.0`). The
**PDF bill / receipt** (§5.8) is live on prod as `v1.131.0`.
Commits: `e70594f` link bills · `f5ae961` review sheet / buttons / icons ·
`ea7f4dc` already-paid bills, bill-phone ownership, OFFLINE fee rule.
Migrations: `20261124120000_seller_bills`, `20261125100000_offline_bills`.

---

## 1. What it is (in one minute)

A seller gets orders on the phone, on WhatsApp or in the shop. A **bill** lets
the seller fill the cart **for** the customer from the shop's own products,
then either:

| Pay way | What happens | When to use |
| --- | --- | --- |
| **LINK** (default) — "Send a pay link" | Seller shares a link `/b/{token}` from their own WhatsApp. Customer opens it, signs in (OTP), adds the address, pays online. Then it is a normal **Confirmed** order. | Customer has not paid yet |
| **OFFLINE** — "Already paid me" | Seller already got the money (cash, UPI to their own number, bank, other). The order is made **at once** and marked **paid**. The bill goes out on WhatsApp as a **receipt**. | Customer paid the seller directly |

It is **not** a "collect any amount" payment link. UnieMax is a shop
platform, not a payment gateway: **every bill is products from the shop.**

## 2. Decisions (agreed with the user)

| # | Decision | Why |
| --- | --- | --- |
| B1 | No amount-only payment links, ever. Every bill line is a real product / variant. | Not a payment-gateway app; stock, orders, fees and reports must stay true. |
| B2 | Seller shares from **their own WhatsApp** (`wa.me` link with the text filled in). No Meta templates, no sends from the UnieMax number, no SMS. | Customer sees a number they know; we only have WhatsApp. |
| B3 | **Checkout is untouched.** Bills reach orders only through `priceBillLines`, `placeBillOrder`, `placeOfflineBillOrder` and one branch in `releaseToSeller`. | Bills must never break normal buying. |
| B4 | Prices are fixed when the bill is made. An OPEN link bill holds **no stock** and no order. | Simple, no stuck stock. |
| B5 | Bill number = 8 random digits, unique across bills **and** orders; the paid order reuses it when it can. | Matches the 8-digit order IDs (v1.125.0). |
| B6 | Big catalogs (1000+ products, 20+ categories): server search by words, category list, "Often billed", variant chips — mobile first. | Sellers bill from a phone. |
| B7 | "Already paid" = payment method **OFFLINE**, treated like COD for money: seller holds the money, platform fee → seller's dues, no payout, no gateway fee, no hub refund. | UnieMax never touched the money. |
| B8 | The order belongs to the **bill's customer** (bill phone), not the payer. The payer is shown as "Paid by". No account yet → claimed when they sign in with that phone. | "I booked it but someone else paid — whose history?" |
| B9 | Admin can give OFFLINE its **own platform fee** (e.g. 0%). Default: same as the platform fee. | Flexible pricing for offline sales. |
| B10 | Dropship (supplier-shipped) lines are refused on OFFLINE bills. | The supplier must be paid through UnieMax. |
| B11 | Nothing is pre-chosen where a seller could skip it (e.g. "They paid by" starts empty). | Sellers are non-technical, no training. |
| B12 | Main action on seller bill screens is the **`ink`** button (solid black), not the shop colour. The customer's `/b/` page keeps the shop's colour. | Seller tool vs. shop page. |

## 3. Where the code lives

### Backend (`backend/src/`)

| File | Role |
| --- | --- |
| `modules/bills/bills.routes.ts` | Three route trees: owner `/api/v1/stores/:id/bills/**`, public `/api/v1/public/bills/:token`, admin `/api/v1/admin/bills` |
| `modules/bills/bills.controller.ts` | Zod parse → service |
| `modules/bills/bills.schema.ts` | `billCreateSchema` (LINK + OFFLINE fields, `superRefine` for OFFLINE), `billPaySchema`, list / catalog / admin queries |
| `modules/bills/bills.service.ts` | `createBill`, `listBills`, `getBill`, `shareBill`, `cancelBill`, item picker (`billCatalog`, `billCatalogCategories`, `oftenBilled`), `getPublicBill`, `payBill`, `adminListBills`, `adminGetBill`, `billState` |
| `modules/bills/billPdf.ts` | `renderBillPdf(data)` → PDF bytes (pdfkit, A4); `amountInWords` (Indian grouping), `toPaise`, `printable`, `formatDate` (IST) |
| `assets/fonts/plus-jakarta-sans/` | The app's typeface for the PDF (OFL, `OFL.txt`): Latin 400–700 + Latin-Ext 400/700 — only Latin-Ext has ₹ |
| `modules/bills/billOwner.ts` | `last10`, `verifiedCustomerByPhone`, `settleBillOwner`, `claimBillOrders` — who owns a bill's order |
| `modules/bills/bills.jobs.ts` | `startBills(log)` — listens to `customer.signedIn` → `claimBillOrders` (started in `app.ts` after `startFinance`) |
| `modules/orders/orders.service.ts` | `priceBillLines` (pricing once), `placeBillOrder` (LINK payment attempt), `placeOfflineBillOrder` (OFFLINE order at once); cancel refund only for ONLINE |
| `modules/payments/payments.service.ts` | `releaseToSeller` BILL branch → order CONFIRMED, bill PAID, `settleBillOwner`; `getOrCreatePaySession` (one live attempt) |
| `modules/finance/finance.rules.ts` | `Method = ONLINE \| COD \| OFFLINE`, `sellerHoldsMoney`, `orderLegs`, `settlementStatus`, `resolveRule` |
| `modules/finance/finance.service.ts` · `.schema.ts` | `currentRates().platformOffline`, `createFeeRule({ paymentMethod })` |
| `modules/payouts/payouts.rules.ts` | `payoutBlockers` — OFFLINE never paid out |
| `modules/orders/orders.notifications.ts` | "Payment: Paid to the shop" / "Paid to you directly" |
| `modules/admin/*` | Orders `paymentMethod` filter includes OFFLINE; detail has `offlineMode`, `paidByName`, `paidByPhone`; dashboard COD sum includes OFFLINE |
| `package/events/index.ts` | `customer.signedIn` event type |
| `package/auth/customer/customer.controller.ts` | `deliverLogin` emits `customer.signedIn` after `issueSession` |
| `prisma/schema/core.prisma` | `Bill`, `BillStatus`, `BillPayWay`, `OrderSource`, Order bill fields, `PaymentMethod.OFFLINE` |
| `test/unit/offline-bills.test.ts` | Money rules + phone matching (7 tests) |
| `test/unit/bill-pdf.test.ts` | Words, paise, safe text, receipt / bill / multi-page render (`BILL_PDF_OUT=dir` writes the samples) |

### Frontend (`frontend/src/`)

| File | Role |
| --- | --- |
| `storefront/features/bills/billsApi.ts` | Types, `billsApi` (owner), `publicBillApi` (customer), `billMessage` (link text or receipt text), `whatsappUrl`, `spacedNumber`, `OFFLINE_MODE` labels, `billsApi.pdf` / `publicBillApi.pdf` (Blob), `pdfFileName`, `downloadFile`, `shareOrDownload` |
| `storefront/pages/stores/bills/StoreBillsPage.tsx` | List: tabs All · Waiting · Paid · Expired or cancelled (`?tab=`), Load more, "To you · Cash" tag |
| `storefront/pages/stores/bills/StoreBillNewPage.tsx` | Make a bill: 1 Customer · 2 Items · 3 Payment · 4 Delivery / discount / note (+ link days for LINK) · sticky total · Review `Dialog` |
| `storefront/pages/stores/bills/StoreBillPage.tsx` | One bill: hero, message, Send on WhatsApp / Send receipt, Copy link, customer + address, items, timeline, Cancel, Open order, "Make a new bill like this", **Share bill / receipt PDF** + Download (PDF fetched ahead) |
| `storefront/pages/stores/bills/ItemPicker.tsx` | Big-catalog picker (`fill` + `flush` Dialog), `Stepper`, `ChoiceChip` |
| `storefront/pages/stores/bills/billUi.tsx` | `BillDraft` (+ `sessionStorage` per store), `draftFromBill`, `BILL_STATE`, `BILL_STAGE`, `Thumb`, `QuietTag`, `variantLabel` |
| `storefront/pages/bill/BillPayPage.tsx` | Customer page `/b/:token` (public router), pay flow, paid / expired / cancelled screens, OFFLINE "Thank you — paid", **Download bill / receipt (PDF)** |
| `storefront/pages/stores/orderMeta.tsx` | `paymentLabel` — OFFLINE = "Paid to you directly" |
| `storefront/pages/stores/StoreOrderDetailPage.tsx` · `StoreOrdersPage.tsx` | Mode + "Paid by"; "From a bill" tag; "Create a bill" button (owner only) |
| `storefront/pages/OrdersPage.tsx` | Customer's orders: "Paid at the shop" |
| `storefront/pages/stores/StoreTransactionsPage.tsx` · `StoreEarningsPage.tsx` | Cash filter / tiles include OFFLINE |
| `admin/pages/bills/SellerBillsPage.tsx` · `SellerBillPage.tsx` | Commerce → Seller bills (read-only) |
| `admin/ui/statusMeta.tsx` | `PAYMENT_METHOD_LABEL` (OFFLINE = "Paid to seller"), `PaymentChip` |
| `admin/pages/OrdersPage.tsx` · `PaymentsPage.tsx` · `OrderDetailPage.tsx` | Method filter option, labels, Paid by |
| `admin/pages/finance/FeeSettingsPage.tsx` | Third card "Fee on bills paid to the seller" |

Routes: seller `/mystores/{slug}/bills`, `/bills/new`, `/bills/:billId`
(`storefront/app/router.tsx`); customer `/b/:token` (`publicRouter.tsx`;
`PUBLIC_PATH` and `LoginRoute`'s `SHOPPING_PATH` include `b`); admin
`/admin/bills`, `/admin/bills/:billId`. Bills are **owner only**: `bills` is
in the admin store-manage scope's `hiddenSections`, and the "Create a bill"
button checks `useStoreManageScope().mode === 'owner'`.

## 4. Data model

**`Bill`** (`bills`): `id`, `storeId`, `number` (8 digits, unique), `token`
(unique random secret in the link), `customerName?`, `customerPhone`
(normalised `+91XXXXXXXXXX`), `fulfilment` (DELIVERY | PICKUP), `items` JSON
(`BillLine`: productId, variantId|null, stockVariantId, productName,
variantName, sku, productSlug, imageKey, unitPrice, quantity, lineTotal —
money as strings), `subtotal`, `shippingCharge`, `discountType` /
`discountValue` (as typed) + `discount` (₹), `total`, `note`, `status`
(`BillStatus` OPEN → PAID | CANCELLED), `expiresAt`, `sharedAt`, `shares`
JSON `[{ at, via: WHATSAPP|COPY|SHARE }]`, `openedAt`, `paidAt`,
`cancelledAt`, `orderId` (unique), and for OFFLINE: `payWay` (`BillPayWay`
LINK | OFFLINE), `offlineMode` (CASH|UPI|BANK|OTHER), `offlineRef`,
`handedOver`, `address` JSON `{ address, pincode, state }`.
Indexes `(storeId, createdAt)`, `(status, expiresAt)`.

**State shown to people** (`billState`): EXPIRED is **not stored** — an OPEN
bill past `expiresAt` reads EXPIRED. **Stage** (OPEN only): NEW (not shared)
→ SHARED → OPENED.

**`Order`** additions: `source` (`OrderSource` CHECKOUT | BILL), `billId`
(indexed, not unique — a failed attempt is cancelled and the next attempt is
a new order), `offlineMode`, `paidByName`, `paidByPhone`.
**`PaymentMethod`** gains `OFFLINE` (never chosen at checkout).
**`FeeRule.paymentMethod`** (existing column) is now set by the console for
the OFFLINE platform fee.

## 5. Data flows

### 5.1 Making a bill (both pay ways)

```
Seller: StoreBillNewPage
  draft (sessionStorage um.billDraft.{storeId})
  delivery hint ← publicOrderApi.quote (checkout's own shipping quote)
  Review → Dialog → billsApi.create(storeId, input)
        │
        ▼
POST /api/v1/stores/:id/bills  (requireCustomer + owner scope; storeScope(actor))
  billCreateSchema (Zod) → createBill
    LINK: store must be published, not paused, online payment on (else 409)
    fulfilment: OFFLINE → TAKEN ? PICKUP : DELIVERY
                LINK    → store pickup-only ? PICKUP : DELIVERY
    priceBillLines(store, items, shipping, fulfilment)
       = checkout's loadPricingProducts + priceLine + priceOrder
       (visible products, active variants, stock checked) → fixed prices
    shippingCharge: PICKUP → 0; null → store's usual rate; else the typed ₹
    discount (₹ or %, ≤ items), total > 0, number (8 digits), token
    prisma.bill.create(...)
    OFFLINE → 5.3 (order at once) ; LINK → done (status OPEN)
```

### 5.2 Link bill: share → open → pay → paid

```
StoreBillPage → "Send on WhatsApp"
  <a href = whatsappUrl(phone, billMessage(bill))>  (opens the SELLER's WhatsApp)
  + billsApi.share(via WHATSAPP | COPY) → POST …/bills/:billId/share
    (records shares[], first one sets sharedAt; 409 on closed bills)

Customer opens /b/{token} → BillPayPage
  GET /api/v1/public/bills/:token (optional auth)
    first GET of an OPEN bill → openedAt   (stage OPENED)
    phone masked "+91 98400 •••23"; order shown only to its owner
  Pay → signs in in place (openAuthDialog, OTP) → name / phone / address
  POST /api/v1/public/bills/:token/pay  (requireCustomer)
    payBill → getOrCreatePaySession
      same customer, attempt still open → reuse it
      another account paying right now → 409
      else placeBillOrder:
        guarded stock decrement, order.placing hooks (dropship tags lines),
        order AWAITING_PAYMENT, source BILL, billId, number = bill number
        (first attempt), createPaymentSession (same as checkout)
    → { orderId, orderNumber, storeSlug, paid, payment }
  launchCashfreeCheckout(payment) → back to /order/{store}/{order}

Gateway webhook (Cashfree or PaymentHub) / reconcile
  → PAID transaction → releaseToSeller
       CHECKOUT order → PENDING (unchanged)
       BILL order     → CONFIRMED (confirmedAt), bill → PAID + orderId,
                        settleBillOwner(order, bill.customerPhone)   (5.4)
  → afterOrderPaid → the usual "order placed" notifications
Payment window closes unpaid → attempt order cancelled (stock back);
  bill stays OPEN until expiresAt.
Seller cancels an OPEN bill → expireUnpaidOrder on any open attempt
  (stock back, gateway checkout closed); a late payment → paid-after-cancel refund path.
```

### 5.3 Already-paid bill (OFFLINE)

```
StoreBillNewPage step 3 "Already paid me"
  They paid by: Cash · UPI · Bank · Other   (required, none pre-chosen)
  Reference (optional, hidden for cash)
  How do they get it?  Deliver to them (address ≥10, PIN 6 digits, state)
                       Took it now (no delivery charge)
  → "Save as paid"
        │
        ▼
createBill (5.1, skips published / online-payment checks)
  owner = verifiedCustomerByPhone(bill phone)   (may be null)
  placeOfflineBillOrder({ bill, customerId: owner, offlineMode, offlineRef, handedOver })
    one transaction:
      guarded stock decrement + recomputeProductAggregates
      order: paymentMethod OFFLINE, paymentStatus PAID, paymentRef = offlineRef,
             offlineMode, paidNotifiedAt now, confirmedAt now,
             handedOver ? DELIVERED (+ packed / delivered times) : CONFIRMED
      runHooks("order.placing") → any orderItem.fulfilledBy → 409
             "shipped by your supplier — send a payment link instead"
      bill → PAID + orderId
    number retry (bill number first, then a new one)
    emit order.placed + order.status (DELIVERED | CONFIRMED)
  any error → the bill is deleted, error re-thrown (no half bill)
  → getBill

StoreBillPage (paid, OFFLINE)
  "Paid to you · Cash · Ref …", receipt text (billMessage with payWay OFFLINE)
  "Send receipt" (WhatsApp) + "Order →"; timeline: made → paid → receipt sent → opened
Customer opens the receipt /b/{token}: "Thank you — paid", first view → openedAt
  no account → "Sign in with your number (…) to keep it in your orders"
```

### 5.4 Whose order (ownership)

```
settleBillOwner(db, orderId, billPhone)        [inside releaseToSeller, link bills]
  payer = order.customerId (who paid the link)
  owner = verifiedCustomerByPhone(billPhone)   (last 10 digits, phoneVerifiedAt set)
  owner found   → order.customerId = owner; paidByName / paidByPhone = payer (if different)
  no owner:
     payer's phone or order.customerPhone == bill phone → keep the payer
     else → customerId = null, paidBy = payer   (waits to be claimed)

OFFLINE bills: owner chosen at creation (verifiedCustomerByPhone) or null.

claimBillOrders(db, customerId)                [bills.jobs.ts on customer.signedIn]
  customer's verified phone → bills with that customerPhone (variants
  d, +91d, 91d, 0d, "+91 d") and an orderId
  → orders source BILL with customerId null → set customerId
  (safe on every sign-in; second run claims nothing)
emit point: customer.controller.ts deliverLogin, after issueSession (OTP login).
```

### 5.5 Money (finance, payouts, refunds)

| | LINK bill | OFFLINE bill |
| --- | --- | --- |
| Treated as | an ONLINE order | like COD (`sellerHoldsMoney`) |
| Platform fee | taken from the payout | posted as **dues** (OWED, `COD_PLATFORM_FEE`) on delivery, "Platform fee on order X paid to you directly" |
| Gateway fee | as online | none |
| Payout | yes, after delivered + paid | **never** (`payoutBlockers`: "Paid to the seller directly…") |
| Settlement status | online statuses | `CASH_COLLECTED` from the start, remaining 0 |
| Cancel refund | through PaymentHub | none (refund only when ONLINE + PAID) |
| Fee rule | platform fee | `platformOffline`: an OFFLINE-only PLATFORM rule if one exists, else the platform fee |

Ledger posting: `finance.jobs.ts` on `order.status` DELIVERED + the 15-minute
sweep (OFFLINE is PAID, so the sweep picks it up). Taken-in-shop OFFLINE bills
post at once; deliver ones post when delivered. Seller **Transactions** "Cash"
filter and tile, **Earnings** cash totals and the admin dashboard COD sum
include OFFLINE. Full ledger rules: [`docs/seller-finance/README.md`](../seller-finance/README.md).

Fee rule: Admin → Finance → Fee settings → "Fee on bills paid to the seller" →
Change → `POST /admin/finance/fee-rules { kind: PLATFORM, paymentMethod: OFFLINE,
percent }`. A method-specific rule beats the any-method rule (`resolveRule`),
so after it is set, later platform-fee changes do not touch OFFLINE bills.

### 5.6 Item picker (big catalogs)

```
GET …/bills/catalog?q&categoryId&page&pageSize(30)
  visibleProductWhere; every word of q matches name / category / variant name / SKU;
  categoryId includes children; in-stock first
GET …/bills/catalog/categories → [{ id, name, parentId, count }] (empty left out)
GET …/bills/catalog/often → up to 6 { product, variant } recently billed / sold
UI: product without options → + then Stepper; with options → <details> with a
  ChoiceChip row per option (values with no in-stock combination disabled;
  a typed value like "kurti teal" and a lone in-stock value pre-chosen)
  → quantity → "Add N to bill".
```

### 5.8 PDF bill / receipt

```
Seller: StoreBillPage (OPEN or PAID)
  on load → billsApi.pdf → GET /api/v1/stores/:id/bills/:billId/pdf   (owner)
            (fetched ahead: the share sheet must open straight from the tap —
             Safari refuses navigator.share after a slow await)
  "Share bill PDF" / "Share receipt PDF" → shareOrDownload:
       navigator.share({ files: [Receipt-48203917.pdf], text: the WhatsApp text })
       → WhatsApp / Gmail… ; desktop or not allowed → download ; records share SHARE
  "Download" → downloadFile
Customer: BillPayPage (open or paid) "Download bill / receipt (PDF)"
  → publicBillApi.pdf → GET /api/v1/public/bills/:token/pdf   (no sign-in; the token is the secret)

Server: bills.service billPdfData(bill, audience) → billPdf.renderBillPdf
  CANCELLED / EXPIRED → 409 (no PDF)
  OPEN → "Bill" (Payment due, amount due, pay link + "pay by" date)
  PAID → "Receipt" (Paid, amount paid, how: "Paid to {shop} by UPI on …" + reference,
         or "Paid online on …" + payment reference; "Paid by X" when someone else paid)
  shop: name, legal name (profile.businessName when different), profile address,
        phone, email, GSTIN — each only if filled in; logo (storage "logo" → sharp →
        256px PNG) or the initial on the shop colour; theme.primaryColor as the top band
  customer: a name only when it has letters (an order made without one stores the phone)
  audience "seller": full phone + street address
  audience "public": phone masked "+91 98400 •••23", address = PIN + state only
  headers: application/pdf, attachment; filename="Receipt-48203917.pdf",
           Cache-Control private, no-store; X-Robots-Tag noindex
```

Layout (A4, Plus Jakarta Sans): shop colour band → logo/initial + shop block |
title, number, date, order no., Paid / Payment due pill → Billed to | Deliver to /
Collected in the shop / Store pickup → items table (#, item + variant · SKU, qty,
rate, amount; header repeats on new pages, which get a "Receipt 4820 3917 · shop ·
continued" line) → amount in words (Rupees … Only) | totals, Total, Amount paid /
due → Payment box → Note from the shop → footer on every page: "computer-generated
… does not need a signature", contact, "View online: link", Page x of y.

**Never claims more than is true:** it is not called a tax invoice (prices carry
no GST split — `Order.tax` is 0), no "inclusive of taxes" line, no signature.
Text the font cannot draw is folded (accents dropped, ₹ → "Rs"); names in other
scripts (Tamil, Hindi) are dropped until a font for them is added.

### 5.7 Admin

Commerce → **Seller bills** (`GET /admin/bills?state&storeId&q`, `GET
/admin/bills/:id`) — read-only; only the seller shares or cancels. Orders:
**Source** filter (CHECKOUT | BILL), **Payment method** filter has "Paid to
seller (bill)"; order detail shows method + `offlineMode` + **Paid by**.

## 6. UI rules used here

- `docs/DESIGN_GUIDELINES.md` and the `ws-form` scale (controls 8, cards 10,
  sheets 12). Every button is `shared/ui/Button.tsx`; main action `ink`.
- Icon-only buttons (steppers, +): `size="md" className="w-11 px-0!"` —
  without `!` the size's `px-5` wins and the icon shrinks to a dot.
- Chosen cells are solid ink (`bg-fg text-surface`) — `SegmentedControl` or
  `ChoiceChip`. A `SegmentedControl` always shows one cell chosen, so use
  `ChoiceChip` when "nothing chosen yet" must be possible.
- Stored images through `MediaImg` (`Thumb` in billUi).
- `npm run check:ui` rawButtons budget is **227** and may only go down — use
  `Button`, radio chips, `<details>`, links.
- Review sheet subtitle: name + `spacedPhone` once (no phone twice).

## 7. Tests and checks

- Unit: `backend/test/unit/offline-bills.test.ts` (`npm run test:unit`).
- Dev-DB smoke run (25 Nov, then cleaned up): cash + took it → DELIVERED,
  PAID, customer null, stock −1; UPI + deliver → CONFIRMED with ref and
  address; validation refuses missing mode / address; sign-in claims both;
  owned at once when the phone has an account; `settleBillOwner` sets owner +
  Paid by. The dropship 409 is covered by code only.
- Frontend: `npx tsc -b`, `npm run check:ui`, `npx vite build`.
- Local Cashfree needs an https `return_url`: run with
  `PUBLIC_WEB_URL=https://dev.uniemax.zontechx.com`.

## 8. Not built yet (and why)

| Item | Why it waits |
| --- | --- |
| GST tax invoice (CGST/SGST/IGST split, HSN) | Prices carry no tax split today; needs the accountant and per-product tax data |
| Other scripts in the PDF (Tamil, Hindi…) | Needs Noto fonts per script and run-splitting; today such text is dropped |
| One-off items (not in the shop) | A hidden product would show in Categories and admin category mapping; also B1 |
| OTP confirmation of a cash bill by the customer | Optional later trust step |
| Expiry sweep job | Expiry is read at request time; nothing needs a job yet |
| Sending from the UnieMax WhatsApp number | B2 |
| Bill edit after making | Make a new one ("Make a new bill like this") |

## 9. How to change this feature safely

1. Read this file, then only the code files in §3 you need.
2. Keep checkout untouched (B3). New money behaviour goes through
   `sellerHoldsMoney` / `finance.rules.ts`, not new `=== "COD"` checks.
3. Any new payment-method check: search the code for `"COD"` and
   `paymentMethod` — OFFLINE must be handled wherever COD is.
4. Schema change: edit `prisma/schema/*.prisma`, **hand-write** the SQL
   migration (`db:migrate` wants to reset the dev DB), apply with
   `npx prisma migrate deploy`, commit the migration folder.
5. Update **this file** in the same task (status, flows, files, not built),
   plus `docs/API.md` for endpoint shapes.
6. Push `main` = dev; a `v*` tag = prod (only when the user says so).

Prototype of the original plan (dummy data, not the real app):
`prototype/seller.html#/bills/new`, notes in `prototype/docs/BILLS.md`.

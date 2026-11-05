# Seller Finance — fees, ledger, balances

> **Start here** for any seller-finance work. Version 1 is built (Nov 2026).
> Code: `backend/src/modules/finance/` (+ payout wiring in
> `modules/payouts/`), schema `backend/prisma/schema/finance.prisma`.
> Endpoints live in [`docs/API.md`](../API.md) → *Seller finance*.

## 1. What it does

UnieMax takes a **platform fee** on each seller's product price. The fee is
never shown to customers — it is taken from what UnieMax pays the seller (online
orders) or owed by the seller (cash-on-delivery orders). Every money movement
between UnieMax and a seller is an entry on the **seller ledger**.

| Who | Sees |
| --- | --- |
| Admin | **Finance → Fee settings** (platform + gateway fee %), **Seller balances** (per store, with the full ledger and corrections), the fee breakdown and COD-dues deduction on each order's **Seller payout** card |
| Seller | The fee % and "you receive ₹…" under the price when adding a product; **Earnings** page (balances, delivered totals, payouts, every entry) |
| Customer | Nothing |

## 2. Decisions (agreed 5 Nov 2026)

| # | Decision |
| --- | --- |
| D1 | A "seller" is a **store** — the ledger and balances are per store. |
| D2 | Platform fee = a **%**, configurable by an admin, **0% to start**. |
| D3 | Fee base = **product price only** (line totals), never shipping. |
| D4 | Gateway fee = a configurable %, **0% to start**, **paid by UnieMax** (bearer configurable; not taken from the seller while UnieMax pays). Online orders only, on what the customer paid. **Set to 2% on 6 Nov 2026** (in Fee settings) and **shown to the seller as UnieMax's discount** — under the product price, on Earnings, in the payout email and WhatsApp (`seller_payout_sent_v2`). |
| D5 | Old orders follow the same rules → the rule in force when they were placed, i.e. 0%. |
| D6 | Online money is payable once the order is **delivered** and **paid** — no hold period yet. |
| D7 | COD dues are deducted from a **manual** payout (the form suggests the full dues; the admin can change it). Gateway payouts don't deduct dues. |
| D8 | Tax / GST, discounts, wallet top-up, sellers paying dues online, automatic settlements — **not built**; see §6. Tax needs the accountant first. |

## 3. Fee rules

Table `fee_rules`. A rule = `kind` (PLATFORM | GATEWAY) · `scope` · `percent`
(0–100, 2 decimals) · `bearer` (SELLER | PLATFORM) · `effectiveFrom` ·
optional `paymentMethod`, `storeId`, `categoryId`, `retiredAt`.

- **Never edited.** A change is a new row; the console's "Change" adds one.
  `effectiveFrom` can be now or later, **never in the past** (so no placed
  order's fee can change).
- **Resolution** (`finance.rules.ts → resolveRule`): rules of that kind in
  force at the order's `placedAt`, matching its store / category / payment
  method → **most specific wins** (STORE > CATEGORY > GLOBAL, a method-specific
  rule beats an any-method one) → then the latest `effectiveFrom`.
- **Today only GLOBAL rules are offered** in the console. STORE / CATEGORY /
  per-method rules already resolve correctly; adding them = a form + the API
  accepting the scope. CATEGORY needs `categoryId` filled on each order line
  (`compute()` in `finance.service.ts` passes `null` today).
- The migration seeds `feerule_platform_initial` and `feerule_gateway_initial`
  (0%, effective 2020-01-01), so every existing order resolves to them.

## 4. Order financials (fee snapshot)

Table `order_financials`, one row per order, written when the order is
**delivered** (and paid, for online), using the rules in force at **placement**.
Before that, the same numbers are computed on the fly — identical, because
rules can't be back-dated. Fields: items amount (fee base), shipping, total,
platform fee (+ % when all lines share one), gateway fee + % + bearer, seller
earning, `lines` (per item: base, %, fee, rule id), `postedAt`.

`sellerEarning = total − platform fee − (gateway fee if the SELLER bears it)`.
Fees are rounded half up to the paisa, per line. All money maths is integer
paise / basis points (`finance.rules.ts`).

## 5. The ledger

Per store, three balances (`seller_balances`) — always the sum of that store's
entries (`seller_ledger_entries`) per bucket:

| Bucket | Meaning (admin / seller wording in `shared/finance/ledgerLabels.ts`) |
| --- | --- |
| `PAYABLE` | UnieMax owes the seller — ready to pay |
| `IN_PAYOUT` | Taken out of PAYABLE for a payout not finished (stops double payment) |
| `OWED` | The seller owes UnieMax (COD platform fees, corrections) |

Entries are **never edited or deleted**; each has a signed amount, balance
before/after, a unique `idempotencyKey`, order / payout links, who made it.
One write path: `ledger.service.ts → postLegs` (locks the balance row, skips
keys already posted).

| Event | Entries |
| --- | --- |
| Online order delivered + paid | `ORDER_SALE` +total, `PLATFORM_FEE` −fee (and `GATEWAY_FEE` −fee if the seller bears it) → PAYABLE |
| COD order delivered | `COD_PLATFORM_FEE` +fee → OWED |
| Payout created | `DUES_SETTLED` (PAYABLE −dues, OWED −dues) · `PAYOUT_RESERVED` (PAYABLE −amount, IN_PAYOUT +amount) |
| Payout reaches SUCCEEDED | `PAYOUT_PAID` IN_PAYOUT −amount |
| Payout FAILED / CANCELLED before paid | `PAYOUT_RELEASED` back to PAYABLE · `DUES_RESTORED` |
| Payout REVERSED / CANCELLED after paid | `PAYOUT_RETURNED` PAYABLE +amount · `DUES_RESTORED` |
| Admin correction | `ADJUSTMENT` ± on PAYABLE or OWED, reason required, audited |

Zero-amount entries are skipped (so at 0% no fee entries appear).

**When it posts.** `finance.jobs.ts`: on the `order.status` DELIVERED event,
and a **15-minute sweep** (first run 45 s after boot) that posts any delivered
order not posted yet and syncs any payout whose `ledgerStatus ≠ status`. The
sweep is also the **backfill** for orders and payouts from before this
feature. Every payout change also syncs inside its own transaction
(`syncPayoutLedger` → `payoutLegs`, which lists every leg the payout's
current state needs; posting adds only the missing ones).

**Order payouts.** "Left to pay" on an order = seller earning − paid out − in
progress − COD dues deducted (`payoutTotals`). The manual payout form shows
the store's dues and the server's suggested split (`summary.suggested`: dues
first, the rest sent); `amount + duesDeducted ≤ left to pay` and
`duesDeducted ≤ OWED` are checked under the order and balance row locks
(order row first, then balance row — same order everywhere).

## 6. Not built yet (in order of likely need)

- Tax / GST components (on the platform fee, gateway fee; e-commerce TCS/TDS)
  — **ask the accountant first**; add as fee-rule kinds.
- Per-store / per-category fee rules in the console (resolver ready, §3).
- Hold period before online money becomes payable (a PENDING bucket).
- Platform-wide finance dashboard (fees earned, gateway cost over time), CSV export.
- Seller pays dues online (PaymentHub intent), wallet top-up, promo credits,
  refund adjustments (no refunds exist yet), affiliate commission payouts
  (docs/AFFILIATE.md waits for this ledger), automatic settlements,
  gateway payouts with dues deduction.

## 7. Rules for changes

- Money in integer paise; percent in basis points; never floats.
- Never edit or delete a fee rule, snapshot or ledger entry — add a new one.
- Every posting goes through `postLegs` with a stable idempotency key.
- Fees are never added to a customer-facing response.
- Update this file in the same task; endpoint details go to `docs/API.md`.

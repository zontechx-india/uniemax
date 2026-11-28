# Seller Finance — fees, ledger, balances

> **Start here** for any seller-finance work. Version 1 is built (Nov 2026).
> Code: `backend/src/modules/finance/` (+ payout wiring in
> `modules/payouts/`), schema `backend/prisma/schema/finance.prisma`.
> Endpoints live in [`docs/API.md`](../API.md) → *Seller finance*.

## 1. What it does

UnieMax takes a **platform fee** on each seller's product price. The fee is
never shown to customers — it is taken from what UnieMax pays the seller (online
orders) or owed by the seller (cash-on-delivery orders, and seller's bills paid
to the seller directly — payment method `OFFLINE`). Every money movement
between UnieMax and a seller is an entry on the **seller ledger**.

| Who | Sees |
| --- | --- |
| Admin | **Finance → Fee settings** (platform + gateway fee %), **Seller balances** (per store, with the full ledger, corrections and the advance-payout switch), the fee breakdown, COD-dues deduction and advance payouts (§9) on each order's **Seller payout** card |
| Seller | The fee % and "You get ₹…" under the price when adding a product; **Earnings** page (balances, delivered totals, "When we pay you" from the payout policy, payouts with the policy version each was paid under, every entry) and a link that opens the public **payout policy** page `/policies/PYO-001` in a new tab ([`docs/policyhub`](../policyhub/README.md)); **Transactions** page (one row per order — §8) |
| Customer | Nothing |

## 2. Decisions (agreed 5 Nov 2026)

| # | Decision |
| --- | --- |
| D1 | A "seller" is a **store** — the ledger and balances are per store. |
| D2 | Platform fee = a **%**, configurable by an admin, **0% to start**. |
| D3 | Fee base = **product price only** (line totals), never shipping. |
| D4 | Gateway fee = a configurable %, **0% to start**, **paid by UnieMax** (bearer configurable; not taken from the seller while UnieMax pays). Online orders only, on what the customer paid. **Set to 2% on 6 Nov 2026** (in Fee settings) and **shown to the seller as UnieMax's discount** — under the product price, on Earnings, in the payout email and WhatsApp (`seller_payout_sent_v3`: the fee and "UnieMax discount on gateway fee" on separate lines, then the amount sent). |
| D5 | Old orders follow the same rules → the rule in force when they were placed, i.e. 0%. |
| D6 | Online money is payable once the order is **delivered** and **paid** — no hold period yet. Exception (27 Nov 2026): an admin may pay a trusted store **in advance**, before delivery, at UnieMax's risk — §9. |
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
- **Today only GLOBAL rules are offered** in the console, plus one
  per-method platform rule: **"Fee on bills paid to the seller"** (`paymentMethod:
  OFFLINE`). Until it exists those bills follow the platform fee; once set it
  wins for them (e.g. 0% to waive it), and later platform fee changes no longer
  touch them. STORE / CATEGORY rules already resolve correctly; adding them =
  a form + the API accepting the scope. CATEGORY needs `categoryId` filled on each order line
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

Per store, four balances (`seller_balances`) — always the sum of that store's
entries (`seller_ledger_entries`) per bucket:

| Bucket | Meaning (admin / seller wording in `shared/finance/ledgerLabels.ts`) |
| --- | --- |
| `PAYABLE` | UnieMax owes the seller — ready to pay |
| `IN_PAYOUT` | Taken out of PAYABLE for a payout not finished (stops double payment) |
| `OWED` | The seller owes UnieMax (COD and OFFLINE platform fees, advances to recover, corrections) |
| `ADVANCE` | Paid to the seller before delivery, not cleared yet (§9). Not part of `net` |

Entries are **never edited or deleted**; each has a signed amount, balance
before/after, a unique `idempotencyKey`, order / payout links, who made it.
One write path: `ledger.service.ts → postLegs` (locks the balance row, skips
keys already posted).

| Event | Entries |
| --- | --- |
| Online order delivered + paid | `ORDER_SALE` +total, `PLATFORM_FEE` −fee (and `GATEWAY_FEE` −fee if the seller bears it) → PAYABLE |
| COD or OFFLINE order delivered | `COD_PLATFORM_FEE` +fee → OWED (no gateway fee; `sellerHoldsMoney` in `finance.rules.ts`) |
| Payout created | `DUES_SETTLED` (PAYABLE −dues, OWED −dues) · `PAYOUT_RESERVED` (PAYABLE −amount, IN_PAYOUT +amount) |
| Payout reaches SUCCEEDED | `PAYOUT_PAID` IN_PAYOUT −amount |
| Payout FAILED / CANCELLED before paid | `PAYOUT_RELEASED` back to PAYABLE · `DUES_RESTORED` |
| Payout REVERSED / CANCELLED after paid | `PAYOUT_RETURNED` PAYABLE +amount · `DUES_RESTORED` |
| Admin correction | `ADJUSTMENT` ± on PAYABLE or OWED, reason required, audited |
| Advance payout created / delivered / order ended — see §9 | `ADVANCE_PAID` · `ADVANCE_SETTLED` · `ADVANCE_TO_DUES` |

Zero-amount entries are skipped (so at 0% no fee entries appear).

**When it posts.** `finance.jobs.ts`: on the `order.status` DELIVERED event,
and a **15-minute sweep** (first run 45 s after boot) that posts any delivered
order not posted yet and syncs any payout whose `ledgerStatus ≠ status`. The
sweep is also the **backfill** for orders and payouts from before this
feature, and it clears any advance whose order has ended but was missed (§9). Every payout change also syncs inside its own transaction
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
- Each new payout saves `order_payouts.policyVersionId` — the payout policy
  (PYO-001) version in force, looked up before the payout transaction and
  never blocking it. Money logic doesn't read it. See
  [`docs/policyhub/README.md`](../policyhub/README.md) §10.
- Update this file in the same task; endpoint details go to `docs/API.md`.

## 8. Transactions (seller, per order)

Earnings shows the store's money as **balances and ledger entries**.
Transactions shows the same money **one row per order** — the bill, how the
customer paid, and whether the money has reached the seller. It reads only
(orders, `order_financials` or the same on-the-fly numbers, payouts,
refunds); it posts nothing. Endpoint: `GET /stores/:id/transactions`
(`docs/API.md`). Page: Payments & delivery → **Transactions**
(`StoreTransactionsPage`), dense in the admin pattern at seller sizes: one filter bar (search · period select This month (default) / Last month / Last
7 days / All time · All / Online / Cash switch), four stat tiles, a table from `md` and three-line rows on a phone (a few words per status from `settlementShort`), Load more.
The order page shows the same row as its **Money** card
(`GET /stores/:id/transactions/:orderId`).

Status (`finance.rules.ts → settlementStatus`, unit-tested in
`test/unit/settlement.test.ts`), first match wins:

| Status | When |
| --- | --- |
| `REFUNDED` | payment REFUNDED (the refund covered the order), or a cancelled order with a SUCCEEDED refund. A **part** refund on a delivered order keeps the normal status; the row shows `refundedAmount` |
| `REFUND_PENDING` / `CANCELLED` | order cancelled, with / without a PENDING refund |
| `CASH_TO_COLLECT` / `CASH_COLLECTED` | COD, before / after delivery · OFFLINE is `CASH_COLLECTED` from the start (the seller already has the money; never paid out) |
| `ADVANCE_PAID` | online, not delivered, and an advance is paid or on its way (§9) — `settlement.advance` says how much |
| `AWAITING_DELIVERY` | online, not delivered (UnieMax holds the money, D6) |
| `ON_ITS_WAY` | a payout is PENDING / PROCESSING |
| `SETTLED` | nothing left to pay (`payoutTotals.remaining = 0`; COD dues kept count as paid) |
| `PARTLY_SETTLED` | some paid, some left |
| `READY_TO_PAY` | delivered, nothing paid (`lastPayoutFailed` when the newest payout failed / came back) |

On COD, OFFLINE, cancelled and refunded orders UnieMax owes nothing, so `remaining` is 0.

**Supplier-shipped orders** (`shippedByOthers`: a line has `OrderItem.fulfilledBy`). On
**COD** the supplier's courier collects the cash, so the pill reads *Supplier collects* /
*Supplier collected*, "You get" is hidden (Transactions shows *Via supplier*), and the note
says the seller's share is settled on the supplier's **Account**
([dropshipping money](../dropshipping/money/context.md)). **Prepaid** keeps the normal
numbers (UnieMax pays the seller the whole order) and the note adds that part of it is the
supplier's. The ledger is unchanged: the platform fee is the seller's either way.
On a cancelled / refunded order with an advance, `settlement.advance` is what
the seller pays back, and the note says it comes out of the next payouts.

## 9. Advance payouts (paying before delivery)

Built 27 Nov 2026. Some sellers ask to be paid before the order is
delivered; UnieMax may agree, **at its own risk**, full or part of the
order's earning.

**Who may get one.** Only a store whose **`advancePayoutsAllowed`** switch is
on (`stores`, default off). An admin turns it on or off from the order's
Seller payout card ("Allow advance payouts", with the risk said first) or
from Seller balances → the store (`PATCH …/finance/stores/:id/advance-payouts`,
audited). Off stops new advances only.

**Which orders.** `ONLINE` + `PAID`, not `DELIVERED`, not `CANCELLED`
(`payoutPlan` in `payouts.rules.ts`). Manual only — never the gateway, never
with COD dues deducted. Any number of advances, together never more than the
earning (the normal "left to pay" check). Whether a payout is an advance is
decided under the order lock and stored on it (`order_payouts.isAdvance`).

**On the ledger** (`advanceLegs` in `finance.rules.ts`, unit-tested in
`test/unit/advance-payouts.test.ts`):

| When | Entries |
| --- | --- |
| Advance recorded | `ADVANCE_PAID`: ADVANCE +amount, IN_PAYOUT +amount |
| It reaches SUCCEEDED | `PAYOUT_PAID`: IN_PAYOUT −amount |
| Order delivered (its sale posts) | `ADVANCE_SETTLED`: ADVANCE −amount, PAYABLE −amount — it comes out of the order's own earning, so only the rest is left to pay |
| Order cancelled / refunded before delivery | `ADVANCE_TO_DUES`: ADVANCE −amount, OWED +amount — the seller owes it back; the next manual payout suggests deducting it like COD dues |
| Advance FAILED / CANCELLED / REVERSED | the money goes back to where it sits now: ADVANCE (not cleared yet), PAYABLE (after delivery) or OWED (after cancellation) |

Why a separate ADVANCE bucket and not OWED straight away: OWED is deducted
from the next payout of **any** order. An advance on an order that will be
delivered must not be taken from another order's payout.

**Clearing** is decided once and kept on the payout (`advanceOutcome`:
`SETTLED` | `DUES`, `nextAdvanceOutcome`): `postDeliveredOrder` clears the
order's advances in the same transaction as its sale; the `order.cancelled`
event calls `resolveOrderAdvances`; the 15-minute sweep catches the rest
(refunds included). An advance undone before its order ended is never
cleared.

**Who sees what.** Admin: an "Advance" chip (`· delivered` / `· to recover`)
on the payout, "of which in advance" in the order totals, a "to recover"
warning on a cancelled order, the **Paid in advance** balance and tab on
Seller balances, a **Kind** filter on Seller payouts. Seller: the
`ADVANCE_PAID` status on Transactions and the order's Money card, a **Paid to
you in advance** tile on Earnings (only when above 0), "Advance — paid before
delivery" on the payout, and an email and WhatsApp that say it is an advance
(WhatsApp `seller_advance_sent` — whatsapp_templates.md §5.3).

**Recovery risk.** If a cancelled order's advance can't be taken from later
payouts (the seller stops selling), OWED still shows it — collecting it is
manual (record a correction once they pay).

**End-to-end check** against the dev DB: `npx tsx scripts/advance-payouts-check.ts`
in `backend/` — makes its own store and orders, runs every path above through
the real services, checks every balance against the ledger, cleans up.
Refuses production.

**Payment mode** is Online / Cash — the Cash filter and tile include OFFLINE
(a seller's bill paid to them by cash / UPI / bank; its `offlineMode` says which).
An online order stores `ONLINE`, and PaymentHub's webhook does not say UPI / card / net banking.
Showing those needs the hub to send the instrument and a new order column
(Phase 2, not built).

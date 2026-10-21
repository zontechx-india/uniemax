# Money: amounts, statement, payouts

> **Read when:** working on amounts on supplier orders, the seller–supplier
> statement, recording payments, Easy Split payouts, refunds, or anything about
> who owes whom. **Update when:** any money rule changes.

Status: ◐ the account (statement), recorded payments and the job's owed transition are built (Phase 5, 21 Oct 2026; API tests and the screen walkthrough pending). Amounts are recorded from Phase 4 (`costTotal`, `shippingFee`, `supplierShare`, `platformFee`, `collectAmount` on each supplier order). Every line is `DIRECT`; Easy Split is Phase 6.
The account is **computed on read** from the supplier orders and the live payments (D-40): one pure function (`domain.ts` `statementLine`, `statementBalance`), so both sides always see the same numbers. Decisions: D-16,
D-17, D-18 in [decisions](../decisions.md). Every amount here comes from the
order's snapshot ([terms](../terms/context.md)).

## How money moves (D-16)

| Order | Until Easy Split is live (`DIRECT`) | Once Easy Split is live (`SPLIT`) |
| --- | --- | --- |
| **Prepaid** | UnieMax holds the customer's payment for the seller, like every order today (seller payouts aren't built; `PRODUCTION_READINESS.md` S1). The seller pays the supplier its share directly, and the statement shows it as owed. | Cashfree Easy Split, through PaymentHub, right after payment: the supplier's share goes to the supplier's vendor account, and the rest goes to the seller's, minus the platform fee. Cashfree holds vendor money for 12 days (D-21) before paying it out. The statement shows **Paid by UnieMax**. |
| **COD** | The supplier's courier collects the cash. The supplier owes the seller `collectAmount − supplierShare` (statement). | The same, `DIRECT`, because the cash never reaches Cashfree. Later: net it against the supplier's prepaid balance with Easy Split adjustments (Phase 7). |

`settleVia` is decided **per supplier order at placement**: `SPLIT` only when
Easy Split is live and both the seller's and this supplier's payout accounts
are active, otherwise `DIRECT`.

## Amounts (snapshotted at placement)

- `supplierShare = Σ(unitCost × qty) + shippingFee`
- `collectAmount` (COD only) = the order total. COD orders are always one parcel (D-13).
- `platformFee` (D-20) = `platformFeePct` × the order total, from config,
  taken from the seller's share. It is between UnieMax and the seller and never
  changes the seller–supplier balance. Collected:
  - by the split on `SPLIT` prepaid orders (it stays with UnieMax);
  - on `DIRECT` prepaid orders, from the seller's payout (UnieMax holds that money);
  - on COD orders, by an Easy Split adjustment that debits the seller's vendor
    balance (Phase 6). Until then it is recorded and shown, not yet collected.
- **Seller earns** = lines' total + delivery charge − `supplierShare` −
  `platformFee` − affiliate commission, if any.

## Who owes whom

| Case | `DIRECT` line | `SPLIT` line |
| --- | --- | --- |
| Prepaid, delivered | seller → supplier: `supplierShare` | nothing (paid by the split) |
| COD, delivered | supplier → seller: `collectAmount − supplierShare` | — (COD is always `DIRECT`) |
| Came back, `returnFeePayer = SELLER` | seller → supplier: `shippingFee` | the customer is refunded in full, so seller → supplier: `shippingFee` on the statement (automatic adjustment is Phase 7) |
| Came back, `returnFeePayer = SUPPLIER` | nothing | nothing |
| Cancelled · couldn't ship · expired | nothing | refunded; each vendor is debited its share |

**Statement line states:**
- `PENDING`: not delivered yet.
- `OWED`: delivered, or shipped more than `owedFallbackDays` ago with no open problem.
- `HELD`: a problem is open.
- `VOID`: cancelled, couldn't ship, or expired.
- `SPLIT`: paid by Easy Split. Doesn't count in the balance.

**Balance** per link = Σ owed seller→supplier − Σ owed supplier→seller − Σ
payments seller→supplier + Σ payments supplier→seller. A positive balance means
the seller owes the supplier.

## Screens

- ☑ Seller: Suppliers → {supplier} → **Account** (an **Account** button beside **Terms**, route `suppliers/:linkId/account`). Supplier: Sellers → {seller} →
  **Account** (`sellers/:linkId/account`). Both sides see the same numbers, plus the **Terms** panel with its
  change log ([terms](../terms/context.md)).
- The top line is the balance in plain words: *"You owe Sri Textiles ₹3,450"*
  or *"Sri Textiles owes you ₹1,200"*.
- Lines: order number, date, *Prepaid* / *COD*, customer paid, supplier gets,
  you get, and state. `SPLIT` lines read *"Paid by UnieMax · pays out on {date}"*.
- **Record a payment**: *I paid {name}* / *{name} paid me*; amount (prefilled
  with the balance); date; UPI or bank reference; note. The other side is
  notified. The person who recorded a payment can delete it; it is kept for
  audit and the other side is told.

## Easy Split (Phase 6)

**What Cashfree offers** (Cashfree docs, checked 20 Oct 2026; re-check when building):
- **Split after payment**: `POST /easy-split/orders/{order_id}/split` with an
  idempotency key, at least 2 minutes after payment succeeds. It must be called
  within the **Order Split Delay** window (default T+1, can be extended).
  Otherwise the whole amount settles to UnieMax's merchant account.
- **Vendors**: one per payee, with a bank account (account number + IFSC, or a
  UPI ID) and contact details. PAN verification is a separate opt-in.
  Easy Split must be activated on the account by Cashfree; the payments track
  is doing this.
- **Defer Settlement**: holds a vendor's money N days before payout. Per order,
  the date can be brought earlier
  (`PUT /easy-split/orders/{orderid}/settlement-eligibility/vendors/{vendorid}`).
- **Refunds**: by default each vendor is debited in proportion to its split. A
  refund before the split comes out of the next settlement. **Split Refund**
  takes explicit per-vendor amounts. The automatic debit can be switched off.
- **Adjustments**: `POST /easy-split/vendors/{vendor_id}/adjustment`, `CREDIT`
  (merchant → vendor) or `DEBIT` (vendor → merchant), up to the unsettled balance.
- **A deleted vendor can't be debited.**

**How UnieMax uses it:**
1. PaymentHub owns the Cashfree account. The dropship package asks the core
   payments module through the host (`requestSplit`); the core asks PaymentHub.
2. On `order.paid`, after at least 2 minutes, the split request carries **amounts,
   never percentages**:
   - one entry per `SPLIT` supplier order: its `supplierShare`, to the supplier's vendor;
   - one entry for the seller: the order total − Σ `SPLIT` supplier shares −
     `platformFee`. `DIRECT` suppliers' shares go to the seller, who pays them directly.
3. Vendor money waits 12 days (Defer Settlement, D-21) while parcels travel.
   Every store, sellers and suppliers alike, is a Cashfree vendor (D-22).
4. Full refunds (cancel, couldn't ship, came back) use the proportional default.
   Partial refunds on mixed orders are made by an admin with Split Refund, using
   the per-vendor amounts shown on **Refunds to make**.

## Failure cases

| # | What goes wrong | Solution |
| --- | --- | --- |
| M-1 | The supplier's price changes after the order was placed. | Snapshot (D-18). Amounts never change after placement. |
| M-2 | The seller's earnings are negative. | Warned on the add sheet (C-23); never blocked. |
| M-3 | The courier collected less than `collectAmount`. | The statement uses `collectAmount`. The supplier saw the amount on its card and slip, so the gap is settled between them. |
| M-4 | An order is refunded after a payment was recorded. | Its line becomes `VOID` and the balance shifts by itself. The next payment evens it out. |
| M-5 | Rounding drift. | All maths in `Decimal` in `domain.ts`. Amounts are stored once and never recomputed differently. |
| M-6 | A paid order is cancelled for a supplier reason. UnieMax's own refunds are status-only today. | It goes on admin's **Refunds to make** with the per-vendor amounts ([admin](../admin/context.md)). |
| M-7 | A payment is recorded twice. | Both are visible. The recorder deletes one, and the other side is told. |
| M-8 | The two sides disagree. | Support ticket to the platform. An admin sees both sides' entries and the terms log. |
| M-9 | On `DIRECT` prepaid orders UnieMax holds the money while the seller owes the supplier. | Known until Easy Split is live (D-16). The statement shows the debt. |
| PS-1 | The supplier has no active payout account when the order is placed. | That supplier order is `DIRECT` (snapshot). The supplier sees, in place: *"Add your bank account to be paid by UnieMax for prepaid orders."* |
| PS-2 | The supplier's payout account fails between placement and the split. | Split without it: its share goes to the seller and that supplier order flips to `DIRECT`. Logged, and both sides are told (T-10). |
| PS-3 | The split call fails (network, hub down). | The hourly job retries with the same idempotency key. If it still fails near the end of the window → admin **Needs action**: *"Split not done; the money will settle to UnieMax"*, with the per-vendor amounts for a manual payout. |
| PS-4 | The order is cancelled in the minutes before the split. | The split job checks the order first; no split. A refund before the split comes out of the next settlement. |
| PS-5 | A refund after the split, and a vendor's balance is too low. | Cashfree recovers it from later payouts. If needed, an admin uses an adjustment; it shows on **Needs action**. |
| PS-6 | The split adds up to more than the amount paid. | Amounts in `Decimal`; the seller's amount is the remainder; checked before the call. |
| PS-7 | The split is requested twice (retry, two workers). | Idempotency key per order. |
| PS-8 | Partial refund on a mixed order. | Per-vendor amounts on **Refunds to make**; the admin uses Split Refund. |
| PS-9 | A vendor is deleted at Cashfree while it has orders. | Never delete a vendor with open orders or an unsettled balance. End the link instead. |
| PS-10 | Payment lands after the order was cancelled (late capture). | No split. The existing refund-required alert handles it. |

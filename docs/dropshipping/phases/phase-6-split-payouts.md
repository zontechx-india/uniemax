# Phase 6: Easy Split payouts for supplier orders ☐

## Goal

Prepaid supplier orders pay the supplier through **Cashfree Easy Split** (D-16).
Right after payment, the supplier's share goes to its vendor account and the
rest to the seller's, held 12 days (D-21) before payout. COD stays direct.
Orders placed before this phase stay `DIRECT` (D-18, T-9).

## Read

- [money/context.md](../money/context.md): "Easy Split" and PS-1…PS-10
- [terms/context.md](../terms/context.md): `settleVia`, T-9, T-10
- [data-model/money/context.md](../data-model/money/context.md): "Phase 6"
- [architecture/context.md](../architecture/context.md): host (`splitLive`,
  `getPayoutAccount`, `requestSplit`), `DROPSHIP_SPLIT`, hourly job
- [admin/context.md](../admin/context.md): the Needs action additions

## Before you start

- **The payments track is ready:**
  - Easy Split is activated on the Cashfree account. Check which hub you are
    on: the dev hub is TEST-only, the prod hub LIVE-only.
  - PaymentHub can create and update vendors, split after payment, refund with
    per-vendor amounts, and make adjustments.
  - Every store has a Cashfree vendor (D-22).
- Defer Settlement is set to 12 days on the Cashfree account (D-21), and the
  platform fee rate is set (`platformFeePct`, Q-5).
- Re-check the Cashfree facts in [money](../money/context.md) against the
  current Cashfree docs: API version, split window, the 2-minute wait.

## Build: backend

- ☐ Phase 6 fields (+ migration).
- ☐ Placement: `settleVia = SPLIT` when `DROPSHIP_SPLIT`, `host.splitLive()`,
  and both the seller's and this supplier's payout accounts are active.
  Otherwise `DIRECT`.
- ☐ `payouts.ts`: on `order.paid`, after at least 2 minutes (via the job),
  `requestSplit` with amounts (each `SPLIT` supplier's `supplierShare`; the
  seller gets the remainder − `platformFee`). One idempotency key per order;
  track `splitState`.
- ☐ Fallbacks:
  - a supplier's account fails → split without it, flip that supplier order to
    `DIRECT`, log it and tell both sides (PS-2);
  - the call fails → retry; near the end of the window → admin **Needs
    action** (PS-3).
- ☐ Statement: `SPLIT` lines read *"Paid by UnieMax · pays out on {date}"*.
- ☐ **Refunds to make** shows per-vendor amounts for Split Refund (PS-8).
- ☐ COD platform fee: debit the seller's vendor balance with an Easy Split
  adjustment once the order is delivered (D-20). Idempotent per order.
- ☐ The supplier's bank account is asked for in place, on the join sheet and in
  supplier settings, using the store bank form (SU-18, PS-1).

## Build: frontend

- ☐ Supplier: the bank account prompt in place; "Paid by UnieMax" lines with
  payout dates in Earnings / Account.
- ☐ Seller: `SPLIT` lines in the Account statement.
- ☐ Admin: **Split not done** and **Vendor balance low** in Needs action.

## Tests

- PS-1…PS-10, T-9 and T-10.
- The split adds up to no more than the amount paid; retries are idempotent.
- COD is never split; orders placed before the switch stay `DIRECT`.

## Done when

On dev (TEST hub), a prepaid order with supplier products is split: the
supplier's vendor gets its share and the seller's vendor the rest. A cancelled
order refunds with vendor debits. A supplier without a bank account falls back
to `DIRECT`. Then production runs with `DROPSHIP_SPLIT` on.

## Docs to update

- Core payments changes (the payments track): `CASHFREE_PAYMENTS.md`, `API.md`,
  PaymentHub docs.
- Here: markers in [money](../money/context.md), [terms](../terms/context.md),
  [data-model](../data-model/context.md), [admin](../admin/context.md),
  [architecture](../architecture/context.md), [phases](context.md) and the README status.

# Phase 6: Easy Split payouts for supplier orders ◐

> Built 21 Oct 2026 **in sandbox mode** (migration `20261021160000_dropship_split`): everything the package
> decides, records and shows is real; only the call that would move money is a simulated provider
> behind the host (`splitLive`, `getPayoutAccounts`, `requestSplit`, `adjustPayout`, D-44). **No money
> moves and no payment gateway is called.** Left, for the real integration: replace those four host
> methods with PaymentHub calls and run "Before you start" below. Off by default (`DROPSHIP_SPLIT`).

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

- ☑ Phase 6 fields (+ migration).
- ☑ Placement: `settleVia = SPLIT` when `DROPSHIP_SPLIT`, `host.splitLive()`,
  and both the seller's and this supplier's payout accounts are active.
  Otherwise `DIRECT`.
- ☑ `payouts.ts`: on `order.paid`, after at least 2 minutes (via the job),
  `requestSplit` with amounts (each `SPLIT` supplier's `supplierShare`; the
  seller gets the remainder − `platformFee`). One idempotency key per order;
  track `splitState`.
- ☑ Fallbacks:
  - a supplier's account fails → split without it, flip that supplier order to
    `DIRECT`, log it and tell both sides (PS-2);
  - the call fails → retry; near the end of the window → admin **Needs
    action** (PS-3).
- ☑ Statement: `SPLIT` lines read *"Paid by UnieMax · pays out on {date}"*.
- ☑ **Refunds to make** shows per-vendor amounts for Split Refund (PS-8).
- ☑ COD platform fee: debit the seller's vendor balance with an Easy Split
  adjustment once the order is delivered (D-20). Idempotent per order.
- ☑ The supplier's bank account is asked for in place, in Orders to ship and in
  supplier settings (the join sheet comes before the store has an account, so the
  prompt waits for the first screen after joining), using the store bank form (SU-18, PS-1).

## Build: frontend

- ☑ Supplier: the bank account prompt in place; "Paid by UnieMax" lines with
  payout dates in Earnings / Account.
- ☑ Seller: `SPLIT` lines in the Account statement.
- ☑ Admin: **Split not done** and **Vendor balance low** in Needs action.

## Tests

- PS-1…PS-10, T-9 and T-10.
- The split adds up to no more than the amount paid; retries are idempotent.
- COD is never split; orders placed before the switch stay `DIRECT`.

### Verified (21 Oct 2026, sandbox)

- `npm run typecheck` and `npm run test:unit` (145 pass; `test/unit/dropship-split.test.ts` covers who is
  split, what each payee gets and that it adds up to what the customer paid, the due and
  window-closing rules, the COD fee rule, and a split line on the account).
- An `app.inject` run on the dev database with throwaway stores (deleted after): 19 checks — the role says
  *sandbox* and whether the store can be paid out to; COD never split and its fee flagged *Vendor balance
  low* from an empty balance, then debited once when the seller's vendor has money; a prepaid order split
  into ₹510 and ₹518.02 with the ₹19.98 fee kept (₹1,048 in total) and idempotent on repeat; the account
  line *Paid by UnieMax · pays out on …* 12 days on; delivered staying split; no payout account → direct
  (PS-1); an account failing before the split flipping to direct with both sides told (PS-2, T-10); a
  failing provider retried, then on Needs action near the window's end, then done once back (PS-3); a
  cancelled order never split (PS-4); a split order that came back (return fee line; per-vendor refund
  amounts, PS-8); admin Payouts; an order decided direct staying direct (T-9); access. The Phase 3, 4 and
  5 checks still pass.
- Frontend: `tsc -b`, `vite build`, `check:ui` (no budget rises); the account, the bank prompt and its
  form, the supplier's card, admin Payouts and Needs action checked at 390 px with mocked data.
- `npm run test:api` on dev with `DROPSHIP_SPLIT=true` (set in the dev server's `.env.development`, 21 Oct
  2026): `test/dropship-split.test.mjs` (5 tests: the role's mode and payout state, adding a bank account in
  place, COD never split, the account's mode, access) with the suppliers, supplier-products, orders,
  statement and shipments suites: all pass. A prepaid order's split can't be driven through the API suite
  (it needs the payment hub's checkout); the end-to-end run above covers it, and on dev it can be tried by
  paying a prepaid order on the TEST hub.

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

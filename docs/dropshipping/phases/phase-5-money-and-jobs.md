# Phase 5: Statement, reminders, self-healing. MVP complete ◐

> Built 21 Oct 2026 (migration `20261021150000_dropship_statement`). The API suites pass on dev
> (21 Oct 2026). Left: the walkthrough of the screens on dev, and the **Release** steps below,
> which are the owner's.

## Goal

The seller and the supplier see the same account of who owes whom and can
record payments. Reminders keep orders moving, and the hourly job repairs
anything a lost event left behind. Then the MVP goes to production.

## Read

- [money/context.md](../money/context.md): all of it
- [architecture/context.md](../architecture/context.md): config, hourly job, S-1…S-4
- [data-model/money/context.md](../data-model/money/context.md): "Phase 5"
- [terms/context.md](../terms/context.md): the snapshot rule (every amount comes from it)
- [decisions.md](../decisions.md): D-16, D-17, D-18

## Before you start

Phase 4 done. D-16, D-17, D-20 and D-23 are decided. Every line in this phase
is `DIRECT`; Easy Split is Phase 6. `platformFee` is already snapshotted from
`platformFeePct` (D-20) and shown in the seller's "You earn". It is between
UnieMax and the seller, so it doesn't touch the seller–supplier balance.

## Build: backend

- ☑ `Settlement` (+ migration).
- ☑ Statement per link: line states (`PENDING` → `OWED` / `HELD` / `VOID`),
  the came-back rule from each order's own `returnFeePayer` (D-17), and the balance.
- ☑ Record a payment and delete your own (soft delete), with the other side
  notified.
- ☑ Hourly job steps: ship-by reminders and late flags, the confirm reminder,
  statement `OWED` transitions, the customer-data cut-off, and reconcile (S-1).

## Build: frontend

- ☑ Seller: Suppliers → {supplier} → **Account**.
- ☑ Supplier: Sellers → {seller} → **Account**.
- ☑ **Record a payment** sheet.

## Tests

M-1…M-9 and S-1…S-4. Balances match on both sides for prepaid, COD, came back
and cancelled cases. A dropped `order.paid` handler is repaired by reconcile.

### Verified (21 Oct 2026)

- `npm run typecheck` and `npm run test:unit` (132 pass; `test/unit/dropship-money.test.ts` covers every
  statement case, the balance and its words, payment validation, M-4 and M-5, and the four job due-date rules).
- An `app.inject` run on the dev database with throwaway stores (deleted after): 18 checks — a
  new order shows as pending and doesn't count; COD delivered (the supplier owes the seller
  `collect − share`); prepaid delivered (the seller owes the share); came back with the fee on the
  seller, then on the supplier, and an older order keeping its own terms; a cancelled order
  at zero; a held line out of the balance and back once resolved; a payment recorded by each side,
  the words flipping per side, only the recorder deleting, the other side told; the 15-day fallback;
  each reminder once; reconcile repairing a lost `order.paid` and a cancelled order left open;
  access. The Phase 3 (25) and Phase 4 (29) checks still pass.
- Frontend: `tsc -b`, `vite build`, `check:ui` (no budget rises); the Account page checked at
  390 px with mocked data — you owe, they owe, settled, supplier side and the record sheet.
- `npm run test:api` on dev after the deploy: `test/dropship-statement.test.mjs` (6 tests: pending line,
  COD delivered with both sides agreeing, a recorded payment, only-the-recorder delete, payment
  validation, access) with the orders, supplier-products, suppliers and shipments suites: 33 of 33 pass.

## Release

- ☐ Set `platformFeePct` to the agreed rate (Q-5).
- ☐ Run through `docs/DEPLOYMENT.md`, then set `DROPSHIP_ENABLED=true` in production.
- ☐ Onboard the first seller and supplier together, and watch the first orders.

## Done when

Statements match for both sides in every case above, the jobs repair a dropped
event, and production runs with the flag on.

## Docs to update

- `README.md` and `CONTEXT.md` (feature is live), core.
- Here: flip markers in [money](../money/context.md),
  [architecture](../architecture/context.md),
  [data-model](../data-model/context.md), [phases](context.md) and the README
  status (MVP complete).

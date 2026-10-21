# Admin

> **Read when:** working on admin screens or endpoints for dropshipping.
> **Update when:** they change.

Status: ◐ Suppliers built (Phase 2, 20 Oct 2026); Needs action built (Phase 4, 21 Oct 2026) with **Split not done** and **Vendor balance low** added in Phase 6 (21 Oct 2026); a read-only **Payouts** page (Phase 6); forcing a status is not built (D-37).

## Screens (`frontend/src/admin`)

- ☑ **Suppliers** (`/suppliers` in the console; nav item shown only while the
  package is on): every supplier with its store, the sellers it supplies,
  terms, status, join date and note; filter by status. **Suspend** /
  **Restore** with a note the supplier is shown. Suspending blocks the
  supplier routes now; pausing every copy of its products (SU-8) arrives with
  copies in Phase 3.
- ☑ **Needs action** (`/needs-action` in the console, shown while the package is on): one list with a filter by kind:
  - **Late:** parcels past their "Ship by" date.
  - **Can't ship on mixed orders:** a manual partial refund may be needed (F-4).
  - **Came back:** parcels returned to the supplier.
  - **Problems reported:** with a link to the support ticket.
  - **Refunds to make:** paid orders cancelled for a supplier reason, with the
    per-vendor amounts for a Split Refund once Easy Split is live. Refunds are
    status-only today, so the money is returned from the gateway dashboard.
  - Phase 6, **Split not done** (PS-3) and **Vendor balance low** (PS-5): with
    the per-vendor amounts needed to fix them by hand.

  Each item: **Resolve** with a note (`adminResolvedAt`, `adminNote` on the
  supplier order).
- **Order detail** (core): parcels with tracking and the proof photo
  ([shipments](../shipments/context.md)).
- There is no supplier payments screen. Money settles directly between the
  seller and the supplier until Easy Split pays prepaid orders (D-16, Phase 6).

- ☑ **Payouts** (`/payouts` in the console, shown while the package is on): every order paid, or meant to be paid, by Easy Split — state, reference, what the supplier, the seller and UnieMax's fee each get, the payout date, attempts and the last error. Read-only; labelled *Sandbox — no money moves* while payouts are simulated.
- ☑ **Refunds to make** on a split order carries the per-vendor amounts a Split Refund needs (PS-8).

## API: `/api/v1/admin/dropship` ◐

Inside the admin subtree its session cookies are scoped to (D-29):
`requireAdmin` + `requireAdminCsrf`. Built in Phase 2: the two supplier rows.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/suppliers?status&page&pageSize` | ☑ Supplier list (`list()` envelope) |
| POST | `/suppliers/:id/suspend` · `/restore` | ☑ `{ note }` (required) |
| GET | `/needs-action?kind&page` | ☑ The list above (`list()` envelope); kinds `late · cant_ship · came_back · problem · refund · split · vendor_balance` |
| GET | `/payouts?page` | ☑ Split payouts (`list()` envelope) |
| POST | `/needs-action/:supplierOrderId/resolve` | ☑ `{ note }`: marks it resolved, a held line goes back to pending, the seller is told a problem was resolved |
| POST | `/supplier-orders/:id/status` | ☐ Force a transition, `{ to, note }` — not built (D-37) |

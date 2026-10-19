# Admin

> **Read when:** working on admin screens or endpoints for dropshipping.
> **Update when:** they change.

Status: ☐ planned. Suppliers: Phase 2. Needs action: Phase 4.

## Screens (`frontend/src/admin`)

- **Suppliers:** every supplier with its store, linked sellers, status and join
  date. **Suspend** / **Restore** with a note. Suspending pauses every copy of
  its products (SU-8).
- **Needs action:** one list with a filter by kind:
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

## API: `/api/v1/dropship/admin` ☐

`requireAdmin` (and the admin CSRF check the admin subtree already carries).

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/suppliers?status&page` | Supplier list |
| POST | `/suppliers/:id/suspend` · `/restore` | `{ note }` |
| GET | `/needs-action?kind&page` | The list above |
| POST | `/needs-action/:supplierOrderId/resolve` | `{ note }` |
| POST | `/supplier-orders/:id/status` | Force a transition, `{ to, note }` |

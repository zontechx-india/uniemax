# Phase 7: Later (not in the MVP)

> Pick from this list after MVP feedback. Each item becomes its own phase file
> when chosen. The seams already in the design are noted.

| Item | Why it waits | Seam already there |
| --- | --- | --- |
| Hold COD orders for the seller's OK before the supplier ships (call-to-confirm) | First candidate if COD parcels come back often | A link option + one status before `NEW` |
| Net COD balances against the supplier's prepaid balance | Needs Easy Split live (Phase 6) | Easy Split adjustments: `DEBIT` supplier vendor, `CREDIT` seller vendor |
| Automatic returned-parcel fee on `SPLIT` orders | Phase 6 records it on the statement | An adjustment from the seller's vendor to the supplier's |
| Scheduled terms changes ("from tomorrow") | Immediate changes + snapshots cover the MVP (D-18) | `TermsChange` + an effective-from time |
| Per-seller prices for sellers | One price is enough to start | `SupplyVariant.cost` → a per-link override (snapshotted the same way) |
| Auto-add a supplier's new products to the seller's store | Sellers add by hand at first | A link option + `resale.add` |
| Public supplier catalogue (any seller can find a supplier), with admin approval | D-3: sellers bring suppliers | `Supplier.visibility`, `inviteNeedsAdminApproval` |
| Partial cancel / customer returns | Needs core partial refunds | Supplier orders are already per part; Split Refund takes per-vendor amounts |
| Courier integration: live status, auto tracking, COD remittance | Extra moving parts | The parcel rules stay; only where tracking comes from changes |
| WhatsApp / SMS tracking messages to customers | Customer WhatsApp is a future item in `CONTEXT.md` | The parcel notification is one place |
| Proof of delivery as PDF | No PDF upload kind yet (`mediaRules`) | Add a `document` media kind |
| Supplier reliability on cards (dispatch time, on-time rate) | Needs order history | `SupplierOrder` timestamps |
| Weight- or zone-based supplier shipping fees | A flat fee per order is enough to start | `Supplier.shippingFee`, snapshotted per order |
| Wholesale mode (the seller buys stock up front) | Not what was asked (D-1) | Same supplier and supply tables |
| GST tax invoices | Q-2; no GST support yet | — |

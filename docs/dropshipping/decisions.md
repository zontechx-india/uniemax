# Decisions and open questions

> **Read when:** you need to know why something is designed the way it is, or
> what is still open. **Update when:** a decision is made or changed. Add a
> row; never rewrite history. Mark a replaced row "Replaced by D-n".

## Decided

| # | Date | Decision | Why / source |
| --- | --- | --- | --- |
| D-1 | 2026-10-19 | The supplier ships straight to the customer. The seller never holds stock. | Client chose option 1. |
| D-2 | 2026-10-19 | The supplier or brand name may be shown to customers. A supplier's parcel shows "Shipped by {supplier}". No white-label rules. | Client: "no issue on sharing Supplier or Brand Name". It matches the courier label. |
| D-3 | 2026-10-19 | Sellers bring their own suppliers by invitation. A supplier is visible only to the sellers it is linked to. A public supplier catalogue is Phase 7. | Product owner. |
| D-4 | 2026-10-19 | Every supplier parcel needs a courier and tracking number, sent to the customer the moment it ships. Proof of delivery (a photo) is optional. | Client wants the tracking (POD) number for every parcel, given to the customer in advance. Product owner made proof of delivery optional. |
| D-5 | 2026-10-19 | The seller decides **per supplier** whether cash on delivery is offered, when inviting. Editable later. | Product owner: "make it flexible; the seller tells the vendor whether COD is required". |
| D-6 | 2026-10-19 | Parcel tracking is a **core** feature for every order (`OrderShipment`), not only for dropship. Sellers get it for their own parcels too. | Orders have no tracking field today (`core.prisma`). Tracking belongs to the order the customer sees. |
| D-7 | 2026-10-19 | Invited suppliers need no admin approval. Admins can suspend them. | The seller vouches for a supplier they brought. Config `inviteNeedsAdminApproval` can flip this. |
| D-8 | 2026-10-19 | A supplier is a store: its existing one, or a supply-only store created when it joins. | Reuses the product editor, photos, stock and address. |
| D-9 | 2026-10-19 | The seller's copy of a supplier product is a real `StoreProduct`. | Storefront, cart, checkout, search, SEO and share links work unchanged. |
| D-10 | 2026-10-19 | The customer order is never split. Supplier orders sit beside it. | Checkout and payment code stay unchanged. |
| D-11 | 2026-10-19 | The supplier's stock is the only real stock. It is reserved and released inside the core's own transactions. | No overselling, and nothing depends on an event that could be lost. |
| D-12 | 2026-10-19 | By default the seller's price follows the supplier's price, so their earnings stay the same. It never goes above MRP. The seller can switch to a fixed price. | Sellers never lose money silently, and products don't pause on a price rise. |
| D-13 | 2026-10-19 | Cash on delivery only when the whole order ships as **one parcel**. | The courier collects exactly the order total; no split cash amounts. |
| D-14 | 2026-10-19 | Built as `package/dropship`, the same way as `package/affiliate`: its own schema, no foreign key to core, a host interface, hooks and events. | Keeps core changes small and generic. |
| D-15 | 2026-10-19 | Production stays off (`DROPSHIP_ENABLED=false`) until Phase 5 is done. Phase 0 ships to production on its own. | Phases 2–4 alone would leave sellers with half a feature. |
| D-16 | 2026-10-20 | **Money (was P-1).** Prepaid orders will be split by **Cashfree Easy Split** through PaymentHub: the supplier's share goes to the supplier, the rest to the seller. The in-house payout system is on hold. Until Easy Split is live, money settles **directly** between the seller and the supplier, using the shared statement. COD always settles directly, because the cash never reaches Cashfree. Each supplier order records how it settles (`settleVia`) when it is placed. | Product owner: "we will implement Cashfree split… go with your recommendation… payout system on hold… working with Cashfree to enable it". Cashfree docs checked 20 Oct 2026 ([money](money/context.md)). |
| D-17 | 2026-10-20 | **Returned-parcel fee (was P-2) is configurable per seller–supplier link.** The seller sets who pays the supplier's shipping fee when a parcel comes back (*I pay* / *Supplier bears it*), when inviting. Editable later. | Product owner: sellers may have their own deal with the supplier. |
| D-18 | 2026-10-20 | **Terms are snapshotted at booking.** Placement copies every term onto the supplier order and its lines: prices, shipping fee, COD, returned-parcel fee, ship-within, returns, platform fee, `settleVia`. Every later step reads only that copy, never the current settings. A change affects orders placed after it. Every change is logged. | Product owner: "if the user ordered yesterday, yesterday's fee applies; not the current status". See [terms](terms/context.md). |
| D-19 | 2026-10-20 | A supplier can also pause or end supplying a seller, not only the seller. | Fairness once the seller can change terms (D-17). |
| D-20 | 2026-10-20 | **There is a platform fee** on orders with supplier products (was Q-1). Default: a percentage of the order total, taken from the **seller's** share; the supplier always gets its agreed `supplierShare`. The rate is a config value (Q-5), snapshotted on every supplier order (D-18). It never changes the seller–supplier balance. | Product owner: "yes, there is a platform fee". Whose share and the form (% of total) follow the recommendation the product owner accepted. |
| D-21 | 2026-10-20 | Cashfree holds each vendor's money **12 days** (Defer Settlement) before paying out (was Q-3). | Product owner accepted the suggestion: longest ship-within (7) + typical transit (~5). |
| D-22 | 2026-10-20 | Every store's own payouts move to Easy Split; **each store is a Cashfree vendor** (was Q-4). | Product owner: yes. |
| D-23 | 2026-10-20 | D-16 is read as confirmed: until Easy Split is live, prepaid supplier orders settle **directly** between the seller and the supplier. | Product owner: "yes, implement your suggestion". |
| D-24 | 2026-10-20 | **No guessed tracking links.** A parcel links to its tracking only through a link the seller pasted; otherwise the customer copies the number and opens the courier's own website. The courier list carries websites, not per-number URL templates. | Building Phase 0: none of the couriers' direct tracking URLs could be confirmed on their own sites (JavaScript pages, OTP, captcha) — a wrong link is worse than none. |
| D-25 | 2026-10-20 | **"Came back" doesn't ask about stock.** The parcel's items stay with the order; the seller sends it again (stock untouched) or cancels — and the cancel asks whether the returned items go back in stock. | Building Phase 0: a parcel returned for a wrong address must be sendable again, and asking at cancel time keeps stock from ever being counted twice. Replaces the "restock choice on came back" in the first plan. |
| D-26 | 2026-10-20 | **Pickup is restricted through the `checkout.options` hook**, not a per-product `pickupAvailable` column. The hook answers per cart with the reason the shopper sees, for COD and pickup alike. | Building Phase 1: one seam covers both options and the multi-parcel COD rule (D-13), with no core schema for a package concern. |

## Open questions

| # | Question | Needed by | Status |
| --- | --- | --- | --- |
| Q-1 | Is there a platform fee on supplier sales? | — | Answered 2026-10-20 → D-20 |
| Q-2 | Once GST support lands, who issues the customer's tax invoice? Presumably the seller. | Phase 7 | Open |
| Q-3 | How many days should Cashfree hold each vendor's money? | — | Answered 2026-10-20 → D-21 |
| Q-4 | Will every store's own payouts go through Easy Split? | — | Answered 2026-10-20 → D-22 |
| Q-5 | What is the platform fee **rate** (e.g. 2 % of the order total)? Is it the same fee UnieMax will charge on every store order? | Before production (end of Phase 5) | Open. Built as a config value, so the number can come later. |

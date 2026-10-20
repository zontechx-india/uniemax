# Architecture

> **Read when:** creating or changing any file in `backend/src/package/dropship`,
> the core hooks or events, config, the feature flag or background jobs.
> **Update when:** the layout, host interface, hooks, events, config or jobs
> change.

Status: ◐ core seams built (Phase 1, 20 Oct 2026); the package itself is planned

## Code facts this design relies on (checked 19 Oct 2026)

| Fact | Where | What it means here |
| --- | --- | --- |
| Placement decrements stock and creates the order and its items in one interactive transaction. | `modules/orders/orders.service.ts` (placement `$transaction`) | The supplier's stock can be reserved in that same transaction. |
| If the gateway refuses to open a payment, the order is deleted and its stock returned in a second transaction. No event fires. | `orders.service.ts` (gateway undo) | Needs the `order.unplacing` hook, or the supplier's stock leaks. |
| Seller cancel (`cancelOrder`) and customer cancel (`cancelMyOrder`) restock inside their transaction, then emit `order.cancelled`. `cancelOrder` refuses `SHIPPED` and `DELIVERED`. | `orders.service.ts` | The supplier's stock is released in the same transaction (`order.cancelling`). |
| `updateOrderStatus` is forward-only and guarded (`where status = current`). It marks COD orders `PAID` on `DELIVERED`. | `orders.service.ts` | Parcel-driven status must keep the COD-paid rule. |
| Unpaid online orders are **never** cancelled automatically. The payment sweep only settles. | `modules/payments/payments.jobs.ts`, `PRODUCTION_READINESS.md` | Dropship releases a supplier's stock from abandoned checkouts itself. |
| Cancelling a paid order only sets `REFUNDED`. The money is returned by hand from the gateway dashboard. | `cancelOrder` comment, `CASHFREE_PAYMENTS.md` | Admin needs a **Refunds to make** list. |
| Online payments settle to the platform. There are no seller payouts and no ledger. The in-house payout work is on hold in favour of Cashfree Easy Split (D-16). | `PRODUCTION_READINESS.md` (S1) | Money settles directly until Easy Split is live (Phase 6). |
| UnieMax takes payments through PaymentHub, which owns the Cashfree account. | `modules/payments/paymenthub.*`, `CASHFREE_PAYMENTS.md` | Easy Split calls go through PaymentHub, never straight from the package. |
| `codAvailable = false` on any line removes COD from that checkout, naming the products. | `orders.service.ts` (COD rule) | Copies mirror the link's COD setting into `codAvailable`. |
| Store shipping modes: `DELIVERY`, `PICKUP`, `BOTH`. COD needs the store's `payments.acceptCod`. | `modules/stores/stores.schema.ts` | Pickup-only stores and stores without COD are handled in place. |
| SKUs are unique within a store. | `storeCatalog.service.ts#assertSkusFree` | Copies never take the supplier's SKU. |
| "Duplicate product" creates an unlinked draft. | `storeCatalog.service.ts#copyProduct` | Duplicating a copy is refused. |
| Sized image versions render on first request. | `modules/media/media.service.ts` | Copying a photo means copying only the original object. |
| Upload kinds are `image`, `video` and `logo`. There is no PDF kind. | `package/storage/config.ts` (`mediaRules`) | Proof of delivery is a photo in the MVP. |
| Since Phase 0, orders have parcels (`OrderShipment`): sending one emails the customer the courier + tracking (`notifyParcelShipped`). Status changes go through `writeStatusChange` / `announceStatusChange`. | `modules/orders/shipments.service.ts`, `orders.service.ts`, `orders.notifications.ts` | Phase 1 hooks plug into these; supplier parcels reuse them. |
| `NotificationKind` has no dropship value; `AFFILIATE` shows the pattern. | `prisma/schema/core.prisma`, `package/affiliate/hosts/inProcess.ts` | Add `DROPSHIP`. |
| Support tickets go to `PLATFORM` or `STORE`, with category `ORDERS` available. | `core.prisma` (`SupportRecipient`, `SupportTicketCategory`) | "Report a problem" opens a `PLATFORM` / `ORDERS` ticket. |
| The affiliate package is self-contained, and its endpoints are listed in `API.md`. | `package/affiliate/README.md`, `docs/API.md` | Same packaging. `API.md` gets only a pointer section here (README rule 4). |

## Package layout ☐

```
backend/src/package/dropship/
  index.ts        registerDropship(app, { prisma, host }) — the only import the app makes
  types.ts        DropshipHost + DTO shapes
  config.ts       all knobs (below)
  deps.ts         injected prisma + host
  domain.ts       pure rules: transitions, money, follow-price, COD rule, margin — no I/O
  hooks.ts        registers the core hooks
  events.ts       async subscribers + the hourly job
  hosts/inProcess.ts
  services/
    invites.ts         create · resend · revoke · preview · accept
    suppliers.ts       profile · links (COD, pause, end) · suspend
    supply.ts          offer/withdraw products · prices for sellers · bulk
    catalog.ts         seller browse
    resale.ts          add (one or many) · refresh · remove · follow · sync
    supplierOrders.ts  reserve · unplace · release · new · expire · confirm · ship · deliver · came back · can't ship · problem
    terms.ts           current terms · change log · notices
    statement.ts       lines · states · settlements · balance
    payouts.ts         Easy Split requests · retries · fallback to DIRECT (Phase 6)
    reconcile.ts       repairs anything an event missed
  routes/  seller.ts · supplier.ts · invite.ts · admin.ts   (/api/v1/dropship)
backend/prisma/schema/dropship.prisma
frontend/src/packages/dropship/   (same shape as frontend/src/packages/affiliate)
```

Rules (as in `package/affiliate/README.md`):
- Nothing in the package imports a core module except `hosts/inProcess.ts`.
  Allowed shared imports: `utils/*`, `package/auth`, `package/events`,
  `package/storage`, and the generated Prisma client.
- Prisma is injected through `deps`.
- No foreign key from `dropship.*` to `public.*`. Ids are plain strings.
- Every event handler and job step is idempotent.
- `domain.ts` is pure, so every money, status and price rule is unit-tested there.

## Core changes, by phase ◐

Each is generic: nothing in the core names dropshipping. Once built, each is
documented in the main doc the root `CLAUDE.md` names, and this table links to it.

| Change | Phase | Main doc when built |
| --- | --- | --- |
| ☑ `OrderShipment` (parcels): ship with tracking, delivered with optional proof photo, came back; tracking in customer notifications | 0 | ☑ written to `BACKEND_CONTEXT.md`, `API.md`, `FRONTEND_CONTEXT.md` |
| ☑ `package/events/hooks.ts` + hook calls in orders, checkout and catalog | 1 | ☑ `BACKEND_CONTEXT.md` (Package seams) |
| ☑ Catalog events | 1 | ☑ `BACKEND_CONTEXT.md` (Package seams) |
| ☑ `OrderItem.fulfilledBy` + parcel-driven `SHIPPED` / `DELIVERED` | 1 | ☑ `BACKEND_CONTEXT.md` (OrderShipment), `API.md` |
| ☑ System actions: `confirmOrderAsSystem`, `cancelOrderAsSystem`, `*PackageShipment*` | 1 | ☑ `BACKEND_CONTEXT.md` (Package seams) |
| ☑ `NotificationKind.DROPSHIP` (migration `20261020150000_package_seams`) | 1 | ☑ `BACKEND_CONTEXT.md` |
| `API.md` pointer section + `DROPSHIP_ENABLED` in `backend/README.md` | 2 | `API.md`, `backend/README.md` |
| Easy Split (payments track): a Cashfree vendor per store, split after payment, Defer Settlement, split refunds, adjustments, all in PaymentHub + `modules/payments` | 6 | `CASHFREE_PAYMENTS.md`, `API.md`, PaymentHub docs |

## Hooks (`package/events/hooks.ts`) ☑ (built Phase 1 — the built signatures)

Synchronous hooks that run **inside the core's transaction** and can veto by
throwing `HttpError`. With nothing registered they do nothing.

```ts
export interface AppHooks {
  /** Inside the placement transaction, after the order and its items exist. */
  "order.placing": (tx: Tx, orderId: string) => Promise<void>;
  /** Inside the gateway-undo transaction, before the order is deleted. */
  "order.unplacing": (tx: Tx, orderId: string) => Promise<void>;
  /** Inside cancelOrder / cancelMyOrder, before commit. */
  "order.cancelling": (tx: Tx, orderId: string) => Promise<void>;
  /** Checkout quote and placement: hide COD or pickup, with the reason shown to the shopper. */
  "checkout.options": (storeId: string, lines: CheckoutLine[]) => Promise<{ cod?: string | null; pickup?: string | null }>;
  /** Before a product or variant save in the editor (veto only). */
  "product.saving": (productId: string, change: ProductChange) => Promise<void>;
}
export function hook<K extends keyof AppHooks>(name: K, fn: AppHooks[K]): void;
export async function runHooks(name, ...args): Promise<void>;          // every hook but checkout.options
export async function checkoutRestrictions(storeId, lines): Promise<{ cod: string | null; pickup: string | null }>; // first reason wins
// ProductChange = { kind: "update" | "options" | "variant" | "copy"; variantId?; input }  (the parsed body)
```

Pickup is restricted only through `checkout.options` — there is no per-product
`pickupAvailable` column (D-26).

Call sites: placement and gateway undo in `orders.service.ts`; `cancelOrder`
and `cancelMyOrder`; the checkout quote and placement; and, in
`storeCatalog.service.ts`, `updateProduct`, `replaceProductOptions`,
`updateVariant` and `copyProduct`.

## Events ☑ (built Phase 1)

Added to `AppEvents` in `package/events/index.ts` and emitted after commit:
- `"catalog.product.changed": { productId, deleted? }`
- `"catalog.variant.changed": { variantId, deleted? }`
- `"catalog.store.changed": { storeId }`: shipping settings, COD switch, or
  suspension by an admin.

Existing events used: `order.placed`, `order.paid`, `order.status`, `order.cancelled`.

## `DropshipHost` ☐

```ts
interface DropshipHost {
  getStore(storeId): Promise<StoreRef | null>;                 // name, logo, phone, address, suspendedAt, shipping mode, acceptCod
  getOwnedStore(customerId, storeRef): Promise<StoreRef>;      // 404 otherwise
  createSupplyStore(customerId, input): Promise<StoreRef>;     // unpublished store for a new supplier
  setStoreCod(storeId, on: boolean): Promise<void>;            // in-place COD switch on the invite sheet
  getProduct(productId): Promise<ProductSnapshot | null>;      // variants (price, MRP, stock, options), media, effective delivery rule
  createCopy(tx, storeId, input): Promise<{ productId; variantIds: Record<string, string> }>;
  updateCopies(changes: CopyChange[]): Promise<void>;          // options, stock, price, MRP, active, delivery rule, codAvailable; recomputes aggregates
  reserveStock(tx, variantId, qty): Promise<boolean>;          // conditional decrement
  releaseStock(tx, variantId, qty): Promise<void>;
  tagItems(tx, orderItemIds: string[], tag: "dropship"): Promise<void>; // OrderItem.fulfilledBy
  copyMedia(fromKey, toStoreId, toProductId): Promise<string>; // storage get + put, new key
  getOrder(orderId): Promise<OrderSnapshot | null>;
  createShipment(input): Promise<string>;                      // core parcel, source PACKAGE; notifies the customer
  updateShipmentTracking(shipmentId, tracking): Promise<void>;
  markShipmentDelivered(shipmentId, podKey?): Promise<void>;
  markShipmentReturned(shipmentId): Promise<void>;
  confirmOrder(orderId): Promise<void>;                        // CONFIRMED as system
  cancelOrder(orderId, reason): Promise<void>;                 // as system
  openTicket(input): Promise<string>;                          // PLATFORM / ORDERS support ticket
  splitLive(): boolean;                                        // Easy Split enabled on the platform (Phase 6)
  getPayoutAccount(storeId): Promise<{ active: boolean } | null>; // the store's Cashfree vendor, via payments
  requestSplit(orderId, entries: { storeId; amount }[], idempotencyKey): Promise<SplitResult>; // core payments → PaymentHub
  notify(customerId, n): void;                                 // kind DROPSHIP
  sendMail(m): Promise<void>;
  webUrl: string | null;
}
```

## Config (`package/dropship/config.ts`) ☐

Every key can be overridden by env (document new env vars in `backend/README.md`).

| Key | Default | Meaning |
| --- | --- | --- |
| `DROPSHIP_ENABLED` (env) | `false` | Registers the package. On in dev from Phase 2, in production after Phase 5. |
| `DROPSHIP_SPLIT` (env) | `false` | New prepaid supplier orders may be `SPLIT` (only while `host.splitLive()` and both payout accounts are active). Lets store payouts move to Easy Split before dropship does. Phase 6. |
| `inviteExpiryDays` | 14 | How long an invite link works |
| `inviteNeedsAdminApproval` | `false` | D-7 |
| `unpaidHoldHours` | 2 | How long an unpaid online checkout holds the supplier's stock |
| `confirmReminderHours` | 24 | Reminder to a supplier who hasn't opened a new order |
| `shipWithinDaysMax` | 7 | Longest "ship within" a supplier may choose |
| `owedFallbackDays` | 15 | Shipped but never marked delivered → counts as owed |
| `customerDataDays` | 30 | After a parcel closes, the supplier stops seeing the customer's phone and address |
| `platformFeePct` | 0 | Platform fee, % of the order total, from the seller's share (D-20). Set the real rate (Q-5) before production. |
| `minMarginWarnPct` | 10 | Earnings below this turn amber on the add sheet |
| `suggestedMarkupPct` | 30 | Suggested price when the supplier has no shop price |
| `jobIntervalMs` | 3 600 000 | Hourly job |

## Hourly job and self-healing ☐

Runs every `jobIntervalMs`, and 10 s after boot (as in affiliate). Every step
is idempotent:
1. **Expire** unpaid parts older than `unpaidHoldHours` (release stock).
2. **Reminders:** a new order not confirmed after `confirmReminderHours`; a
   parcel not shipped by `shipBy` (late flag).
3. **Statement:** parts delivered, or shipped more than `owedFallbackDays` ago, become owed.
   **Splits** (Phase 6): retry splits still `REQUESTED` / `FAILED`, and raise PS-3 near the window's end.
4. **Privacy:** hide customer phone and address on parts closed more than `customerDataDays` ago.
5. **Reconcile:** paid orders whose parts are still `AWAITING_PAYMENT` /
   `EXPIRED`; cancelled orders with open parts; stock mirrors and copy state.

| # | What goes wrong | Solution |
| --- | --- | --- |
| S-1 | An async event handler fails (the in-process bus is fire-and-forget). | Stock-critical steps run inside the core's transactions through hooks. The job repairs the rest (step 5). |
| S-2 | The server restarts mid-job. | Every step is idempotent and runs again 10 s after boot. |
| S-3 | Mail or push fails. | Best effort. The in-app notification list and the supplier's inbox are the source of truth. |
| S-4 | A core store or product is deleted. | No foreign keys to core. Rows keep their snapshots; sync marks copies `SOURCE_REMOVED`. |

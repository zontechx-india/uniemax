# UnieMax — Production Readiness: Feature Gap Analysis

> What still has to be built before this platform can take real money from real
> customers on behalf of real sellers. Scope of this review, as requested:
> **review system · support · failure cases (payment failure especially) ·
> customer side · seller side**.
>
> Reviewed against the code, not the roadmap: every "today" statement below was
> verified in `backend/src` / `frontend/src` on **5 Aug 2026**.
> Companion docs: [CONTEXT.md](./CONTEXT.md) (spec) ·
> [BACKEND_CONTEXT.md](./BACKEND_CONTEXT.md) · [API.md](./API.md) ·
> [CASHFREE_PAYMENTS.md](./CASHFREE_PAYMENTS.md) ·
> [`IMPROVEMENTS.md`](../IMPROVEMENTS.md) (UI/UX backlog — different concern).

---

## 0. Executive summary

The platform is **feature-complete for browsing, cataloguing, ordering and
fulfilling**. It is **not complete for operating a marketplace**: money arrives
but never leaves, failures have no owner, and neither buyer nor seller has a way
to raise a problem.

| Area | State today | Production verdict |
| ---- | ----------- | ------------------ |
| Catalog, storefront, cart, checkout | Live, deep | ✅ Ready |
| Order placement + seller fulfilment | Live (confirm→pack→ship→deliver, cancel) | ✅ Ready |
| COD payments | Live end-to-end | ✅ Ready |
| Online payments (Cashfree) | Live: session, webhook, reconcile, retry | ⚠️ Ready to **charge**, not to **resolve** |
| **Refunds** | Status flip only — no API call, no record | 🔴 **Blocker** |
| **Seller payouts / settlement** | Bank accounts collected; **no money movement at all** | 🔴 **Blocker** |
| **Stranded-payment recovery** | Only on page-visit; no background job | 🔴 **Blocker** |
| **Review & rating system** | Does not exist (deliberately, no fake stars) | 🟠 Required for launch credibility |
| **Support / dispute handling** | `/support` + `/contact` are "coming soon" pages | 🔴 **Blocker** (gateway + consumer-law requirement) |
| Customer post-order self-service | History only — no cancel, no track, no return, no invoice | 🟠 High |
| Shipping charges | Hardcoded ₹0 (`orders.service.ts:294`) | 🟠 High |
| Legal/policy pages | Optional external URLs in the footer only | 🔴 **Blocker** |
| Guest order tracking (phone+OTP) | Spec'd in CONTEXT.md, never built | 🟡 Medium |

**Three things make this un-launchable today, in order:**

1. **Money can come in but cannot go out.** Online payments settle into the
   UnieMax Cashfree merchant account. There is no ledger, no commission, no
   payout run — `grep -r "payout|settlement|commission|ledger"` over
   `backend/src` returns only comments and the bank-account CRUD. Every online
   sale is currently an IOU the platform has no system to honour.
2. **Refunds are a manual dashboard action** with no record in our database
   (`payments.service.ts` has no refund call; `cancelOrder` flips
   `paymentStatus: REFUNDED` and nothing else). A cancelled paid order tells the
   customer "refund on the way" by email while nothing has actually been
   initiated.
3. **Nobody can complain.** No support channel, no dispute path, no admin lever
   over a paid order. When (not if) the first payment goes wrong, the platform
   has no mechanism to make the customer whole.

---

# 1. Review & Rating System

## 1.1 What exists today

Nothing — and that is a deliberate, correct decision that must now be closed
out. The platform's rule ("never fabricate stars") is honoured in two places:

| Surface | Current behaviour | File |
| ------- | ----------------- | ---- |
| Marketplace store card | `StoreRating` renders muted outline stars + "No reviews yet" | [HomePage.tsx](../frontend/src/storefront/pages/HomePage.tsx) |
| Product page | No rating block at all; the section "arrives with the feature" | [StoreProductPage.tsx](../frontend/src/storefront/pages/store/StoreProductPage.tsx) |
| Listing filters | Rating filter shown as **"Soon"** | [FilterPanel.tsx](../frontend/src/storefront/features/publicStore/FilterPanel.tsx) |
| Sorting | "Popular" / "Best Selling" exist but await order data | [ListingControls.tsx](../frontend/src/storefront/features/publicStore/ListingControls.tsx) |

There is **no `Review` model** in `prisma/schema.prisma` (36 models, none of
them reviews), no endpoint, no moderation surface.

## 1.2 Why it is required for production, not "nice to have"

- A store-discovery homepage whose primary trust signal is a permanently empty
  star slot actively depresses conversion — it reads as "nobody has ever bought
  here".
- Three UI slots are already cut for it (store card, product page, rating
  filter). They are dead pixels until the feature lands.
- Merchandising rows "Popular" and "Best Selling" have no signal to rank by.
- Admin moderation of sellers currently has one lever (hide a listing) with no
  evidence trail. Reviews are the evidence.

## 1.3 What must be built

### Data model (new)

```prisma
enum ReviewStatus { PUBLISHED  PENDING_MODERATION  HIDDEN }

model ProductReview {
  id          String   @id @default(cuid())
  storeId     String                       // denormalised: store-level aggregates
  productId   String
  customerId  String
  orderItemId String   @unique             // ← the verified-purchase proof
  rating      Int                          // 1..5, enforced in the service
  title       String?
  body        String?
  status      ReviewStatus @default(PUBLISHED)
  hiddenReason String?                     // admin moderation note
  sellerReply     String?                  // one reply per review
  sellerRepliedAt DateTime?
  helpfulCount Int     @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([customerId, orderItemId])      // one review per purchased line
  @@index([productId, status])
  @@index([storeId, status])
}

model ReviewMedia {                        // up to 3 photos per review
  id       String @id @default(cuid())
  reviewId String
  key      String                          // package/storage object key
  @@index([reviewId])
}
```

**Denormalised aggregates** (same rationale as `priceMin`/`stockTotal` in
`StoreProduct` — the storefront must sort/filter in SQL, never in memory):

- `StoreProduct.ratingAvg Decimal(2,1)?` + `ratingCount Int @default(0)`
- `Store.ratingAvg Decimal(2,1)?` + `ratingCount Int @default(0)`

Maintained by a `recomputeReviewAggregates(productId, tx)` helper mirroring
[`catalogSlug.ts#recomputeProductAggregates`](../backend/src/modules/stores/catalogSlug.ts),
committed in the same transaction as the review write.

### Rules (the ones that decide whether reviews are trustworthy)

1. **Verified purchase only.** A review requires an `OrderItem` belonging to the
   customer, on an order whose `status = DELIVERED`. This kills the entire class
   of fake-review abuse without needing a moderation team on day one.
2. **One review per purchased line** (`@@unique([customerId, orderItemId])`), so
   buying twice earns two reviews and no more.
3. **Editable for 30 days**, then frozen. Edits reset `status` to
   `PENDING_MODERATION` only if the store is flagged; otherwise publish
   immediately (moderate-on-report, not moderate-on-write — a review queue that
   nobody drains is worse than none).
4. **Seller may reply once, never delete.** Replies are public and attributed.
5. **Admin may hide with a required reason** — the exact shape of the existing
   product-moderation lever (`PATCH /admin/catalog/products/:id/visibility`), so
   there is one moderation idiom in the system, not two.
6. **Aggregates hide below a floor.** Show "New" rather than "5.0 ★ (1)" until
   `ratingCount >= 3`; a single 5-star from the seller's cousin is not a rating.

### API surface (new)

| Method | Path | Guard | Purpose |
| ------ | ---- | ----- | ------- |
| `GET` | `/public/stores/:slug/products/:productSlug/reviews` | none | Paginated, sorted (recent / helpful / rating) + histogram |
| `GET` | `/orders/reviewable` | customer | Delivered lines not yet reviewed — powers the "Rate your purchase" prompt |
| `POST` | `/orders/:orderId/items/:itemId/review` | customer | Create (verified-purchase check) |
| `PATCH` | `/reviews/:id` | customer | Edit within 30 days |
| `DELETE` | `/reviews/:id` | customer | Own review |
| `POST` | `/reviews/:id/helpful` | customer | Vote (idempotent per customer) |
| `POST` | `/reviews/:id/report` | customer | Flag → moderation queue |
| `POST` | `/stores/:id/reviews/:reviewId/reply` | customer (owner) | Seller reply |
| `GET` | `/stores/:id/reviews` | customer (owner) | Seller's review inbox |
| `GET` | `/admin/reviews` · `PATCH /admin/reviews/:id/visibility` | admin | Moderation |

Add `rating` to the existing sort enum in `GET /public/stores/:slug/products`
and make the rating filter in `FilterPanel` live.

### UI surfaces

- **Product page** — rating summary + histogram under the purchase card, review
  list with photos, "Write a review" CTA when the visitor has a reviewable line.
- **Store card / store header** — real stars replacing `StoreRating`'s
  placeholder; the component already lights up "unchanged the moment the API
  returns `rating`/`reviewCount`".
- **`/orders`** — a "Rate your purchase" row on delivered orders.
- **Seller → Reviews section** (new left-nav entry under Overview) — list,
  reply, average, trend.
- **Admin → Reviews page** — reported queue, hide/restore with reason.
- **Post-delivery email + push** — `NotificationKind.REVIEW_REQUEST`, sent
  3 days after `deliveredAt`, from the same `orders.notifications.ts` fan-out.
  ⚠️ This needs the scheduler that §3.6 also needs.

**Sizing:** M–L (~6–9 dev-days full stack, including moderation + aggregates).

---

# 2. Support System

## 2.1 What exists today

| Surface | Reality |
| ------- | ------- |
| `/support`, `/contact`, `/about`, `/privacy`, `/terms` | **Placeholder pages** — `InfoComingSoonPage` ([router.tsx:31](../frontend/src/storefront/app/router.tsx)) |
| Store footer "Customer support" block | Static seller-entered email/phone/WhatsApp/hours (`footer.support`) |
| Store policies | Optional **external URLs** the seller may paste; no policy pages exist |
| Order page | No "contact seller", no "report a problem" |
| Admin console | No support inbox, no dispute view, no customer-facing action |
| Notification system | One-way only — nobody can reply to a notification |

So: a customer whose payment was debited but whose order says PENDING has
**no path** to a human. Their only options are the seller's phone number, if
that seller filled it in.

## 2.2 Why this is a hard blocker (not a UX nicety)

- **Payment-gateway compliance.** Cashfree (and RBI's merchant guidelines)
  require a live merchant site to publish: contact details, Terms & Conditions,
  Privacy Policy, **Refund & Cancellation Policy**, and a grievance/support
  contact. Ours are "coming soon" pages. This is an account-review failure
  waiting to happen.
- **Consumer Protection (E-Commerce) Rules, 2020** require a marketplace to
  publish a grievance officer's name and contact, and to acknowledge complaints
  within 48 hours. Nothing in the system records a complaint at all.
- **Operational:** with refunds manual (§3), support *is* the refund mechanism.
  Without a ticket trail there is no way to prove a refund was requested,
  approved, or paid.

## 2.3 What must be built

### Tier 1 — Static, non-negotiable (S, ~1–2 days)

Replace `InfoComingSoonPage` for the five paths with real content:

- `/terms`, `/privacy`, `/refund-policy`, `/shipping-policy` — platform-level,
  authored once (currently the *seller* is expected to supply URLs; the
  **platform** also needs its own, since the platform is the merchant of record
  at Cashfree).
- `/contact` — grievance officer, address, email, response-time commitment.
- `/support` — a real help centre entry point (below).

Seller-level policy links stay as they are: they layer on top, they do not
replace the platform's.

### Tier 2 — Support requests with a trail (M, ~4–6 days)

```prisma
enum TicketKind   { ORDER_ISSUE  PAYMENT_ISSUE  REFUND_REQUEST  RETURN_REQUEST
                    SELLER_ISSUE  ACCOUNT  OTHER }
enum TicketStatus { OPEN  AWAITING_CUSTOMER  AWAITING_SELLER  ESCALATED
                    RESOLVED  CLOSED }

model SupportTicket {
  id          String @id @default(cuid())
  ticketNumber String @unique              // "SUP-XXXX", customer-quotable
  kind        TicketKind
  status      TicketStatus @default(OPEN)
  subject     String
  // Opaque principal, matching AuthSession / Notification / PushSubscription
  principalId String
  principalType PrincipalType              // CUSTOMER (buyer OR seller)
  orderId     String?                      // the single most useful join
  storeId     String?
  assignedAdminId String?
  firstResponseAt DateTime?                // SLA measurement
  resolvedAt  DateTime?
  createdAt   DateTime @default(now())
  @@index([principalId, status])
  @@index([orderId])
  @@index([status, createdAt])
}

model SupportMessage {
  id        String @id @default(cuid())
  ticketId  String
  authorType PrincipalType                 // CUSTOMER | ADMIN
  authorId  String
  authorEmail String                       // snapshot, like AdminAuditLog
  body      String
  attachmentKeys String[]                  // package/storage keys
  internal  Boolean @default(false)        // admin-only note
  createdAt DateTime @default(now())
  @@index([ticketId])
}
```

**Entry points (this is what makes it used rather than decorative):**

- **From an order** — "Need help with this order?" on `/orders`, on the order
  success page and on the seller's order detail. Pre-fills `orderId`, so 80% of
  tickets arrive with full context attached.
- **From the payment-failure state** — an unpaid/failed online order shows
  "Payment debited but order not confirmed? Tell us" beside **Pay now**. This is
  the single highest-value support entry point on the platform (§3.1).
- **From `/support`** — category picker → FAQ deflection → form.
- **Seller side** — a Support section in store management (payout not received,
  bank verification failed, listing hidden without explanation).

**Admin side** — a real inbox page (`/admin/support`): filter by status / kind /
age, assign, reply, internal notes, escalate, resolve. Every write already has
the right home: `AdminAuditLog` via `recordAudit()`.

**Notification wiring** — reuse `notify()`: new
`NotificationKind.SUPPORT` for ticket created / replied / resolved, so the
existing bell + push + email fan-out carries it with no new channel code.

### Tier 3 — Deflection & self-serve (M, later)

FAQ/help articles (a `HelpArticle` model or flat MDX), order-status self-serve
answers ("Where is my order?" answered from the lifecycle timestamps the order
already carries), and canned responses for admins.

**Sizing:** Tier 1 = S (blocker, do first). Tier 2 = M. Tier 3 = M.

---

# 3. Failure Cases

This is the deepest gap and the one that costs real money. The happy path is
well engineered; the unhappy paths are partly engineered and partly absent.

## 3.1 Payment failure — what is already handled well

Credit where due, all verified in
[`payments.service.ts`](../backend/src/modules/payments/payments.service.ts):

| Failure | Handling | Verdict |
| ------- | -------- | ------- |
| Cashfree order registration fails at placement | Placement **rolled back** — stock restored, order deleted, `502` to the client (`orders.service.ts:379-393`) | ✅ Correct |
| Webhook never arrives | Reconcile fallback on every read of a PENDING/FAILED online order (`reconcilePendingPayment`) + success page polls every 4s ×8 | ✅ Good, but see 3.2 |
| Duplicate / replayed webhook | `markOrderPaid` uses a guarded `updateMany` on `paymentStatus in (PENDING, FAILED)` — idempotent | ✅ Correct |
| Webhook for the wrong amount | Compared against `Order.total` as `Prisma.Decimal`; mismatch is refused, never marked PAID | ✅ Correct |
| Payment failed at gateway | `PAYMENT_FAILED_WEBHOOK` → `FAILED`, order stays retryable; **Pay now / Retry** on the success page | ✅ Correct |
| Expired session on retry | Registers a fresh `orderNumber~R<n>` attempt (Cashfree order ids are one-shot) | ✅ Correct |
| Seller cancels while customer is paying | `voidPaymentSession` terminates the Cashfree order; a payment that still lands is **recorded, order stays cancelled**, refund-required emails to both sides | ✅ Genuinely well thought through |
| Forged webhook | HMAC-SHA256 over raw bytes, `timingSafeEqual` → 401 | ✅ Correct |
| Gateway hangs | 15 s timeout on every Cashfree call | ✅ Correct |

## 3.2 Payment failure — what is NOT handled 🔴

### F1. The stranded payment (highest-severity bug in the system)

**Scenario:** customer pays successfully → closes the browser tab before the
`return_url` redirect fires → the webhook also fails (network blip, our server
restarting during a pm2 deploy, Cashfree retry exhaustion).

**Result today:** the order stays `PENDING` **forever**.

- Reconcile only runs when someone *loads* the order page or hits `/pay`
  (`getPublicOrder` → `reconcilePendingPayment`). Nobody does.
- Placement emails for gateway orders are **deferred until payment settles**
  (`orders.service.ts:400` — `if (!viaGateway) notifyOrderPlaced(...)`), so the
  customer receives **no email at all** and the seller receives **no new-order
  alert**.
- The money is in the Cashfree account. The stock is decremented. The seller
  sees a PENDING order they were never told about; the customer sees nothing.
- There is **no scheduler in the codebase** — `grep -r "setInterval|cron"` over
  `backend/src` returns nothing — so nothing will ever notice.

**Required:** a **payment reconciliation sweep** (see §3.6 for the runner):
every 5 minutes, take ONLINE orders with `paymentStatus in (PENDING, FAILED)`
and `placedAt` between 10 minutes and 24 hours ago, call
`reconcilePendingPayment(id)` on each. It is already written, idempotent and
safe — it just has no caller. **This is a ~30-line fix on top of the scheduler
and it closes a money-losing hole.**

### F2. Abandoned unpaid orders hold stock forever 🔴

Documented as a known gap in [CASHFREE_PAYMENTS.md](./CASHFREE_PAYMENTS.md) and
still true. A customer who reaches the hosted checkout and walks away leaves the
stock decremented until a *human seller* notices and cancels.

For a store with 3 of an item, three abandoned checkouts take the product off
sale indefinitely. This is a self-inflicted denial of service, reachable by an
ordinary user with no malice — and the rate limiter (10 orders/min) only slows
a deliberate attacker down.

**Required:** an **expiry sweep** — unpaid ONLINE orders older than 30 minutes
(configurable) → `voidPaymentSession` → cancel → restore stock → notify the
customer "your order expired, here's a link to re-order". Must run *after* the
reconcile sweep in the same tick, so a slow-but-successful payment is never
cancelled out from under a paying customer.

Add `OrderStatus.EXPIRED` (or a `cancelReason = "PAYMENT_TIMEOUT"` convention)
so the seller's Cancelled tab isn't polluted with orders they never touched.

### F3. Refunds are fiction 🔴

`cancelOrder` flips `paymentStatus: PAID → REFUNDED`
([orders.service.ts:703](../backend/src/modules/orders/orders.service.ts)) and
emails the customer that a refund is coming. **No refund is initiated.** There
is no `POST /pg/orders/{id}/refunds` call, no `Refund` record, no reconciliation
of refund status, no admin visibility into whether it happened.

The seller's dashboard counts it as "Refunded". The customer was told. The money
is still in the platform's account.

**Required (P0):**

```prisma
enum RefundStatus { INITIATED  PENDING  SUCCESS  FAILED }

model Refund {
  id          String @id @default(cuid())
  orderId     String
  amount      Decimal @db.Decimal(10,2)     // supports partial refunds
  reason      String?
  status      RefundStatus @default(INITIATED)
  cfRefundId  String? @unique
  refundRef   String?                        // our idempotency key at Cashfree
  initiatedBy String                         // seller id / admin id / "SYSTEM"
  failureNote String?
  createdAt   DateTime @default(now())
  settledAt   DateTime?
  @@index([orderId])
}
```

- `createRefund()` in `payments.service.ts` — `POST /pg/orders/{cfOrderId}/refunds`
  with a stable `refund_id` (idempotent by construction).
- Consume `REFUND_STATUS_WEBHOOK` in `processWebhook` (it is currently
  acknowledged and dropped: *"refund/settlement events we don't consume yet"*).
- Add a refund poll to the same sweep as F1 for refunds still PENDING.
- `Order.paymentStatus` becomes `REFUNDED` **only when the refund actually
  succeeds** — introduce `REFUND_PENDING` between them, so no email ever
  promises money that hasn't moved.
- **Admin refund lever**: today the admin console is deliberately read-only on
  orders. That is right for *fulfilment* and wrong for *money* — when a seller
  vanishes or refuses, the platform is the merchant of record and must be able
  to refund. Add `POST /admin/orders/:id/refund` (audited, reason required).

### F4. Webhook replay window unchecked 🟡

The signature covers `x-webhook-timestamp` but its freshness is never verified,
so a captured signed webhook replays indefinitely. Processing is idempotent,
which caps the damage — but combined with F3 (refund webhooks not consumed) it
becomes a real risk once refund events matter. Add the standard ±5 min
tolerance in `verifyWebhookSignature`. **~5 lines.**

### F5. Amount mismatch is logged and forgotten 🟠

A `PAYMENT_SUCCESS_WEBHOOK` whose amount ≠ `Order.total` is refused — correct —
but the only trace is `console.error`. Nobody is told. A customer who paid the
wrong amount (or a tampering attempt) leaves no operational signal.

**Required:** `notifyAdmins()` on mismatch + an admin "Payment exceptions" view.
`notifyAdmins` already exists in `modules/notifications`; this is a one-line
call into a system that is already built.

### F6. Cart is cleared before the gateway launch 🟠

[CheckoutPage.tsx:101-107](../frontend/src/storefront/pages/cart/CheckoutPage.tsx):

```ts
cart.clearStore(storeSlug)                       // ← cart gone
if (order.payment?.paymentSessionId) {
  await launchCashfreeCheckout(order.payment)    // ← if this throws…
}
navigate(`/order/${storeSlug}/${order.id}`)      // ← …this never runs
```

If the Cashfree JS SDK fails to load (ad-blocker, CDN blocked, offline), the
customer sees an inline error, has an **empty cart**, and is never navigated to
the order page — so they don't even have the link to retry payment. The order
exists and holds their stock.

**Required:** navigate to the order page **first** (or in a `finally`), and let
the order page own the payment launch. The order page already has the full
retry flow. This makes the success page the single owner of payment state, which
is the right shape anyway.

### F7. No idempotency on order placement ✅ fixed (Sep 2026)

`POST /public/stores/:slug/orders` has no idempotency key. A double-submit that
the disabled button doesn't catch (network retry, flaky mobile connection,
double-tap on a slow device) creates **two orders** and decrements stock twice.
The 10/min rate limit is an abuse control, not a correctness control.

**Required:** accept an `Idempotency-Key` header, store it on the order with a
unique index, return the existing order on replay.

**Done:** `Order.idempotencyKey` + unique `(customerId, idempotencyKey)`;
the checkout sends one UUID per visit and guards re-entrant clicks with a ref.
Covered by `backend/test/order-idempotency.test.mjs`.

### F8. `POST /pay` reconciles but the caller may never come back 🟡

Subsumed by F1's sweep, noted for completeness.

## 3.3 Order & stock failure cases

| Case | Today | Gap |
| ---- | ----- | --- |
| Item sold out between cart and checkout | Guarded `updateMany` decrement inside the transaction → `409` "just sold out" | ✅ Correct |
| Price changed between cart and checkout | Server re-prices every line; cart revalidation warns on open | ✅ Correct |
| Product deleted mid-order | `SetNull` + snapshots; cancel-restore skips missing variants | ✅ Correct |
| Store unpublished/suspended mid-checkout | `createOrder` requires `isPublished && suspendedAt: null` → 404 | ✅ Correct, but the message ("Store not found") is wrong for the situation |
| **Partial fulfilment** (2 of 3 items available) | Impossible — all-or-nothing | 🟠 Sellers will ask for it |
| **Partial cancellation / partial refund** | Not supported | 🟠 Pairs with the `Refund.amount` column above |
| **Seller cancels after shipping** (RTO) | Blocked — `SHIPPED`/`DELIVERED` cannot be cancelled | 🟠 Needs a returns flow, §5 |

## 3.4 Infrastructure failure cases

| Dependency | Failure behaviour | Verdict |
| ---------- | ----------------- | ------- |
| Resend (email) down | Fire-and-forget, never fails the order; console fallback without a key | ✅ Correct — but **silent**: nothing records that the confirmation never sent |
| Web Push service down | Feed row written first, push best-effort; 404/410 retires the endpoint; 5 failures disable it | ✅ Exemplary |
| S3 / storage down | Upload fails with an error the UI surfaces; product create still succeeds | ✅ Acceptable |
| Cashfree down at placement | Rollback + 502 | ✅ Correct |
| Cashfree down at webhook | Retries + reconcile fallback | ⚠️ Only if someone visits the page — see F1 |
| **Database down** | Prisma errors → 500 | ⚠️ No health-based readiness gate; pm2 restarts blind |
| **Backend restart mid-payment** | Webhook arrives at a dead port → Cashfree retries → probably fine | ⚠️ Depends entirely on F1's sweep for the tail |

**Required:** a `MailLog`/delivery-outcome record (or at minimum an admin
"delivery failures" counter) so a silently-failing Resend key isn't discovered
by a customer complaint. Same for push.

## 3.5 Auth / session failure cases

| Case | Today |
| ---- | ----- |
| Session expires mid-checkout | 401 → redirect to `/login?next=/checkout/{slug}`, **cart preserved** ✅ |
| Explicit logout | Cart cleared (device-sharing safety) ✅ |
| Refresh-token reuse | All sessions revoked ✅ |
| Customer blocked mid-session | Every session revoked; every strategy funnels through `authResult()` ✅ |
| Google sign-in | **Returns 400** — no verifier registered; the button is hidden in the UI 🟡 |
| Guest wants to order | Blocked by design; clear sign-in prompt with return path ✅ |

Auth failure handling is the strongest area of the codebase. The one production
gap is that **Google Sign-In is advertised in CONTEXT.md and dead in the
build** — either register the verifier (`GOOGLE_CLIENT_ID` + a
`providers/index.ts` entry) or delete the claim from the spec.

## 3.6 The missing runner 🔴

Four required behaviours (F1 reconcile, F2 expiry, F3 refund polling, §1 review
request emails) all need the same thing: **a scheduled job runner, which does
not exist anywhere in this codebase.**

Recommendation, in order of preference for this deployment:

1. **In-process interval in `server.ts`** — simplest, no new infrastructure,
   fits the single-pm2-process deployment exactly. Guard with an env flag
   (`JOBS_ENABLED=true`) so a second instance never double-runs.
2. **Separate pm2 process** (`uniemax-jobs`) sharing the codebase — cleaner
   isolation, one more thing to deploy.
3. A queue (BullMQ/Redis) — correct at scale, overkill today.

Take option 1 now, with the job bodies written as plain exported functions so
option 3 is a wiring change later. Each job must be idempotent and must log a
run summary (rows scanned / acted on), because a silent sweep is as bad as no
sweep.

---

# 4. Customer Side — Gaps

## 4.1 What the customer has today

Browse → search → cart → checkout → pay (COD/online) → order success →
`/orders` history → saved addresses → profile with phone linking →
notification bell + push. That is a genuinely complete *purchase* experience.

## 4.2 What the customer cannot do

| # | Gap | Severity | Notes |
| - | --- | -------- | ----- |
| C1 | **Cancel their own order** | 🔴 High | Only the *seller* can cancel (`/stores/:id/orders/:id/cancel`). A customer who ordered by mistake must phone the seller. Standard e-commerce expectation, and cancellation before dispatch is effectively a legal expectation in India. |
| C2 | **Track an order beyond a status chip** | 🟠 | The lifecycle timeline exists on the *seller's* detail page; the customer sees a chip on `/orders` and a link to the confirmation page. No courier, no AWB, no ETA (`estimatedDeliveryAt` exists in the schema and is never set). |
| C3 | **Return / replace a delivered item** | 🔴 High | No `RETURNED` status, no RMA, no return window. Every return is currently an off-platform conversation ending in a manual dashboard refund. |
| C4 | **Download an invoice** | 🟠 | Listed as a "future enhancement"; in practice a GST-registered seller's buyer will demand one. No PDF, no invoice number, no tax breakdown. |
| C5 | **Track an order as a guest** | 🟡 | CONTEXT.md specifies phone+OTP order history; built as *sign-in-required* instead. Guests keep only their confirmation link. Fine as a decision — **but CONTEXT.md still claims otherwise** and should be corrected. |
| C6 | **Get help** | 🔴 | §2. |
| C7 | **Write a review** | 🟠 | §1. |
| C8 | **Paginate order history** | 🟡 | `listMyOrders` is `take: 100`, no pagination, no filters. Order 101 is unreachable. |
| C9 | **Reorder / buy again** | 🟡 | One tap from history; cheap to add, high engagement value. |
| C10 | **Change password / email from the UI** | 🟡 | Endpoints are live; the account UI never shipped (noted in FRONTEND_CONTEXT "Next Steps" #3). |
| C11 | **Control notifications** | 🟡 | A subscribed device gets every notification for its principal; `Notification.kind` exists but there are no preferences. |
| C12 | **Wishlist / coupons** | 🟢 | Explicit future scope. Fine. |
| C13 | **Delete their account / export data** | 🟠 | DPDP Act 2023 gives a right to erasure. There is no path, and `Customer` cascades to `Store` — a real deletion needs a considered policy (anonymise the customer, preserve the orders). |

## 4.3 Minimum customer-side production set

**P0:** C1 (self-cancel before dispatch) · C6 (support entry from an order) ·
C3 (at minimum a *return request* that opens a ticket, even if the RMA workflow
comes later).
**P1:** C2 (customer-visible timeline — the timestamps already exist, this is
presentation only) · C4 (invoice) · C8 (pagination) · C13 (deletion).

Note C1's shape: allow cancellation while `status ∈ {PENDING, CONFIRMED}`; from
`PACKED` onward require seller approval (which is exactly a support ticket).
Reuse `cancelOrder`'s transaction — stock restore and payment voiding are
already correct — behind a customer guard with an ownership check.

---

# 5. Seller Side — Gaps

## 5.1 What the seller has today

Create store → categories → products → variants → media → merchandising →
appearance/homepage/footer → payment/shipping/checkout settings → bank accounts
→ publish → share → dashboard → order queue → confirm/pack/ship/deliver →
cancel with stock restore → notifications. Also strong.

## 5.2 What the seller cannot do

| # | Gap | Severity | Notes |
| - | --- | -------- | ----- |
| S1 | **Get paid** | 🔴 **Blocker** | No payout engine, no ledger, no commission, no settlement report, no payout history. Bank accounts are collected and verified and then nothing consumes them. See §5.3. |
| S2 | **Refund a customer** | 🔴 **Blocker** | §3.2/F3. Today: log into *the platform's* Cashfree dashboard — which a seller must never have access to. |
| S3 | **Charge for shipping** | 🟠 High | `shippingCharge = new Prisma.Decimal(0)` hardcoded ([orders.service.ts:294](../backend/src/modules/orders/orders.service.ts)). `ShippingRule` exists in the schema (FIXED/DISTRICT/STATE/FREE + priority) and is unused. Storefront copy says "Free delivery" platform-wide — FRONTEND_CONTEXT even flags "update that line when shipping rules land". |
| S4 | **Handle a return / RTO** | 🔴 High | No status past DELIVERED. A shipped order that comes back has nowhere to go. |
| S5 | **Print a packing slip / invoice** | 🟠 | Every real seller prints something to put in the box. |
| S6 | **See low-stock alerts** | 🟠 | Admin has a low-stock list; the *seller* — the only person who can act — does not get one. Threshold + notification. |
| S7 | **Bulk operations** | 🟠 | No CSV import/export, no bulk price/stock update, no bulk enable/disable. A 500-SKU seller cannot onboard. |
| S8 | **Export orders** | 🟡 | No CSV export for accounting. |
| S9 | **See real analytics** | 🟡 | Dashboard is counters + latest orders; no trend, no per-product performance, no conversion. The admin console has charts the seller doesn't. |
| S10 | **Reply to reviews** | 🟠 | §1. |
| S11 | **Contact support** | 🔴 | §2 — and this is *more* acute than for customers: "where is my payout" has no answer channel. |
| S12 | **Manage tax / GST** | 🟠 | GST number is a footer string. No tax rate per product, no tax on the order, no GST invoice. Blocks any GST-registered seller. |
| S13 | **Partially cancel an order** | 🟡 | All-or-nothing. |
| S14 | **Add order notes / internal remarks** | 🟡 | Nothing beyond `cancelReason`. |
| S15 | **Onboarding guidance** | 🟡 | The category→product→merchandise→publish sequence exists only as scattered gates (already IMPROVEMENTS.md #7). |

## 5.3 S1 in detail — the payout gap 🔴

This is the single largest missing subsystem. Today:

1. A customer pays online. The money lands in **UnieMax's** Cashfree merchant
   account.
2. `Order.paymentStatus` becomes PAID. The seller's dashboard shows revenue.
3. …nothing. There is no record of what the platform owes, no commission
   deduction, no payout instruction, no transfer, no statement.

**What production needs, minimum viable:**

```prisma
enum LedgerEntryType { SALE  COMMISSION  REFUND  ADJUSTMENT  PAYOUT }
enum PayoutStatus    { PENDING  PROCESSING  PAID  FAILED }

model LedgerEntry {                    // append-only, like AdminAuditLog
  id        String @id @default(cuid())
  storeId   String
  orderId   String?
  type      LedgerEntryType
  amount    Decimal @db.Decimal(12,2)  // signed: credit +, debit −
  note      String?
  payoutId  String?                    // set when swept into a payout
  createdAt DateTime @default(now())
  @@index([storeId, createdAt])
  @@index([payoutId])
}

model Payout {
  id            String @id @default(cuid())
  storeId       String
  bankAccountId String                 // the StoreBankAccount at payout time
  amount        Decimal @db.Decimal(12,2)
  status        PayoutStatus @default(PENDING)
  periodStart   DateTime
  periodEnd     DateTime
  reference     String?                // UTR / transfer reference
  failureNote   String?
  createdAt     DateTime @default(now())
  paidAt        DateTime?
  @@index([storeId, status])
}
```

Plus: a platform **commission rate** (config or per-store), a **hold period**
(don't pay out before the return window closes), a seller-facing **Earnings**
section (balance, pending, paid, statement download), and an admin **Payouts**
page to run and mark them.

**Money movement itself** has two paths — decide now, because it changes the
Cashfree integration:

- **(a) Manual/NEFT** — the platform transfers from its bank on a schedule and
  records the UTR. Zero new integration; needs the ledger and the admin page.
  *Recommended for launch.*
- **(b) Cashfree Payouts / Easy Split** — automated transfers or split-at-source
  to the seller's verified account. Correct long-term, requires a second
  Cashfree product, KYC per seller, and turns `StoreBankAccount.verificationStatus`
  (already provisioned, `THIRD_PARTY` method already an enum value) into a real
  integration.

Either way the **ledger comes first** — without it there is no defensible number
to pay.

**Sizing:** ledger + earnings UI + admin payout run = L (~8–12 dev-days).
Cashfree Payouts integration on top = M.

---

# 6. Cross-cutting production blockers (outside the four areas, but fatal)

| # | Issue | Why it blocks |
| - | ----- | ------------- |
| X1 | **Dev and prod share one backend, one database, and live Cashfree keys** ([DEPLOYMENT.md](./DEPLOYMENT.md), [CASHFREE_PAYMENTS.md](./CASHFREE_PAYMENTS.md)) | *"Any order placed in any environment charges a real card."* There is **no non-charging environment**, so nothing payment-related can be tested without moving real money and refunding it by hand. Restore a sandbox environment (separate DB + `CASHFREE_ENV=sandbox`) before touching the refund work. |
| X2 | `PUBLIC_WEB_URL` points at prod for every environment | A payment started on `dev.` returns the customer to `uniemax.` — acceptable only because one DB backs both, and it will silently break the moment that changes. |
| X3 | No policy pages | §2.2 — gateway/legal requirement. |
| X4 | No error monitoring | Failures live in `console.error` and pm2 logs. F1/F3/F5 are all invisible without Sentry (or equivalent) + an alert on the sweep job. |
| X5 | No automated tests around money | Order placement, stock decrement, webhook idempotency and refunds are all hand-verified. These are the four things that must not regress. |
| X6 | No backup/restore drill | Non-functional requirement in CONTEXT.md; Supabase-managed, never exercised. |
| X7 | `paymentRef: "DEV-SIMULATED"` path exists in the customer-visible UI | Correctly refused in production, but the frontend still renders "dev-simulated" labels; keep them behind an env check so no customer ever sees the phrase. |

---

# 7. Recommended sequence

Ordered by *what stops money from being lost*, then *what stops customers from
being stranded*, then *what makes the marketplace credible*.

### Release 1 — "Safe to take money" (P0, ~2 weeks)

1. **Job runner** in `server.ts` behind `JOBS_ENABLED` (§3.6) — S
2. **Payment reconciliation sweep** (F1) — S · *closes the stranded-payment hole*
3. **Unpaid-order expiry sweep** (F2) — S · *stops stock being held hostage*
4. **Real refunds**: `Refund` model + Cashfree refund API + refund webhook +
   `REFUND_PENDING` status + admin refund lever (F3) — M
5. **Webhook replay window** (F4) + **admin alert on amount mismatch** (F5) — S
6. **Checkout launch-order fix** (F6) — XS
7. **Platform policy pages**: Terms, Privacy, Refund & Cancellation, Shipping,
   Contact/Grievance (§2 Tier 1) — S
8. **Restore a non-charging environment** (X1) — S · *do this first in practice*

### Release 2 — "Nobody is stranded" (P0/P1, ~2 weeks)

9. **Support tickets** end-to-end: model, order-linked entry points, admin
   inbox, notification wiring (§2 Tier 2) — M
10. **Customer self-cancel** before dispatch (C1) — S
11. **Customer-visible order timeline** (C2, presentation of existing data) — S
12. **Return request → ticket** (C3 minimum viable) — S
13. ~~**Order-placement idempotency key** (F7) — S~~ ✅ done
14. **Order history pagination** (C8) — XS
15. **Error monitoring + sweep-job alerting** (X4) — S

### Release 3 — "Sellers can operate" (P0 commercially, ~2–3 weeks)

16. **Ledger + earnings + admin payout run** (S1, option (a)) — L
17. **Shipping charges** — activate `ShippingRule`, quote at checkout, update
    the storefront's "Free delivery" copy (S3) — M
18. **Invoice / packing slip PDF** (C4, S5) — M
19. **Low-stock alerts to the seller** (S6) — S
20. **Returns & RTO statuses** (`RETURN_REQUESTED / RETURNED / REFUNDED`),
    partial cancellation + partial refund (S4, S13, C3 full) — M

### Release 4 — "Credible marketplace" (~2 weeks)

21. **Review & rating system** end-to-end, incl. moderation and the
    post-delivery review-request job (§1) — L
22. Rating filter + sort live; store/product aggregates on cards — S
23. Seller review inbox + replies — S
24. Bulk product import/export (S7), order export (S8), seller analytics (S9) — M
25. Account deletion / data export (C13) — M
26. Notification preferences (C11) — S

---

# 8. Documentation follow-ups this review surfaced

Per the repo's doc-sync rule, these are already-wrong statements that should be
corrected when the matching work lands (or sooner, since they mislead today):

- **CONTEXT.md → "OTP Verification" / "Order History"** still specifies guest
  checkout with OTP and phone+OTP order history. The build requires sign-in to
  order and to view history. Correct the spec or build the guest path.
- **CONTEXT.md → "Phase 1 Deliverables"** lists "Guest checkout with OTP" and
  "Dynamic shipping charges"; neither exists.
- **FRONTEND_CONTEXT.md → "Next Steps" #1** says the gateway is still future —
  it landed (Cashfree is live). Only refunds remain.
- **FRONTEND_CONTEXT.md → StoreProductPage** hardcodes "Free delivery is true
  platform-wide today" with a note to update it when shipping rules land.
- **CONTEXT.md → Authentication** advertises Google Sign-In; the verifier is
  unregistered and the endpoints return 400.

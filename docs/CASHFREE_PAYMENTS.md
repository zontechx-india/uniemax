# Cashfree Payment Gateway — Integration Guide

Online (`paymentMethod: "ONLINE"`) orders are processed through the
**Cashfree Payment Gateway (PG) REST API v4** with the
`@cashfreepayments/cashfree-js` web SDK on the storefront. This document is
the one place describing the payment flow end-to-end; the endpoint contracts
live in [API.md](./API.md), module conventions in
[BACKEND_CONTEXT.md](./BACKEND_CONTEXT.md).

## API versions & base URLs

| Environment | Base URL                          |
| ----------- | --------------------------------- |
| Test        | `https://sandbox.cashfree.com/pg` |
| Production  | `https://api.cashfree.com/pg`     |

- **API version:** v4, pinned via the `x-api-version: 2023-08-01` header
  (previous versions `2021-05-21`, `2022-01-01`, `2022-09-01` are NOT used).
- Auth headers on every call: `x-client-id` (App ID) + `x-client-secret`.
- No server SDK — `backend/src/modules/payments/cashfree.client.ts` is a
  thin `fetch` wrapper over the four calls the flow needs (create order,
  get order, get payments, terminate order). Every call is bounded by a
  15 s timeout so a hanging gateway can't pin a request handler open.

## Environment variables (backend)

| Variable               | Required            | Purpose                                                    |
| ---------------------- | ------------------- | ---------------------------------------------------------- |
| `CASHFREE_APP_ID`      | for gateway flow    | Cashfree App ID (from the merchant dashboard)              |
| `CASHFREE_SECRET_KEY`  | for gateway flow    | Cashfree secret — API auth **and** webhook HMAC key        |
| `CASHFREE_ENV`         | no (`sandbox`)      | `sandbox` \| `production` — picks the base URL + SDK mode  |
| `CASHFREE_API_VERSION` | no (`2023-08-01`)   | Sent as `x-api-version`                                    |
| `PUBLIC_API_URL`       | no                  | Public origin of the API — builds the webhook `notify_url` |
| `PUBLIC_WEB_URL`       | recommended         | Storefront origin — builds the payment `return_url`        |

**Both keys unset = gateway off**, which reproduces the pre-gateway
behavior exactly: development *simulates* ONLINE payments
(`paymentRef: "DEV-SIMULATED"`, instantly PAID) and production refuses them
with `503`. Production boot fails fast if only one of the two keys is set.

> ⚠️ **Sandbox is no longer used anywhere (since 2026-07-30).** Every
> environment — local, `dev.uniemax.zontechx.com`, and `uniemax.com` — runs
> `CASHFREE_ENV=production` with the live merchant keys, and all three share
> one backend (`:4000`) and whichever database that backend's `.env` names.
> **Any order placed in any environment charges a real card**, including
> test orders on the dev domain. Refunds are still manual (see Known gaps).

`PUBLIC_WEB_URL` (return_url) and `PUBLIC_API_URL` (notify_url) must both be
`https://uniemax.com` on the server — the old `uniemax.zontechx.com` domain is
retired, so a stale value sends paying customers to a dead host and silently
breaks webhook delivery.

## Payment flow (create order)

```
React App (CheckoutPage)
    |
    |  POST /api/v1/public/stores/:slug/orders   { paymentMethod: "ONLINE", … }
    v
Node.js Backend (orders module)
    |   creates the Order (stock decremented, paymentStatus PENDING)
    |
    |  POST {base}/orders            x-api-version: 2023-08-01
    |    { order_id, order_amount, order_currency: "INR",
    |      customer_details, order_meta: { return_url, notify_url } }
    v
Cashfree
    |
    |  cf_order_id
    |  payment_session_id
    v
Node.js Backend
    |   persists Order.cfOrderId + Order.paymentSessionId
    |
    |  201 { …order, payment: { paymentSessionId, cfOrderId, mode } }
    v
React App
    |   load({ mode }) from @cashfreepayments/cashfree-js
    |   cashfree.checkout({ paymentSessionId, redirectTarget: "_self" })
    v
Cashfree hosted checkout → redirects to return_url
    (/order/{storeSlug}/{orderId} — the order-success page)
```

Details:

- The `order_id` registered with Cashfree is our `orderNumber`
  (e.g. `UM-MDL3X9K2-7QHT`); a **retry after an expired session** registers
  `orderNumber~R<n>` because Cashfree order ids are one-shot. The latest one
  is stored in `Order.cfOrderId`.
- `customer_details.customer_phone` is mandatory at Cashfree; when the
  store's checkout doesn't collect a phone a neutral placeholder
  (`9999999999`) is sent.
- If the Cashfree registration fails, the placement is **rolled back**
  (stock restored, order deleted) and the API answers `502` — an unpaid
  order never lingers holding stock because of a gateway error.
- Placement emails for gateway orders are **deferred until the payment
  settles** (COD and simulated orders still email at placement).

## After payment (webhook — recommended path)

```
Cashfree
    |
    |  POST /api/v1/payments/webhooks/cashfree     (Webhook, recommended)
    |    headers: x-webhook-signature, x-webhook-timestamp
    v
Node.js Backend (payments module)
    |   1. Verify signature:
    |      Base64( HMAC-SHA256( timestamp + rawBody, CASHFREE_SECRET_KEY ) )
    |      — computed over the EXACT raw bytes (the route parses the body as
    |      a buffer); mismatch → 401, Cashfree stops retrying.
    |   2. PAYMENT_SUCCESS_WEBHOOK →
    |        verify payment_amount == Order.total,
    |        Order.paymentStatus → PAID, paymentRef = cf_payment_id,
    |        send the deferred placement emails (customer + seller).
    |      PAYMENT_FAILED_WEBHOOK → PENDING order → FAILED (stays retryable).
    |      Anything else (USER_DROPPED, refund/settlement events) → ack only.
    |   3. Idempotent: PAID is set with a guarded update, so webhook
    |      retries/duplicates and concurrent reconciles are no-ops.
    v
    200 { received: true }
```

**If the webhook never arrives:** the order page reconciles on every visit,
and `modules/payments/payments.jobs.ts` sweeps every 10 minutes — ONLINE
orders 5 min to 48 h old whose payment is still PENDING/FAILED are asked about
at Cashfree and settled if paid (up to 50 per run, sequentially). It never
cancels or releases stock; it only runs when the gateway keys are set.

**Dashboard setup:** in the Cashfree merchant dashboard add the webhook URL
`https://<api-host>/api/v1/payments/webhooks/cashfree` with the
**2023-08-01 webhook version**. When `PUBLIC_API_URL` is set the backend
also sends it per-order as `order_meta.notify_url`.

### Reconciliation fallback (don't trust the redirect, survive missed webhooks)

The success page never trusts the redirect alone. On every
`GET /public/stores/:slug/orders/:orderId` read of an ONLINE order still
`PENDING`/`FAILED`, the backend asks Cashfree directly
(`GET /orders/{order_id}` → if PAID, `GET /orders/{order_id}/payments` for
the `cf_payment_id`) and settles the status inline. The success page polls
this endpoint every 4 s (up to ~30 s), so payments confirm even when the
webhook can't reach the server — e.g. **local development**, where this
fallback is the primary path unless you tunnel the webhook (ngrok etc.).

### Retry / "Pay now"

`POST /public/stores/:slug/orders/:orderId/pay` (signed-in owner) covers a
customer who dropped out of the checkout or whose payment failed: it
reconciles first (maybe the money already landed), reuses the stored
`payment_session_id` while the Cashfree order is still `ACTIVE`, and
registers a fresh `~R<n>` attempt once it expired. The order-success page
shows the matching **Pay now / Retry payment** button while the order is
unpaid.

## Seller cancellation vs. an in-flight payment

A seller can cancel an unpaid online order while the customer is still on
the hosted checkout — and cancellation **returns the stock to the catalog**,
where it can be resold. Two layers keep that from turning into money taken
for goods that are no longer reserved:

1. **The window is closed.** `cancelOrder` calls `voidPaymentSession`, which
   `PATCH`es the Cashfree order to `TERMINATED` and clears the stored
   `paymentSessionId`. The customer's open checkout stops being payable.
   This is best-effort and time-bounded: a gateway failure logs and moves
   on, it never fails or hangs the seller's cancellation.
2. **What slips through is recorded, not celebrated.** If a payment still
   lands first, `markOrderPaid` sees `status: CANCELLED` and records the
   money (`paymentStatus: PAID`) — losing it would be worse — but the order
   **stays cancelled** and both parties get the refund-required emails
   instead of an order confirmation: the seller is told to refund from the
   Cashfree dashboard, the customer is told a refund is coming.

Such an order shows in the seller's list as `CANCELLED` + payment `PAID`.
It is deliberately excluded from dashboard revenue (which skips `CANCELLED`)
and is not counted as `REFUNDED` until the refund actually happens.

## Data model (Order)

| Field              | Meaning                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `paymentStatus`    | `PENDING` → `PAID` (webhook/reconcile) or `FAILED` (retryable)     |
| `paymentRef`       | Cashfree `cf_payment_id` (or `"DEV-SIMULATED"` without keys)       |
| `cfOrderId`        | `order_id` registered with Cashfree for the latest attempt         |
| `paymentSessionId` | Latest `payment_session_id` (drives the web SDK)                   |

## Testing

**There is no non-charging environment any more.** With production keys
everywhere, placing an ONLINE order and completing it moves real money, and
the refund has to be issued by hand from the Cashfree dashboard. Test with
the smallest possible amount, and prefer verifying the parts that do not
require payment:

- **Credential/account check** — creating a Cashfree order does *not* charge
  anyone; only paying does. A create-order call that returns
  `order_status: ACTIVE` proves the keys and the merchant account are live.
- **Webhook check** — `POST` an unsigned body to the webhook URL; a `401`
  proves it is reachable and the signature check is enforced.
- To get a non-charging environment back, restore the sandbox pair from
  `~/uniemax/backup/env.predeploy-cashfree` on the server (or the Cashfree
  dashboard) and set `CASHFREE_ENV=sandbox`.

## Known gaps / next milestones

- **Refunds:** seller cancellation of a PAID order flips the status to
  `REFUNDED` but does **not** call Cashfree's refund API yet — refund the
  money from the Cashfree dashboard until that lands. The same applies to a
  payment that arrives on an already-cancelled order (above).
- **Webhook replay window:** the signature covers `x-webhook-timestamp` but
  its freshness is not yet checked, so a captured signed webhook replays
  indefinitely. Processing is idempotent, which limits the impact, but the
  standard ±5 min tolerance should be added.
- **Abandoned unpaid orders hold stock** until the seller cancels them from
  the store's Orders section (cancellation restores stock). An automatic
  expiry sweep is a candidate follow-up.

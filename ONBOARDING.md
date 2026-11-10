# Onboarding a product to PaymentHub

> **Audience:** the engineering team of any Zontechx product (UnieMax, ServiDEX,
> ZikTag, or a new one). Read this before writing payment code.
> Request/response shapes live in the [API reference](../API.md); this guide is
> the *how*, not the contract.

## 1. What you get, what you own

| PaymentHub owns | Your product owns |
|---|---|
| Talking to Cashfree (orders, refunds, vendors, payouts) | Carts, orders, bookings, stock, delivery |
| Payment status (only from a verified gateway webhook or a gateway status call) | Deciding *what* to charge and *when* to refund |
| Commission maths and its snapshot per payment | Choosing the commission rule code for a payment *(Phase 3)* |
| Ledger, audit log, reconciliation | Showing payment state to your users |
| Signed webhooks to you, retried for ~33 h | Receiving them idempotently |

**Never** call Cashfree directly once you are on the hub, and never mark
anything paid because the customer's browser came back to your return URL.

## 2. Before you start

- [ ] Your product has its **own Cashfree merchant account** (KYC done by the business).
- [ ] Production keys (and sandbox keys, if Cashfree gives them) are with the
      **PaymentHub team** — they are entered in the hub dashboard, never in your repo.
- [ ] You know your money model: platform-only revenue, or a marketplace with
      sellers/providers who get a share (needs [Phase 3](./PHASE_3.md)).
- [ ] Your backend can make HTTPS calls to the hub and receive one POST endpoint
      from the internet.

## 3. Setup (PaymentHub team, ~30 min)

1. Dashboard → **Apps → New app**: name, slug, your webhook URL
   (`https://api.<product>/payments/webhooks/paymenthub`), allowed return hosts
   (e.g. `www.uniemax.com`). Copy the **webhook signing secret** shown once.
2. **Gateways → Add Cashfree**: production keys on the prod hub (LIVE),
   sandbox keys on the dev hub (TEST).
3. **API keys → Create key** — a `ph_live_` key on prod, a `ph_test_` key on dev. Each key is shown once.
4. Hand the keys and the webhook secret to the product team over the
   approved secrets channel. They go into the product backend's server-side
   env only.

Steps 1–3 happen **once per hub environment** — dev (`https://pay.dev.zontechx.com`)
and prod (`https://pay.zontechx.com`) have separate databases, so each issues
its own app, keys and webhook secret. Your dev backend uses hub dev with a
`ph_test_` key (Cashfree sandbox); your prod backend uses hub prod with a
`ph_live_` key. UnieMax's wiring:
[PHASE_2 §6.4](./PHASE_2.md#64-environments--which-hub-which-key).

## 4. Integration (product team)

### 4.1 Server-side client
Use `@zontechx/paymenthub-client` *(published in Phase 2)* or a thin `fetch`
wrapper. Rules:
- Base URL + API key from env; **never** ship either to a browser or mobile app.
- Every `POST` sends an `Idempotency-Key`. Use a key derived from your own id
  (e.g. `order:<orderId>:create`) so a retry after a timeout cannot charge twice.
- Amounts in **paise** (`amountMinor`). Convert once, at your boundary:
  `Math.round` is not allowed on money — parse the decimal string.
- 10 s timeout (45 s for bank verification, §4.6); on `5xx`/timeout retry
  with the **same** idempotency key.

### 4.2 Checkout
```
your server ── POST /v1/payment-intents ──► hub      (reference = your order/booking id)
your server ◄── { id, checkout.sessionId, checkout.mode }
your client ── Cashfree SDK (web / Android / iOS / RN) with sessionId + mode
```
Store `intent.id` on your order. One live intent per reference: to charge again
after `EXPIRED`/`CANCELLED`, create a new intent; after `FAILED`, call `/retry`.

### 4.3 Return page
When the customer comes back, call `GET /v1/payment-intents/:id?refresh=true`
from your **server** and show the result. Show "processing" while `PENDING`;
the webhook will follow.

### 4.4 Webhook receiver
- Read the **raw body**; verify `PaymentHub-Signature` with
  `verifyHubSignature` (reference: `backend/src/utils/signature.ts`).
- Dedupe on the event `id` (store processed ids). Events arrive **at least
  once** and may arrive out of order — only move your state forward.
- Reply `2xx` after your DB commit. Anything else is retried (1 m, 5 m, 30 m,
  2 h, 6 h, 24 h, then dead → visible in the hub dashboard).
- `payment.succeeded` with `lateCapture: true` = paid after you cancelled.
  Decide: fulfil, or refund via `POST /v1/payment-intents/:id/refunds`.

### 4.5 Refunds
`POST /v1/payment-intents/:id/refunds` with an idempotency key such as
`refund:<returnId>`. The refund is `PENDING` until `refund.succeeded` /
`refund.failed` arrives.

### 4.6 Payee bank account verification

Before a seller (payee) is paid out, check that their bank account is real and
theirs. Do it **once, when the seller adds or changes bank details**, never on
every payout: each new check costs money. The hub reuses recent results for
free. Request and response shapes:
[API → Bank account verification](../API.md#bank-account-verification).

```
seller form ─▶ your server ─▶ POST /v1/verifications/bank-account ─▶ hub ─▶ verifier (Cashfree today)
                     ◀── status: VALID · NEEDS_REVIEW · INVALID · RETRY_LATER
NEEDS_REVIEW: a hub admin decides ─▶ webhook verification.updated ─▶ your server
```

**Step 1: the form.** Ask for:
- the account number, typed twice (compare the two before submitting);
- the IFSC;
- the account holder's name as printed on the passbook or cheque;
- optionally, a phone number.

Check the format with the same rules as the API, so most typing mistakes are
caught before a paid check.

**Step 2: call the hub from your server.**
- `payeeRef` is your id for the seller, e.g. `store_<storeId>`. Take it from
  the logged-in seller's session, **never from the form**. Otherwise one
  seller could check, and later change, another store's account.
- `Idempotency-Key`: one per submission, e.g.
  `bank-verify:<storeId>:<submissionId>`. A changed form is a new submission,
  so it gets a new key.
- Timeout **45 s**: the bank is asked live. On a timeout, a `5xx` or
  `409 IDEMPOTENCY_IN_PROGRESS`, retry with the **same** key after a few
  seconds (at most 3 tries).

```http
POST /v1/verifications/bank-account
Authorization: Bearer ph_test_…
Idempotency-Key: bank-verify:17:sub_0192
Content-Type: application/json

{ "payeeRef": "store_17", "accountNumber": "026291800001191", "ifsc": "YESB0000262", "accountHolder": "Ravi Kumar" }
```

**Step 3: act on `status`.**

| `status` | Save on the store | Tell the seller |
|---|---|---|
| `VALID` | `id` (as `verificationId`), `status`, `target` (masked), `details.ifsc`, `details.bankName`, `registeredName` | "Bank account verified: {registeredName}". Continue onboarding. |
| `NEEDS_REVIEW` | `verificationId`, `status` | "We are checking your bank details." Wait for the webhook. |
| `INVALID` | `verificationId`, `status` | "We couldn't verify this account. Check the account number and IFSC." Let them edit. |
| `RETRY_LATER` | `verificationId`, `status` | "Your bank didn't answer. Try again in a few minutes." |

| Error | What to do |
|---|---|
| `422 VALIDATION_ERROR` / `VERIFICATION_INPUT_INVALID` | Show the field error (`details` / `message`) |
| `429 VERIFICATION_LIMIT` | "Too many attempts today. Try again tomorrow." |
| `429 VERIFICATION_APP_LIMIT` · `502 VERIFIER_ERROR` · `503 VERIFIER_NOT_CONFIGURED` | "Verification is unavailable right now." Alert your ops: the PaymentHub team must act |

**Step 4: the `verification.updated` webhook.** It is sent when a hub admin
settles a `NEEDS_REVIEW` check. Verify and dedupe it like every hub webhook
(§4.4). Apply it only if `data.verification.id` is still the store's
**latest** verification, because the seller may have sent new details since.

**Step 5: keep what payouts will need.** The hub never stores the full account
number. Phase 3 payee creation (`PUT /v1/payees/:payeeRef`, **planned**) takes
the bank details once more, and will accept only details that match a `VALID`
verification. Until then, keep them **encrypted at rest** on your side, or ask
the seller again at that step.

**Security rules**
- Server to server only: the API key never reaches a browser or app.
- Never log the full account number; log `target` (`XXXX1191`). Make sure
  request logs and error trackers (e.g. Sentry) don't capture the form body.
- Show `reasonCode` to your admins only, never to sellers. It can say the
  provider flagged the account as fraud.
- Rate-limit the form on your side too, e.g. 3 submissions per 10 minutes per
  store.
- Changing bank details is the classic way to steal a seller's payouts. Ask
  for a fresh login or an OTP before the change, and email or SMS the seller
  when it happens. Until the new account is `VALID`, keep paying the old
  verified one, or hold payouts.

**Testing on dev.** Use hub dev, a `ph_test_` key and the Cashfree sandbox
(no real ₹1 is sent). These are Cashfree's sandbox accounts:

| Account | IFSC | Sandbox answer | Expected `status` |
|---|---|---|---|
| `026291800001191` | `YESB0000262` | valid | `VALID`, or `NEEDS_REVIEW` if the name doesn't match the sandbox name |
| `00011020001772` | `HDFC0000001` | valid | as above |
| `000100289877623` | `SBIN0008752` | failed at bank | `RETRY_LATER` |
| `2640101002729` | `CNRR0002640` | invalid IFSC | `INVALID` |
| `026291800001190` | `YESB0000262` | invalid account | `INVALID` |

The same payee + account + name returns the earlier result (`reused: true`),
and each payee gets 5 new checks a day. When testing, use a fresh `payeeRef`
per scenario.

## 5. Go-live checklist

- [ ] Full flow tested on the dev hub with a `ph_test_` key, then a ₹1 live payment + refund on prod.
- [ ] Webhook endpoint reachable over HTTPS, signature check on, dedupe on.
- [ ] Return page uses `?refresh=true`, never the redirect alone.
- [ ] Idempotency keys derived from your own ids, not random per attempt.
- [ ] Bank verification (marketplaces): `payeeRef` from the session, 45 s
      timeout, same key on retry, `verification.updated` handled, full account
      number never logged or shown back.
- [ ] Amount conversion unit-tested (₹0.29 → 29, ₹499.50 → 49950).
- [ ] Alert on your side when a `payment.succeeded` arrives for an order you
      cannot find (should never happen; log and page).
- [ ] `ph_live_` key stored only in production server env; `ph_test_` in dev.
- [ ] Hub dashboard → your app → **Webhooks** shows deliveries as *Delivered*.

## 6. Day-2 operations

| Situation | What to do |
|---|---|
| Your webhook was down | Nothing — the hub retries. If an event went *Dead*, re-send it from the hub dashboard. |
| Customer says "paid but order unpaid" | `GET /v1/payment-intents/:id?refresh=true`; if still pending, give the intent id to the PaymentHub team. |
| Rotate API key | Hub team creates a new key → you deploy it → hub team revokes the old one. |
| Rotate webhook secret | Coordinate: deliveries fail verification between rotation and your deploy (they retry). |
| Need a new gateway / payment method | Raise with the PaymentHub team — never integrate one directly. |

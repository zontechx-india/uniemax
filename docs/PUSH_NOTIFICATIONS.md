# Push Notifications — UnieMax

> How notifications work end to end: the feed, Web Push delivery, the events
> that fire, and what to configure before going live.
> Read alongside [BACKEND_CONTEXT.md](./BACKEND_CONTEXT.md) and
> [API.md](./API.md).

---

## The model in one paragraph

Every notification is **written to the database first** and **pushed second**.
The `Notification` table is the source of truth — it survives a device that is
offline, has push blocked, or never subscribed — and the bell menu in both
apps reads it. Web Push is a best-effort delivery layer on top: if it fails,
the notification is still in the feed and the email (for order events) still
went out. Nothing in a business flow can fail because a push service was down.

```
order placed ─► orders.notifications.ts ─┬─► package/mail   (email, existing)
                                         └─► notify()  ──┬─► Notification row  (the feed)
                                                         └─► package/push     (Web Push)
```

---

## Pieces

| Piece | Where | Responsibility |
| ----- | ----- | -------------- |
| **`package/push`** | `backend/src/package/push/` | Domain-free Web Push sender. Knows an endpoint and a payload — never a customer, an order or the database. |
| **`modules/notifications`** | `backend/src/modules/notifications/` | The app layer: stores subscriptions, writes the feed, decides who gets what, fans out. |
| **`push-sw.js`** | `frontend/public/push-sw.js` | Service worker: renders the notification, routes the click. Caches nothing. |
| **`usePushSubscription`** | `frontend/src/shared/push/` | The browser handshake as a hook, shared by both apps. |
| **`notificationsApi`** | `frontend/src/shared/notifications/` | Typed feed + subscription client (one prefix per surface). |
| **Bell menus** | `admin/layout/NotificationBell.tsx`, `storefront/layout/NotificationBell.tsx` | Unread badge, latest items, per-device push toggle. |

### Why `package/push` is separate

Same convention as `package/storage`, `package/mail` and `package/auth`: the
package parses its own env, exposes one facade (`index.ts`), and its boundary
is a port (`PushSender`). Swapping Web Push for FCM or APNs later is one new
driver in `drivers/` — no caller changes. Two drivers exist today:

- **`webPush`** — real delivery via the `web-push` library (RFC 8291 payload
  encryption + RFC 8292 VAPID). Active when both VAPID keys are set.
- **`console`** — logs instead of sending. Active without keys, so development
  works end to end: the feed still fills, only the OS-level popup is missing.

---

## Setup

### 1. Generate a VAPID key pair (once per environment)

```bash
cd backend && npm run push-keys
```

Paste the output into `backend/.env`:

```
VAPID_PUBLIC_KEY="B…"
VAPID_PRIVATE_KEY="…"
VAPID_SUBJECT="mailto:connect@zontechx.com"
```

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `VAPID_PUBLIC_KEY` | for real delivery | Handed to browsers via `GET /api/v1/public/push-config`. Public by definition. |
| `VAPID_PRIVATE_KEY` | for real delivery | **Secret.** Signs every send. |
| `VAPID_SUBJECT` | no | `mailto:` or `https:` contact the push service can reach you on. Defaults to `mailto:connect@zontechx.com`. |
| `PUSH_TTL_SECONDS` | no | How long a push service holds an undelivered message. Default `86400`. |

> ⚠️ **Rotating the pair invalidates every existing subscription.** Generate
> once per environment and keep it. Dev and production can (and should) have
> different pairs.

Without both keys the server logs pushes instead of sending them and
`/public/push-config` answers `{ enabled: false }`, which the UI surfaces as
"Not configured" rather than a broken button.

### 2. Serve over HTTPS

The Push API requires a secure context. `localhost` counts as secure, so dev
works over plain HTTP; **any other host must be HTTPS**. Both UnieMax
environments already are.

### 3. Nothing else

No Firebase project, no APNs certificate, no third-party account. Web Push is
a browser standard — the VAPID pair *is* the credential.

---

## What fires a notification

| Event | Recipients | Kind | Opens |
| ----- | ---------- | ---- | ----- |
| Order placed (COD, or ONLINE once paid) | customer · store owner · every active admin | `ORDER_PLACED` | order confirmation / seller order page / admin order page |
| Order Confirmed · Shipped · Delivered · Cancelled | customer | `ORDER_STATUS` | order confirmation page |
| Store suspended / restored by an admin | store owner | `STORE` | their store management page |
| Product hidden / restored by an admin | store owner | `STORE` | their store's products section |
| Payout account verified / failed | store owner | `ACCOUNT` | their store's bank-accounts section |
| Account unblocked | customer | `ACCOUNT` | — |
| UnieMax ticket raised · reporter replies | every active admin | `SUPPORT` | the ticket in the console |
| UnieMax ticket answered · status changed | whoever raised it | `SUPPORT` | the ticket where they raised it — the account menu's Help & Support, or their store's UnieMax Support |
| Customer writes to a shop · replies again | that store's owner | `SUPPORT` | the request in the store's Customer Support inbox |
| Shop answers · changes the request's status | the customer who raised it | `SUPPORT` | the request in that storefront's Help & Support |
| Admin broadcast | chosen audience | `ANNOUNCEMENT` | optional link |

Order events fire from `modules/orders/orders.notifications.ts` — **the same
function that sends the email**, so a channel can never be added to one and
forgotten on the other.

---

## Subscribing (the browser side)

`usePushSubscription` resolves to one of six states, each of which the UI can
explain:

| State | Meaning |
| ----- | ------- |
| `checking` | Probing support + server config |
| `unsupported` | No Push API (older browser; iOS Safari needs the site added to the home screen) |
| `unconfigured` | Server has no VAPID keys |
| `denied` | The user blocked notifications — **a page cannot undo this**, it must be reset in site settings |
| `off` | Possible, not subscribed |
| `on` | Subscribed on this device |

**Permission is only ever requested from a button press.** A prompt on page
load is the fastest way to get permanently blocked, and a block is not
recoverable from the app.

Subscribing posts the browser's subscription (`endpoint` + `p256dh` + `auth`)
to `POST …/notifications/subscribe`. The endpoint is the unique key, so
re-subscribing is idempotent instead of piling up rows — and an endpoint that
returns under a **different principal** (a shared computer) is reassigned, not
left pushing one person's orders to another person's screen.

---

## Delivery and dead subscriptions

`pushToPrincipal` sends to every live subscription of a principal in parallel
and grades the result:

- `sent` → `lastUsedAt` stamped, `failureCount` reset.
- `expired` (HTTP 404/410 — the browser dropped the subscription) → the row is
  **disabled**, not deleted, so "why did my laptop stop getting alerts" has an
  answer.
- `failed` (429, 5xx, network) → `failureCount + 1`; after **5 consecutive**
  failures the row is disabled too.

A returning endpoint clears both, so a device that comes back works again
without the user doing anything.

Broadcasts write the feed rows in one `createMany`, then push in batches of 25
so a large audience can't open thousands of sockets at once.

---

## API surface

Full payloads in [API.md](./API.md). Summary:

```
GET  /api/v1/public/push-config              (no auth) { publicKey, enabled }

# The same handlers serve both surfaces; the guard decides whose feed it is.
GET  /api/v1/notifications                   🔒 customer
GET  /api/v1/notifications/unread-count      🔒 customer
POST /api/v1/notifications/:id/read          🔒 customer
POST /api/v1/notifications/read-all          🔒 customer
GET  /api/v1/notifications/devices           🔒 customer
POST /api/v1/notifications/subscribe         🔒 customer
POST /api/v1/notifications/unsubscribe       🔒 customer

GET  /api/v1/admin/notifications…            🔒 admin   (same seven paths)
POST /api/v1/admin/notifications/broadcast   🔒 admin   (5 / minute)
```

---

## Data model

```prisma
model PushSubscription {
  principalId   String
  principalType PrincipalType    // ADMIN | CUSTOMER
  endpoint      String @unique   // the push service's URL — the identity
  p256dh        String           // the device's public key
  auth          String           // the device's auth secret
  disabledAt    DateTime?        // permanently rejected, kept for diagnosis
  failureCount  Int    @default(0)
}

model Notification {
  principalId   String
  principalType PrincipalType
  kind          NotificationKind
  title         String
  body          String
  url           String?          // in-app path opened on click
  data          Json?
  readAt        DateTime?
}
```

Both are **domain-agnostic** — an opaque principal, never a foreign key —
exactly like `AuthSession`. That is what lets the notification subsystem serve
admins and customers with one implementation.

---

## Security notes

- The **VAPID public key is public**; it identifies the sender and authorises
  nothing. The private key never leaves the server.
- A subscription's keys are the **device's**, not ours — they encrypt the
  payload so the push service (Google/Mozilla/Apple) cannot read it.
- Unsubscribing is scoped to the principal, so one account cannot silence
  another's device by guessing an endpoint.
- Broadcast is admin-only and rate-limited to 5/minute; the console asks for
  confirmation with a preview, because a broadcast cannot be recalled.
- Payloads carry only what the notification shows. No tokens, no PII beyond
  the order number and store name already in the email.

---

## Troubleshooting

| Symptom | Cause |
| ------- | ----- |
| Toggle says "Not configured" | No VAPID keys in `backend/.env`. Run `npm run push-keys`. |
| Toggle says "Blocked" | The user denied permission. Only they can reset it, in browser site settings. |
| Toggle says "Not supported" | No Push API. On iOS the site must be added to the Home Screen first. |
| Feed fills but no popup appears | Console driver is active (no keys), or the OS is in Do Not Disturb. |
| A device stopped receiving | Its row is `disabledAt` — the browser dropped the subscription. Re-enable from the bell on that device. |
| `console.log` shows `🔔 [push:console]` | Expected without VAPID keys — that IS the fallback working. |

---

## Not yet

- **SMS and WhatsApp order updates** (listed as future in `CONTEXT.md`).
- **Per-kind preferences** — today a subscribed device gets every notification
  for its principal. The `kind` column is already there for when it lands.
- **Native mobile push** (FCM/APNs) — one new driver in `package/push/drivers/`
  when a mobile app exists.

# API Reference — White-Label E-Commerce Platform

> Version 1 (`/api/v1`). See [BACKEND_CONTEXT.md](./BACKEND_CONTEXT.md) for
> architecture and conventions.

**Base URL (dev):** `http://localhost:4000`

## Conventions

- **Success:** `{ "success": true, "data": … }`
- **List:** `{ "success": true, "data": [ … ], "meta": { total, page, pageSize, totalPages } }`
- **Error:** `{ "success": false, "statusCode", "error", "message", "issues"? }`

| Status | When                                                        |
| ------ | ----------------------------------------------------------- |
| 200    | OK                                                          |
| 201    | Created                                                     |
| 400    | Bad request / bad foreign key                               |
| 404    | Not found                                                   |
| 409    | Conflict (duplicate `sku`/`slug`, delete guard)             |
| 422    | Validation failed (`issues[]` has field-level detail)       |
| 429    | Rate-limited — per-IP 300/min globally; stricter on code-sending (5 / 5 min), login/verify (10/min) and order placement (10/min) |
| 500    | Server error                                                |

**Auth:** short-lived **access token** (JWT) + long-lived **refresh token** (opaque,
DB-backed, rotating), issued by the standalone `package/auth` module. Two principal kinds,
distinguished by a `type` claim (`admin` / `customer`).

Each login comes in **two client profiles**:
- **Web** (`/web/*`) → tokens delivered as **httpOnly cookies** plus a readable
  CSRF cookie. State-changing cookie calls (e.g. `/web/refresh`) require that
  cookie's value echoed in an `X-CSRF-Token` header (double-submit). CORS is
  credentialed; the browser sends cookies automatically.

  **Cookie names are namespaced per principal**, because the storefront and the
  admin console share one origin and a browser keys cookies by
  `(name, domain, path)` — the port is *not* part of that key, so a shared name
  would let one login evict the other's session:

  | Principal | Access | Refresh | CSRF | Token path |
  | --------- | ------ | ------- | ---- | ---------- |
  | customer  | `access_token` | `refresh_token` | `csrf_token` | `/` |
  | admin     | `um_admin_access` | `um_admin_refresh` | `um_admin_csrf` | `/api/v1/admin` |

  Both sessions can therefore be live in the same browser, and signing out of
  one never touches the other. The CSRF cookie stays at `/` for both (a page at
  `/admin` cannot read a cookie scoped to `/api/v1/admin`); it is isolated by
  name, which is sufficient — it is not a credential.
- **Mobile** (`/mobile/*`) → tokens returned in the JSON body
  (`accessToken`, `refreshToken`, `expiresIn`); the app sends
  `Authorization: Bearer <accessToken>`.

Guards accept the access token from **either** the Bearer header or the cookie. A
customer token on an admin route (or vice-versa) returns `403`; missing/invalid/expired
→ `401`. When a **rotated** (already-used) refresh token is presented, every session for
that principal is revoked (theft defence). Public browse endpoints need no token and
only ever return active data; **placing an order requires a customer token** (guests
browse and fill a cart, but must sign in to order).

**Session endpoints** (same shape on both auth surfaces; `{surface}` = `auth` for
customers, `admin/auth` for admins):
| Endpoint                              | Purpose                                       |
| ------------------------------------- | --------------------------------------------- |
| `POST /{surface}/web/refresh`         | Rotate via refresh **cookie** (needs CSRF)    |
| `POST /{surface}/web/logout`          | Revoke this session, clear cookies            |
| `POST /{surface}/web/logout-all` 🔒    | Revoke all of this principal's sessions       |
| `POST /{surface}/mobile/refresh`      | Rotate via `{ refreshToken }` in body         |
| `POST /{surface}/mobile/logout`       | Revoke `{ refreshToken }`                      |
| `POST /{surface}/mobile/logout-all` 🔒 | Revoke all of this principal's sessions       |

---

## Health

### `GET /health`
Liveness/readiness probe (no `/api/v1` prefix). Not wrapped in the envelope.
```json
{ "status": "ok", "uptime": 12.34, "timestamp": "2026-07-13T02:22:07.318Z" }
```

---

## Customer Auth (`/api/v1/auth`)

Customers browse as **guests**; an account is needed to place orders and for their
own profile/orders. Three sign-in methods (see
[`backend/docs/PACKAGE_AUTH.md`](../backend/docs/PACKAGE_AUTH.md) for the architecture):

| Method | Endpoints | Notes |
| ------ | --------- | ----- |
| **Email + password** (primary) | `/register/request` → `/{web,mobile}/register/verify` · `/{web,mobile}/login` | **verify-first** — the account is created only after the emailed code is confirmed |
| **Google Sign-In** | `/{web,mobile}/google` | **disabled** — no verifier registered; both endpoints return `400 "GOOGLE sign-in is not enabled"` |
| **Mobile number + OTP** | `/otp/request` → `/{web,mobile}/otp/verify` | **login-only** — works for phones already linked to an account (via `/me/link`); registration is always by email |

Apple Sign-In is planned (same shape as Google). Email and phone are each unique to
one account. Every login method returns the same `customer` object (includes
`hasPassword`, never the hash) and delivers tokens per profile (web cookies / mobile
JSON body).

> **Email codes are real** — delivered via Resend; they are never echoed in responses
> and there is no bypass. **SMS codes are provider-managed** — Message Central
> generates, delivers, and validates them once its credentials are set in `.env`.
> Without credentials a console fallback issues a local code (echoed as `devCode`
> in non-production responses); `OTP_BYPASS=true` would instead accept the fixed
> `OTP_DEV_CODE` (**`123456`**).

### `POST /api/v1/auth/register/request` → `201`
```jsonc
{ "email": "ravi@example.com", "password": "Passw0rd123", "name": "Ravi" }  // name optional
```
Step 1 of **verify-first registration**: validates the whole form (password ≥ 8 chars —
errors surface before any code is sent), checks the email is free (`409` if registered),
and emails a verification code (via Resend). **No account is created yet**, and the code
is never included in the response.
```jsonc
{ "success": true, "data": { "channel": "EMAIL", "destination": "ravi@example.com",
                             "expiresInMinutes": 5 } }
```
`502` if the email could not be sent.

### `POST /api/v1/auth/web/register/verify`  ·  `POST /api/v1/auth/mobile/register/verify` → `201`
```jsonc
{ "email": "ravi@example.com", "password": "Passw0rd123", "name": "Ravi", "code": "123456" }
```
Step 2: consumes the code and **creates the account** (email pre-verified) + signs the
customer in (cookies on web; tokens in body on mobile):
```jsonc
{ "success": true, "data": { "customer": { …, "emailVerifiedAt": "…", "hasPassword": true },
                             "isNewUser": true } }
```
`401` on a wrong/expired code; `409` if the email was claimed in the meantime.

### `POST /api/v1/auth/web/login`  ·  `POST /api/v1/auth/mobile/login`
```jsonc
{ "email": "ravi@example.com", "password": "Passw0rd123" }
```
`401` on bad credentials — same message whether the email is unknown, the password is
wrong, or the account has no password (social/OTP-only).

### `POST /api/v1/auth/password/forgot` → `201`
```jsonc
{ "email": "ravi@example.com" }
```
Always reports success (no account enumeration); a reset code is emailed only when the
address belongs to an account. The code appears only in that email.

### `POST /api/v1/auth/password/reset`
```jsonc
{ "email": "ravi@example.com", "code": "123456", "newPassword": "NewPassw0rd" }
```
Sets the new password and **revokes every session** for the account. `401` on a bad code.

### `POST /api/v1/auth/web/google`  ·  `POST /api/v1/auth/mobile/google`
```jsonc
{ "idToken": "<Google ID token>" }
```
Resolution: already-linked Google account → sign in; else a customer owning the
(Google-verified) email → Google gets linked to them; else a new customer is created
with the email pre-verified. Response is `{ customer, isNewUser }` + tokens per profile.
`401` on an invalid token.
> **Disabled for now:** the provider registry has **no Google verifier registered**
> (`providers/index.ts` — the mock verifier file exists but is unplugged), so both
> endpoints currently answer **`400 "GOOGLE sign-in is not enabled"`**. Enabling it =
> registering a verifier (real verification: google-auth-library + `GOOGLE_CLIENT_ID`).

### `POST /api/v1/auth/otp/request` → `201`
```jsonc
{ "phone": "9876543210" }
```
**Login-only** — OTP sign-in never creates an account. `404` (with guidance) if the
phone is not linked to any customer; link it first via `/me/link` after an email login.
`429` if a code for this number is already in flight (Message Central); `502` if the
SMS service fails.
```jsonc
{ "success": true, "data": { "channel": "SMS", "destination": "9876543210",
                             "expiresInMinutes": 5 } }   // devCode only on the dev fallback
```

### `POST /api/v1/auth/web/otp/verify`  ·  `POST /api/v1/auth/mobile/otp/verify`
```jsonc
{ "phone": "9876543210", "code": "123456" }
```
Verifies the code and signs in the account that owns the phone (re-stamps
`phoneVerifiedAt`). `404` if the phone is unlinked; `401` on wrong/expired code or after
`OTP_MAX_ATTEMPTS` failures.

### `GET /api/v1/auth/me` 🔒 customer
The logged-in customer's profile (includes `hasPassword`).

### `PATCH /api/v1/auth/me` 🔒 customer
```jsonc
{ "name": "Ravi", "altPhone": "9123456780", "avatarUrl": "https://…" }   // all optional
```
Only `name` / `altPhone` / `avatarUrl` are editable here. Email and phone are **login
identifiers** and can only be changed via the verified linking flow below.

### `GET /api/v1/auth/me/orders` 🔒 customer
The customer's own orders (most recent first), each with its line items.

### `POST /api/v1/auth/me/password` 🔒 customer
```jsonc
{ "currentPassword": "old…", "newPassword": "new…" }
```
Changes the password (`401` if `currentPassword` is wrong). On a social/OTP-only account
(no password yet) `currentPassword` is omitted — this **sets** the first password.
Every **other** session is revoked (a leaked password must not leave stolen sessions
alive); the session that made the change stays signed in. Response:
`{ "passwordChanged": true, "revokedSessions": 2 }`.

### Account linking 🔒 customer
Add the *other* identifier to your account, verified by a code to the new identifier.
This is how a mobile number becomes an OTP sign-in method (registration is email-only).
There is no separate post-register email-verify flow — emails are verified **before**
the account is created.

**`POST /api/v1/auth/me/link/request`** → `201`
```jsonc
{ "phone": "9876500011" }   // OR { "email": "…" } — the identifier you don't have yet
```
`409` if that email/phone is already linked to another account (or already on yours).

**`POST /api/v1/auth/me/link/verify`**
```jsonc
{ "phone": "9876500011", "code": "531542" }
```
On success the identifier is set + marked verified on your account. `409` if it was
claimed by another account in the meantime.

---

## Admin Auth (`/api/v1/admin/auth`)

### `POST /api/v1/admin/auth/web/login`  ·  `POST /api/v1/admin/auth/mobile/login`
```jsonc
{ "email": "admin@store.com", "password": "…" }
```
Verifies credentials, then delivers per profile:
```jsonc
// web  → Set-Cookie: um_admin_access, um_admin_refresh, um_admin_csrf
{ "success": true, "data": { "admin": { id, email, name, role, … } } }
// mobile
{ "success": true, "data": { "admin": { id, email, name, role, … },
    "accessToken": "…", "refreshToken": "…", "expiresIn": "15m" } }
```
`401` on bad credentials (same message whether email or password is wrong).

### `GET /api/v1/admin/auth/me` 🔒 admin
The logged-in admin's profile.

> **Bootstrap the first admin** (no signup endpoint by design):
> `npm run create-admin -- <email> <password> ["Full Name"]`

---

## Customer Stores — `/api/v1/stores` 🔒 customer

A customer account can own multiple stores; every endpoint is scoped to the
signed-in customer (someone else's store id → `404`, never `403`). Lists are
small, so no pagination. The `:id` param accepts the store's **id or slug**
interchangeably.

### `GET /api/v1/stores`
The customer's stores, oldest first. Each: `{ id, name, slug, logoUrl, theme,
homepage, footer, profile, readiness, isPublished, createdAt, updatedAt }`.
`profile` is the business identity (see `PATCH …/profile`) and `readiness` the
setup evaluation (see **Store readiness** below), both always returned
resolved on every store response. `theme` is the Appearance JSON
(`backgroundColor`, `primaryColor`, plus nullable `secondaryColor` —
links/prices/highlights —, `surfaceColor` — cards/panels — and
`buttonTextColor` — text on CTA buttons; `null` means Auto: secondary
follows primary, surface derives from the background, button text is
white/black by the primary's luminance).
`homepage` is the
storefront section list — an **ordered** array of `{ key, enabled }` over
`hero`, `categories`, `featured`, `newArrivals`, `bestSellers` (default: that
order, all enabled). `slug` is auto-generated from the name
(unique, stable across renames) and forms the store's public URL;
`isPublished` (default `false`) gates the public page. `footer` is the
storefront footer configuration (see `PATCH …/footer` below), always returned
resolved to its complete shape.

### `POST /api/v1/stores` (multipart) → `201`
Two parts, **both required**: a text field `name` (1–60 chars) and a `file`
part carrying the logo (image; validated against the `logo` rule of
`GET /public/media-config`). Missing file → `400`, oversized → `413`,
unsupported type → `400`.

The store is created with the default theme, an auto-generated unique `slug`,
and `isPublished: false`. A store never exists without a logo: if storing the
object fails, the new row is rolled back.

The `profile` is **seeded from the owner's account** — `sellerName` plus the
account's **verified** `phone` and `email`, so the onboarding wizard's next
step opens pre-filled and nothing already verified is asked for twice. An
unverified channel is seeded as `null` rather than copied, because the
contact fields only accept verified identifiers (see `PATCH …/profile`);
seeding an unverified value would pre-fill something its own save rejects.

### Store readiness

Every store response carries a `readiness` object: the server's evaluation of
what the store still needs, computed from **one requirement registry**
(`modules/stores/storeReadiness.ts`) that also enforces the gates below. The
client renders its setup checklist from exactly what the server would reject
on, so the two can never disagree.

```jsonc
{
  "steps": [                          // registry order; wizard steps first
    { "key": "business",              // store · business · address · tax ·
                                      //   catalog · payout
      "title": "Business & contact",
      "blurb": "Who is selling, and how we reach you about orders.",
      "wizard": true,                 // a numbered Create Store step
      "href": "business",             // relative to /stores/:slug
      "stepNumber": 2,                // 1-based; null for checklist-only steps
      "requirements": [
        { "key": "business.phone", "label": "Contact phone number",
          "step": "business", "gates": ["PUBLISH"], "met": false }
      ],
      "complete": false, "metCount": 3, "totalCount": 4 }
  ],
  "gates": {
    "PUBLISH":        { "gate": "PUBLISH", "allowed": false,
                        "blockers": ["Contact phone number", "Business address"],
                        "blockerKeys": ["business.phone", "address.business"] },
    "ONLINE_PAYMENT": { "gate": "ONLINE_PAYMENT", "allowed": false,
                        "blockers": ["PAN"], "blockerKeys": ["tax.pan"] },
    "PICKUP":         { "gate": "PICKUP", "allowed": true,
                        "blockers": [], "blockerKeys": [] }
  },
  "complete": false, "metCount": 8, "totalCount": 12
}
```

**The three gates and what they require**

| Gate | Blocks | Requirements |
| --- | --- | --- |
| `PUBLISH` | `PATCH …/publish` with `isPublished: true` | store name + logo · business name · seller name · contact phone · contact email · business address · ≥ 1 category · ≥ 1 product |
| `ONLINE_PAYMENT` | `PATCH …/payments` turning `acceptOnlinePayment` **on** | PAN · a primary payout bank account |
| `PICKUP` | `PATCH …/shipping` with mode `PICKUP` / `BOTH` | the business address |

A blocked request returns `400` naming every missing requirement at once, e.g.
`"Before you can publish your store, please add: Business address, At least one product."`

Requirements that do not apply are omitted rather than reported unmet — a
delivery-only store has no pickup-address requirement at all. Turning a
capability **off** is never gated, and neither is unpublishing.

**Grandfathering.** The `PUBLISH` gate is enforced only on a store's **first**
publish (`publishedAt === null`). Stores that were already live before these
requirements existed can still unpublish and re-publish freely.

### `GET /api/v1/stores/:id`
One of the customer's stores. `404` if not found / not owned.

### `GET /api/v1/stores/:id/dashboard`
Seller dashboard for one store — order counters + the latest 8 orders.
```jsonc
{ "stats": {
    "today": 3,            // orders placed since local midnight
    "pending": 5,          // status PENDING (new orders)
    "processing": 0,       // CONFIRMED + PACKED  ─┐ progressed via the
    "shipped": 0,          //                      ├ seller order endpoints
    "completed": 0,        // DELIVERED           ─┘ below
    "cancelled": 0,
    "refunded": 0,         // paymentStatus REFUNDED (via cancelling a
                           // paid order — see the cancel endpoint's note)
    "totalOrders": 5,
    "revenue": "12495.00"  // sum of non-cancelled order totals
  },
  "recentOrders": [ { "id", "orderNumber", "status", "fulfilment",
    "customerName", "paymentMethod", "paymentStatus", "total",
    "placedAt", "itemCount" } ] }
```

### Seller order management — `/api/v1/stores/:id/orders`

The store's orders, worked by the seller. The lifecycle is **forward-only**:
`PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED`, with jumps ahead
allowed (a pickup order goes `PACKED → DELIVERED` without ever being
`SHIPPED`) and never backwards. `CANCELLED` sits outside the sequence and
has its own endpoint because it restores stock.

**`GET /api/v1/stores/:id/orders`** — newest first, server-paginated.

| Query      | Type | Default | Notes                                        |
| ---------- | ---- | ------- | -------------------------------------------- |
| `status`   | enum | –       | `PENDING · CONFIRMED · PACKED · SHIPPED · DELIVERED · CANCELLED` |
| `q`        | string | –     | Matches order number or customer name/phone  |
| `page`     | int  | 1       |                                              |
| `pageSize` | int  | 20      | max 100                                      |

List envelope of summary rows: `{ id, orderNumber, status, fulfilment,
customerName, paymentMethod, paymentStatus, total, placedAt, itemCount }`.

**`GET /api/v1/stores/:id/orders/:orderId`** — one order, full shape (same
as order placement below, incl. the lifecycle stamps). `404` if not this
store's.

**`PATCH /api/v1/stores/:id/orders/:orderId/status`**
```jsonc
{ "status": "CONFIRMED" }   // CONFIRMED | PACKED | SHIPPED | DELIVERED
```
Moves the order forward and stamps the matching timestamp
(`confirmedAt` / `packedAt` / `shippedAt` / `deliveredAt`). Marking a COD
order `DELIVERED` also flips `paymentStatus` to `PAID` (cash changed hands
at the door). `409` when the move isn't forward, the order is cancelled, or
a concurrent update won the race. Returns the full order.

**`POST /api/v1/stores/:id/orders/:orderId/cancel`**
```jsonc
{ "reason": "Out of stock" }   // optional (≤ 300 chars); body may be empty
```
Cancels the order — allowed only while it hasn't shipped (`PENDING` /
`CONFIRMED` / `PACKED`; `409` otherwise). In one transaction the items'
stock is **restored** (lines whose product/variant was deleted since are
skipped) and product aggregates recompute. An **unpaid ONLINE** order also
has its Cashfree order terminated, so a customer sitting on the hosted
checkout can no longer pay for stock that just went back on sale; a payment
that still races through is recorded and flagged for refund rather than
confirmed (see [CASHFREE_PAYMENTS.md](./CASHFREE_PAYMENTS.md)). A `PAID`
order flips to `paymentStatus: REFUNDED` — **status only**: the Cashfree
refund API is not wired yet, so money paid through the gateway must
currently be refunded from the Cashfree merchant dashboard (the automatic
refund call is the next payments milestone). Returns the full order
(`cancelledAt` + `cancelReason` set).

### `PATCH /api/v1/stores/:id`
Update `name`. Renaming does **not** change the slug, so shared links keep
working.

### `PUT /api/v1/stores/:id/logo` (multipart)
Replace the store logo — one multipart `file` part (image; validated against
the `logo` rule of `GET /public/media-config`). Stored in the dedicated
**logo bucket**; the DB keeps only the object key and responses carry a
derived `logoUrl`. Returns the full store. Oversized → `413`, unsupported
type → `400`.

There is no `DELETE` counterpart: the logo is mandatory from creation onward,
so it can only be swapped. (`logoUrl` can still be `null` on stores created
before the logo became required.)

### `PATCH /api/v1/stores/:id/theme`
Partial update of the theme object (unknown keys rejected; colors must be
`#rrggbb`; `secondaryColor`/`surfaceColor`/`buttonTextColor` also accept
`null` = reset to Auto — button text on Auto is white or near-black picked
from the primary color's luminance). Returns the full store with the merged
theme.

```jsonc
{
  "backgroundColor": "#0f1115",
  "primaryColor":    "#ff6b00",
  "secondaryColor":  null,       // null = Auto (follows primary)
  "surfaceColor":    null,       // null = Auto (derived from background)
  "buttonTextColor": null,       // null = Auto (from primary's luminance)
  "templateId":      "clx…",     // which appearance template these colors
                                 // came from — PROVENANCE, not a live link
  "themeName":       "My Shop"   // the seller's name for a customised palette
}
```

`templateId` / `themeName` (both nullable, `themeName` ≤ 60 chars) record how
the seller arrived at these colors. Applying a template **copies** its five
colors here, so a template that is later edited, disabled or deleted changes
no storefront, and a seller's customisation never writes back to the template.
While `themeName` is null the store is simply sitting on the named template.

### `GET /api/v1/theme-templates` 🔒 customer
The appearance templates a seller can apply — **enabled ones only**, ordered
by `displayOrder` then oldest first. Colors only; nothing else about a store.
```jsonc
{ "data": [ {
  "id": "clx…", "name": "Obsidian Amber",
  "description": "Dark canvas with an amber call to action — food, groceries and everyday retail.",
  "theme": { "backgroundColor", "primaryColor", "secondaryColor",
             "surfaceColor", "buttonTextColor" },
  "isActive": true, "displayOrder": 0, "createdAt", "updatedAt"
} ] }
```

### `PATCH /api/v1/stores/:id/homepage`
```jsonc
{ "sections": [                       // FULL ordered list, not a subset
  { "key": "newArrivals", "enabled": true },
  { "key": "hero",        "enabled": true },
  { "key": "featured",    "enabled": false },
  { "key": "categories",  "enabled": true },
  { "key": "bestSellers", "enabled": true }
] }
```
Set the storefront homepage section **order** and per-section visibility in one
write — a reorder and a toggle are the same operation. `sections` must be a
complete permutation of every known key (`hero`, `categories`, `featured`,
`newArrivals`, `bestSellers`), each with an `enabled` flag; a missing,
duplicate or unknown key is a `422`. Returns the full store (with `homepage`
normalised to the ordered list).

Enabling a section can only ever *reveal* it — it never forces an empty row to
appear, since a merchandising row still needs products flagged for it. Disabled
sections are not queried at all. Adding a new section key later makes it appear
(enabled, at the end) for existing stores automatically — no migration.

### `PATCH /api/v1/stores/:id/footer`

Update the storefront **footer** content. The body carries any subset of the
footer **sections** — a present section replaces that section wholesale (the
management page saves one card at a time); absent sections are untouched. At
least one section is required (`422` otherwise). Returns the full store.

```jsonc
{
  "locations": [                    // max 10 — business locations
    {
      "id": "…",                    // omit/null on a new row — the server mints one
      "label": "Head Office",       // optional branch name
      "address": "12/4 MG Road, Kochi, Kerala 682016",   // REQUIRED
      "contactPerson": "Rahul",     // optional
      "phone": "+91 98765 43210",   // REQUIRED
      "altPhone": null,             // optional
      "email": "hello@store.com",   // REQUIRED
      "hours": "Mon–Sat, 9 AM – 8 PM",   // optional
      "isPrimary": true,            // exactly one is kept primary (first wins)
      "lat": 9.9312, "lng": 76.2673 // optional map pin — both or neither
    }
  ],
  "social": {                       // URLs; whatsapp is a NUMBER (wa.me link)
    "facebook": "https://facebook.com/…", "instagram": null, "youtube": null,
    "whatsapp": null, "x": null, "linkedin": null, "telegram": null,
    "pinterest": null
  },
  "info": { "about": "…", "establishedYear": 2005,
            "gstNumber": null, "registrationNumber": null },
  "support": { "email": null, "phone": null, "whatsapp": null, "hours": null },
  "policies": {                     // external URLs until policy PAGES land
    "privacy": null, "terms": null, "shipping": null,
    "returns": null, "cancellation": null
  },
  "links": [ { "label": "FAQ", "url": "https://…" } ],  // max 10; url may also
                                                        // be an in-app /path
  "copyrightText": null             // null = "© {year} {store name}. All Rights Reserved."
}
```

Stored as the `Store.footer` JSON column (same evolve-without-migration
pattern as `theme` / `homepage`). Every store response returns `footer`
**resolved** to the complete shape above — missing sections defaulted, at
most one primary location — so clients never normalise it themselves.

### `PATCH /api/v1/stores/:id/profile`

The store's **business identity** — the legal entity, the accountable seller,
the business contact, the structured addresses and the tax IDs. Stored as the
`Store.profile` JSON column. The body carries any subset of the keys below; a
present key replaces that key wholesale, absent keys are untouched. At least
one key is required (`422` otherwise). Returns the full store.

```jsonc
{
  "businessName": "Anwin Sports Pvt Ltd",   // ≤ 120
  "sellerName": "Anwin Paulji",             // ≤ 80
  "phone": "+91 98765 43210",               // must equal the owner's VERIFIED
  "email": "anwin@example.com",             //   account phone / email — see below
  "address": {                              // canonical postal address
    "line1": "12 Mount Road",               // required
    "line2": "Near Spencer Plaza",          // nullable
    "city": "Chennai",                      // required
    "state": "Tamil Nadu",                  // required; validated against the
                                            //   state list when country=India
    "pincode": "600002",                    // required; ^[1-9]\d{5}$
    "country": "India",                     // defaults to India
    "lat": 13.06, "lng": 80.26              // both or neither, nullable
  },
  "tax": {
    "pan": "ABCDE1234F",                    // ^[A-Z]{5}[0-9]{4}[A-Z]$
    "gstin": "33ABCDE1234F1Z5",             // 15 chars; must contain the PAN
    "gstExempt": false,                     // declared not GST-registered
    "registrationNumber": "U52100TN2020PTC" // CIN/LLPIN/Udyam — free text
  }
}
```

Every field is nullable, so a partially-completed profile is a legal state and
onboarding is resumable — what a field is *required for* is decided per gate
by **Store readiness** above, not by this endpoint. Validation still applies to
whatever is present: a malformed PAN, GSTIN or pincode is rejected with `422`.

`address` is the one address the platform holds. Sellers hand parcels to a
courier office themselves, so there is no separate ship-from or collection
point to record; if store pickup is offered later, where customers collect
will be a Shipping setting, not a profile field.

**`phone` and `email` are not free text.** Each must equal one of the owner's
own **verified** account identifiers; anything else is rejected with `400`,
and so is any value at all on a channel the account has not verified. They are
the addresses order notifications and platform notices go to and that shoppers
see on the storefront, so a seller must have proven they control them.

The value is stored in the account's canonical spelling, not the caller's
(`ME@X.COM` is accepted as a match and saved as `me@x.com`); phones are
matched on digits alone, so `+91 98765 43210` and `+919876543210` are the same
number.

To use a different address or number, the owner **verifies it on their
account** — `POST /auth/me/link/request` → `/auth/me/link/verify` — which
sends a code to it and refuses an identifier already linked elsewhere. That
keeps one OTP implementation on the platform, and means cross-account
uniqueness and proof-of-control hold here without this endpoint re-checking
either. A customer's verified identifier can only go from unset to verified
(`PATCH /auth/me` cannot touch `email`/`phone`), so the stored copy cannot go
stale.

### `PATCH /api/v1/stores/:id/payments`
```jsonc
{ "acceptOnlinePayment": true, "acceptCod": true }
// any subset (≥ 1 key) — absent keys are kept
```
The store's payment acceptance switches (**how customers pay**), stored as
the `Store.payments` JSON column (defaults: COD **on**, online off).
`acceptOnlinePayment` = customers pay through UnieMax (payouts go to the
seller's primary bank account; the gateway arrives with the payments
module), `acceptCod` = cash on delivery. Every store response returns
`payments` resolved to the complete shape, and the **public shell** includes
it too, so the checkout can show what the store accepts. Returns the full
store.

Turning `acceptOnlinePayment` **on** is gated by `ONLINE_PAYMENT` (PAN + a
primary payout account) — see **Store readiness**. Turning it off never is.

### `PATCH /api/v1/stores/:id/shipping`
```jsonc
{ "mode": "DELIVERY",                       // DELIVERY · PICKUP · BOTH
  "deliveryRule": { "type": "INCLUDE",      // ALL · INCLUDE · EXCLUDE
                    "pincodes": ["629154", "629001"] } }
// any subset (≥ 1 key) — absent keys are kept
```
The store's shipping settings, stored as the `Store.shipping` JSON column
and returned resolved on every store response:

- **`mode`** — the fulfilment mode (**how customers receive orders**): the
  seller delivers, customers pick up from a business location, or both
  (default `DELIVERY`). `PICKUP` and `BOTH` are gated by `PICKUP` — the
  store needs a business address before it can offer collection.
- **`deliveryRule`** — the store's **default delivery areas** by pincode
  (default `ALL`): `ALL` delivers everywhere (`pincodes` is ignored and
  stored empty); `INCLUDE` delivers **only** to the listed pincodes;
  `EXCLUDE` delivers everywhere **except** them. Pincodes are 6-digit Indian
  PIN codes (`422` otherwise), normalised (spaces/hyphens stripped) and
  de-duplicated; ≤ 2000 per rule; `INCLUDE`/`EXCLUDE` need at least one.
  Every product follows this rule unless it carries its own `deliveryRule`
  override (see the product endpoints), which then **replaces** it for that
  product. Enforced at order placement and queried by the public
  delivery check. The public shell exposes only `shipping.mode` — the
  pincode lists never leave the server.

Returns the full store.

### `PATCH /api/v1/stores/:id/checkout`
```jsonc
{ "name": true, "phone": true, "email": false, "address": true,
  "pincode": true, "state": true, "country": false }
// any subset (≥ 1 key) — absent keys are kept
```
Which customer fields this store's **checkout collects** — stored as the
`Store.checkout` JSON column, all seven default **true**. A disabled field
is hidden from the customer and excluded from checkout validation.
`name`/`phone`/`email` are contact fields (asked even for store pickup);
`address`/`pincode`/`state`/`country` are delivery fields (skipped for
pickup orders). Returned resolved on every store response and in the
public shell. Returns the full store.

### `PATCH /api/v1/stores/:id/publish`
```json
{ "isPublished": true }
```
Publish / unpublish the store's public page. Returns the full store.

A store's **first** publish is gated by `PUBLISH` — see **Store readiness**;
`400` lists everything still missing. Unpublishing is never gated, and stores
that have published before are grandfathered past the check.

### Payout bank accounts — `/api/v1/stores/:id/bank-accounts`

The seller's payout accounts (max **5** per store). Exactly one account is
**primary** — the only account that receives payouts from UnieMax when
customers pay through the platform. Every account carries a
**verification** state: it starts `PENDING` and will be verified by a
third-party account validator or manually by a UnieMax admin (admin panel
is a future module — the fields are provisioned now, the verification
endpoints arrive with it). Editing any bank detail of a verified account
resets it to `PENDING`.

**`GET /api/v1/stores/:id/bank-accounts`** — the store's accounts, oldest
first. Each:
```jsonc
{ "id", "accountHolderName", "accountNumber", "ifsc", "bankName", "branch",
  "upiId",                        // null when not provided
  "isPrimary",                    // the payout target — at most one true
  "verificationStatus": "PENDING | VERIFIED | FAILED",
  "verificationMethod": "THIRD_PARTY | MANUAL | null",
  "verificationNote": null,       // failure reason / admin note
  "verifiedAt": null, "createdAt", "updatedAt" }
```

**`POST /api/v1/stores/:id/bank-accounts`** → `201`
```jsonc
{
  "accountHolderName": "Anwin Paulji",   // required (1–100)
  "accountNumber": "50100123456789",     // required — 9–18 digits
  "ifsc": "HDFC0001234",                 // required — [A-Z]{4}0[A-Z0-9]{6} (uppercased)
  "bankName": "HDFC Bank",               // required (1–100)
  "branch": "MG Road, Kochi",            // required (1–100)
  "upiId": "name@okhdfcbank",            // optional (VPA shape)
  "isPrimary": true                       // optional — the FIRST account is
                                          // primary automatically regardless
}
```
`409` on the 6th account or when the same `accountNumber` + `ifsc` is
already saved for this store. Created `PENDING`.

**`PATCH /api/v1/stores/:id/bank-accounts/:accountId`** — partial update
(≥ 1 field). Any changed bank detail resets the verification to `PENDING`.
`isPrimary` accepts **only `true`** — promoting an account demotes the
current primary in the same transaction, so the payout target can never be
silently unset. Returns the updated account.

**`DELETE /api/v1/stores/:id/bank-accounts/:accountId`** →
`{ "data": { "id" } }`. Deleting the primary does **not** auto-promote
another account (payouts must never silently retarget) — the seller picks
the next primary explicitly, and payouts stay on hold until they do.

### Store catalog — categories, subcategories, products & variants

The catalog **inside one customer store** (separate from the admin's global
catalog), following the hierarchy **Store → Category → Subcategory
(optional) → Product → Option types → Variants**. The setup sequence is enforced: a
product requires a category (root **or** subcategory) of the same store,
so at least one category must exist before the first product can be added.
Category nesting is one level deep — a subcategory cannot have children.

**`GET /api/v1/stores/:id/categories`** — the store's categories (roots and
subcategories, flat), oldest first. Each: `{ id, name, slug, parentId,
isActive, isFeatured, productCount, subcategoryCount, createdAt }`
(`parentId` is `null` for root categories). `slug` is the category's URL
identity on the storefront (`/store/{storeSlug}/category/{slug}`), generated
from the name on create and **stable across renames**. `isFeatured` surfaces a
root category in the storefront homepage's Featured Categories row.

**`POST /api/v1/stores/:id/categories`** → `201`
```jsonc
{ "name": "Cricket Bats", "parentId": "cmr…" }   // parentId optional → subcategory
```
`name` required (1–60 chars), unique per store case-insensitively (`409` on
duplicate). `parentId` must be a **root** category of the same store
(`400` otherwise — one level of nesting only). Created enabled.

**`PATCH /api/v1/stores/:id/categories/:categoryId`** — partial update;
send any subset (at least one required, `422` otherwise).
```jsonc
{ "name": "Mobiles" }        // rename (slug does NOT change)
{ "isActive": false }        // enable/disable
{ "isFeatured": true }       // show in the homepage Featured Categories row
```
`name` (1–60 chars) must stay unique per store case-insensitively, ignoring
the row being edited, so re-saving an unchanged name is not a conflict
(`409` on a real duplicate). `isActive` enables/disables the category on the
public storefront (a disabled category hides everything inside it publicly —
products and subcategories; their own flags are untouched). `slug` is
deliberately **not** updatable — renaming keeps shared links working.
Re-parenting is not supported. Returns the updated category.

**`DELETE /api/v1/stores/:id/categories/:categoryId`** — `409` if the
category still has products **or subcategories**. → `{ "data": { "id" } }`

> **The variant is the unit of sale.** A product has no price column of its
> own: every product owns at least one variant, and a product *without*
> options carries a single implicit variant named `Default`. Product-level
> `price` / `priceMax` / `stockQuantity` in responses are **derived** from the
> variants and are read-only.
>
> **Variants are combinations of option values.** A product declares ordered
> `optionTypes` — `[{ "name": "Size", "values": ["S","M"] }, { "name":
> "Colour", "values": ["Red","Blue"] }]` — and its variants are **exactly the
> cartesian product** of those values (every combination present; the seller
> disables the ones they don't sell). Each variant carries `optionValues`
> (`{ "Size": "M", "Colour": "Red" }`) and its `name` is **derived** from them
> (values joined `" / "` in type order → `"M / Red"`) — clients never send it.
> Limits: ≤ 3 option types, ≤ 30 values per type, ≤ 100 combinations; names
> and values ≤ 40 chars, free text (`"500 ml"` is a value — there is no unit
> system). A product that predates option types is presented with one
> synthesised type, `"Option"`, whose values are its old variant names.

**`GET /api/v1/stores/:id/products`** — the store's products, newest first.
Each:
```jsonc
{
  "id": "cmr…", "name": "iPhone 17", "slug": "iphone-17", "description": null,
  "price": "89900.00",      // cheapest variant ("from" price); null if nothing sellable
  "priceMax": "109999.00",  // dearest variant — equal to price unless options differ
  "stockQuantity": 28,      // total across variants
  "hasVariants": true,      // false → only the implicit Default variant
  "defaultVariant": null,   // { id, price, stockQuantity } when hasVariants is false
  "isActive": true,
  // Merchandising — each flag maps to exactly one storefront section
  "isFeatured": false, "isBestSeller": false, "isNewArrival": false,
  "hideFromSearch": false,
  "category": { "id": "cmr…", "name": "Smartphones", "slug": "smartphones", "parentId": "cmr…" },
  "optionTypes": [ { "name": "Storage", "values": ["128 GB", "256 GB"] } ],   // [] for a simple product
  "specifications": [ { "label": "Chip", "value": "A19" } ],                  // ordered; [] = none
  "deliveryRule": { "type": "INCLUDE", "pincodes": ["629154"] } | null,        // own override; null = store default
  "variants": [ { "id", "name", "price", "stockQuantity", "isActive",
                  "optionValues": { "Storage": "128 GB" }, "createdAt" } ],
  "media":    [ { "id", "type": "IMAGE|VIDEO", "url", "altText", "displayOrder" } ],
  "createdAt": "…"
}
```
`variants` lists **real combinations only, in matrix order** — the implicit
`Default` is never included; edit it through `defaultVariant.id` instead.
Decimals serialize as strings. `media` is ordered (images by `displayOrder` —
the first image is the **cover** — video last); `url` is derived from storage
config, the DB holds only object keys.

**`POST /api/v1/stores/:id/products`** → `201`

`hasVariants` (default `false`) is the explicit discriminator between the two
product shapes, so a payload is never ambiguous.

**Simple product** — `price` + `stockQuantity` required, `variants` rejected:
```jsonc
{
  "name": "English Willow Bat",   // required (1–120 chars)
  "categoryId": "cmr…",           // required — root or subcategory of this store (400 otherwise)
  "description": "…",             // optional (max 2000)
  "hasVariants": false,
  "price": 4999,                  // required (>= 0)
  "stockQuantity": 20             // required (int >= 0)
}
```
**Variant product** — `optionTypes` (≥ 1) plus `variants` = **every**
combination of their values, each with price + stock; top-level
`price`/`stockQuantity` are not accepted:
```jsonc
{
  "name": "Tee", "categoryId": "cmr…",
  "hasVariants": true,
  "optionTypes": [
    { "name": "Size",   "values": ["S", "M"] },
    { "name": "Colour", "values": ["Red", "Blue"] }
  ],
  "variants": [                    // exactly 2 × 2 = 4 rows, one per combination
    { "optionValues": { "Size": "S", "Colour": "Red"  }, "price": 499, "stockQuantity": 10 },
    { "optionValues": { "Size": "S", "Colour": "Blue" }, "price": 499, "stockQuantity": 0, "isActive": false },
    { "optionValues": { "Size": "M", "Colour": "Red"  }, "price": 549, "stockQuantity": 4 },
    { "optionValues": { "Size": "M", "Colour": "Blue" }, "price": 549, "stockQuantity": 4 }
  ],
  "specifications": [ { "label": "Fabric", "value": "100% cotton" } ],  // optional, ordered, ≤ 30
  "deliveryRule": { "type": "EXCLUDE", "pincodes": ["629154"] }         // optional — see below
}
```
Both shapes accept an optional **`deliveryRule`** — this product's own
delivery areas (same shape and validation as the store's
`PATCH …/shipping` `deliveryRule`). Omitted / `null` = the product follows
the store default; when set it **replaces** the default for this product.

`422` with a field-level `issues[]` when: `hasVariants` is false and `price`
or `stockQuantity` is missing (or options were sent anyway); or `hasVariants`
is true and `optionTypes` is empty, option names or values collide
(case-insensitive), the combinations exceed 100, or `variants` is not exactly
the cartesian product — a combination missing or duplicated, a row with the
wrong keys, a value not in its type, or two rows whose derived labels collide
(possible when a value itself contains `" / "`).

> The wire field is `stockQuantity` (not `stock`) everywhere — request bodies,
> responses and the DB column all use the same name.

**`PATCH /api/v1/stores/:id/products/:productId`** — partial update; send any
subset (at least one field required, `422` otherwise).
```jsonc
{ "name": "…" }              // rename (the slug/public URL never changes)
{ "description": "…" }       // set the description; null (or "") clears it
{ "categoryId": "…" }        // move to another category of the SAME store
{ "isActive": false }        // enable/disable on the storefront
{ "isFeatured": true }       // Featured Products row
{ "isBestSeller": true }     // Best Sellers row
{ "isNewArrival": true }     // New Arrivals row
{ "hideFromSearch": true }   // excluded from search; still browsable by category
{ "specifications": [ { "label": "Material", "value": "Memory foam" } ] }  // ordered rows; null or [] clears
{ "deliveryRule": { "type": "INCLUDE", "pincodes": ["629154"] } }         // own delivery areas; null = follow the store default
```
`categoryId` must reference a category (root or subcategory) of the same
store — anything else is a `400`, exactly as on create. `isActive` controls
storefront visibility (visible publicly only when the product **and** its
category — and, for subcategories, the parent — are active). The `is*`/`hide*`
booleans are **merchandising** flags letting a merchant curate the homepage
without code changes. Each section flag maps to **exactly one** row and
affects nothing else. Price and stock are not here — they live on the
variants (PATCH the variant, or `defaultVariant.id` for an option-less
product) — and neither are option types, which change together with the
variant set through `PUT …/options`. Returns the updated product.

**`DELETE /api/v1/stores/:id/products/:productId`** → `{ "data": { "id" } }`
Variants are deleted with the product.

**Options & variants** — every mutation returns the **full parent product**
(with `optionTypes` and `variants`), so clients can replace one product row
in place. Variants change only **as a set**:

**`PUT /api/v1/stores/:id/products/:productId/options`** — the **full target
state**: every option type and every combination. The server reconciles the
stored variants to it in **one transaction** — rows sent with an `id` are
updated in place (new values, label, price, stock, on/off — so a renamed or
re-priced combination keeps its variant id and every cart line and order
pointing at it), rows without an `id` are created, and stored variants not
referenced are **deleted** (orders keep their snapshot; a cart line pointing
at one revalidates to "no longer available").
```jsonc
{
  "optionTypes": [ { "name": "Size", "values": ["S", "M", "XL"] } ],
  "variants": [
    { "id": "cmr…", "optionValues": { "Size": "S" },  "price": 499, "stockQuantity": 3, "isActive": true },
    { "id": "cmr…", "optionValues": { "Size": "M" },  "price": 499, "stockQuantity": 0, "isActive": false },
    {               "optionValues": { "Size": "XL" }, "price": 549, "stockQuantity": 2 }   // new combination
  ]
}
```
Same `422` matrix rules as create; `400 "Variant "…" does not belong to this
product"` for a foreign or stale `id`. `{ "optionTypes": [], "variants": [] }`
turns the product **back into a simple one**: every variant is replaced by a
single `Default` carrying the cheapest price and the summed stock, and the
option data is cleared. There is deliberately no per-variant `POST` or
`DELETE` — a variant *is* a combination, so it cannot exist or vanish on its
own.

**`PATCH /api/v1/stores/:id/products/:productId/variants/:variantId`**
```jsonc
{ "price": 5499, "stockQuantity": 2, "isActive": false }  // all optional; no `name` — it is derived
```
A variant's price can be changed but never cleared. This is also how the price
and stock of an option-less product are edited — patch its `defaultVariant.id`.

A product cannot be **enabled** without a photo: `PATCH …/products/:productId`
with `isActive: true` is a `400` while the product has no `IMAGE` media
("Add at least one photo before enabling this product"). Disabling is always
allowed, and creating is unaffected — media can only be attached after the
product exists.

**Media** — up to **8 images + 1 video** per product; the image with the
lowest `displayOrder` is the **cover**. Files go to the product-media bucket;
rows store only object keys. Like variants, every mutation returns the **full
parent product**:

**`POST /api/v1/stores/:id/products/:productId/media`** (multipart) → `201`
One `file` part — an image or a video (the content type picks the rule from
`GET /public/media-config`). New images append after existing ones; a 9th
image or 2nd video is a `409`. Oversized → `413`, unsupported type → `400`.

**`PUT /api/v1/stores/:id/products/:productId/media/order`**
```jsonc
{ "mediaIds": ["…", "…"] }   // ALL image ids, in the desired order
```
Reorders the images — the first id becomes the cover. Must be exactly the
product's image ids (`400` otherwise); the video is not part of the ordering.

**`PATCH /api/v1/stores/:id/products/:productId/media/:mediaId`**
```jsonc
{ "altText": "Red cricket bat, front view" }   // null (or "") clears it
```
Metadata only — alt text for accessibility.

**`PUT /api/v1/stores/:id/products/:productId/media/:mediaId/file`** (multipart)
Replace the media item's file, keeping its position and alt text. The new
file must match the slot's type (image→image, video→video; `400` otherwise).

**`DELETE /api/v1/stores/:id/products/:productId/media/:mediaId`**
Removes the media item (and its stored object). Deleting the cover promotes
the next image.

### `GET /api/v1/public/media-config` (no auth)

The upload rules the server enforces, for client-side hints + pre-upload
validation: `{ image | video | logo: { maxMB, contentTypes[] } }` — driven by
the `MEDIA_MAX_*_MB` / `MEDIA_*_TYPES` env vars.

---

## Customer Addresses — `/api/v1/addresses` 🔒 customer

The signed-in customer's **address book** (max **10**). Exactly one address
is **primary** — the default suggestion at checkout: the first saved
address is primary automatically, promoting another demotes it in the same
transaction, and deleting the primary promotes the oldest remaining.
Checkout lists these as selectable suggestions; guests simply fill the
form instead.

**`GET /api/v1/addresses`** — primary first, then oldest first. Each:
```jsonc
{ "id", "label",                 // optional list label ("Home", "Work"…)
  "name", "phone", "email",     // email nullable — not every store collects it
  "addressLine", "pincode", "state", "country",
  "isPrimary", "createdAt", "updatedAt" }
```

**`POST /api/v1/addresses`** → `201`
```jsonc
{
  "label": "Home",                          // optional (≤ 40)
  "name": "Ravi Kumar",                     // required (1–100)
  "phone": "+91 98765 43210",               // required
  "email": "ravi@example.com",              // optional
  "addressLine": "12/4 MG Road, Kochi",     // required (1–300)
  "pincode": "682016",                      // required (3–10 alphanumeric)
  "state": "Kerala",                        // required
  "country": "India",                       // defaults to "India"
  "isPrimary": true                          // optional — first address is
                                             // primary automatically
}
```
`409` on the 11th address.

**`PATCH /api/v1/addresses/:addressId`** — partial update (≥ 1 field).
`isPrimary` accepts **only `true`** (promote; demoting happens by promoting
another). Returns the updated address.

**`DELETE /api/v1/addresses/:addressId`** → `{ "data": { "id" } }` — the
oldest remaining address becomes primary when the primary was deleted.

---

## Public Stores — `/api/v1/public/stores` (no auth)

The storefront is **multi-page**, so this surface is split per page rather
than returning one catalog blob. That is deliberate: a store with thousands
of products must never ship its whole catalog to render a page. The shell is
fetched once and reused; products are queried a page at a time with all
filtering, sorting and pagination done in SQL.

Every endpoint serves **published** stores only — unknown *and* unpublished
slugs both return `404`, so unpublished stores are indistinguishable from
non-existent ones. One exception: the **owner draft preview**. No auth is
required, but a customer session (cookie or bearer) is still resolved
best-effort — never a `401` — and if the viewer **owns** the store, an
unpublished slug resolves too, so owners can check their storefront before
publishing (the shell's `isPublished: false` tells the client it's a draft).
For any other viewer the `404` behaviour is unchanged.
All endpoints apply the same **visibility rule**: a product appears
only when it is active, has at least one enabled variant, and its whole
category chain is active (a disabled root hides its subcategories' products
too). Decimals serialize as strings.

### `GET /api/v1/public/stores`
Marketplace store **index** — published stores only, newest publish first
(feeds the homepage "New Stores" rail). Ordered by `publishedAt` (stamped on
a store's **first** publish — re-publishing an old store doesn't bump it),
nulls last, then `createdAt`. Each card carries a taste of the catalog:
`productCount` (publicly visible products) and `previewImages` (cover-image
URLs of the newest visible products that have a photo, max 4) — both follow
the same visibility rule the store page enforces.

| Query      | Type | Default | Notes            |
| ---------- | ---- | ------- | ---------------- |
| `page`     | int  | 1       |                  |
| `pageSize` | int  | 20      | max 100          |

```jsonc
{ "success": true,
  "data": [ { "id", "name", "slug", "logoUrl", "publishedAt",
              "productCount": 12, "previewImages": ["https://…", …] } ],
  "meta": { "total", "page", "pageSize", "totalPages" } }
```

### `GET /api/v1/public/stores/:slug`
The storefront **shell** — branding, theme and the category tree, with **no
products**. Small and cacheable; fetched once per store visit.

```jsonc
{ "id", "name", "slug", "logoUrl", "theme",
  "isPublished",                  // false only on an owner draft preview
  "footer": { … },                // owner-managed footer content, resolved to the
                                  // full shape (see PATCH /stores/:id/footer)
  "payments": { "acceptOnlinePayment", "acceptCod" },
  "shipping": { "mode": "DELIVERY | PICKUP | BOTH" },   // mode only — never the pincode lists
  "checkout": { "name", "phone", "email", "address", "pincode", "state", "country" },
  "categories": [                 // enabled ROOT categories with something shoppable
    { "id", "name", "slug", "isFeatured",
      "productCount",             // includes its subcategories' products
      "subcategories": [ { "id", "name", "slug", "productCount" } ] }
  ] }
```
Categories with nothing shoppable are omitted, so the header dropdown never
offers a dead end.

### `GET /api/v1/public/stores/:slug/products`
Paginated product listing — powers the category page and search results.

| Query      | Type   | Default  | Notes                                            |
| ---------- | ------ | -------- | ------------------------------------------------ |
| `category` | string | –        | Category **slug**; a root also covers its subcategories (`404` if unknown) |
| `q`        | string | –        | Matches name + description; skips `hideFromSearch` products |
| `section`  | enum   | –        | `featured` · `newArrivals` · `bestSellers` — only products flagged for that homepage row (the "View all" scope) |
| `sort`     | enum   | `newest` | `newest` · `popular` · `bestselling` · `price-asc` · `price-desc` · `alphabetical` |
| `minPrice` / `maxPrice` | number | – | Compared against the "from" price |
| `inStock`  | bool   | –        | Only products with stock                          |
| `page`     | int    | `1`      |                                                   |
| `pageSize` | int    | `20`     | Max `100`                                         |

Returns the **list envelope**: `{ data: [ … ], meta: { total, page, pageSize,
totalPages } }`. Each product is the lean listing shape — variants are
represented by a **count**, never sent in full:
```jsonc
{ "id", "name", "slug", "description",
  "price",          // cheapest sellable variant — the "from" price
  "priceMax",
  "stockQuantity",  // total across sellable variants
  "variantCount",   // real options; 0 = simple product, no picker needed
  "category": { "name", "slug" },
  "image": { "url", "altText" } | null }  // COVER image only — a card never needs more
```
`popular` / `bestselling` order by the owner's Best Seller flag then recency —
there is no sales data yet; they become real orderings when orders ship.

### `GET /api/v1/public/stores/:slug/home`
Homepage merchandising payload — each product section capped at 12.
```jsonc
{ "sections": [ { "key": "hero", "enabled": true }, … ],  // ORDERED
  "featuredCategories": [ … ],  // owner-flagged roots, else all top-level
  "featured": [ … ], "newArrivals": [ … ], "bestSellers": [ … ] }
```
`sections` is the owner's ordered list (see `PATCH …/homepage`) and drives
**both** what the storefront renders and in what order. A section switched
**off** comes back with its data array empty and is never queried; `hero`
carries no data, so the client reads its `enabled` flag directly.
Products use the same listing shape. Each product section is **strictly
flag-driven**: a product appears in `featured` / `newArrivals` / `bestSellers`
if and only if the matching flag is set. There is deliberately **no fallback** —
an unflagged section returns `[]` and the storefront omits it.

> Earlier revisions substituted recent products into an empty section, which
> meant flagging a product as a New Arrival also surfaced it under Featured
> Products (that section was empty, so it fell back to everything). A flag now
> means exactly one thing.

`featuredCategories` is the exception, and is navigation rather than
merchandising: the row is headed "Shop by Category", so it lists every
top-level category when the owner has starred none, and narrows to the starred
set otherwise.

### `GET /api/v1/public/stores/:slug/categories/:categorySlug`
Category header + breadcrumb ancestry for the category page.
```jsonc
{ "id", "name", "slug",
  "parent": { "name", "slug" } | null,
  "subcategories": [ { "id", "name", "slug", "productCount" } ] }
```
A subcategory whose parent is disabled is itself unreachable (`404`).

### `GET /api/v1/public/stores/:slug/products/:productSlug`
Full product detail — the **only** endpoint that returns variants, because the
product page is where a customer picks one.
```jsonc
{ "id", "name", "slug", "description", "price", "priceMax", "stockQuantity",
  "category": { "name", "slug", "parent": { "name", "slug" } | null },
  "optionTypes": [ { "name": "Size", "values": ["S", "M", "XL"] } ],     // picker dimensions, in order
  "specifications": [ { "label": "Fabric", "value": "100% cotton" } ],   // ordered; [] → description fallback
  "delivery": { "restricted": false },                          // true = limited to some pincodes (see delivery-check)
  "variants": [ { "id", "name", "price", "stockQuantity",
                  "optionValues": { "Size": "M" } } ],            // enabled combinations only, matrix order
  "media": [ { "id", "type": "IMAGE|VIDEO", "url", "altText" } ], // gallery, cover first
  "related": [ … ] }                                           // same category, max 8
```
A product with no options arrives with `optionTypes: []` and `variants: []`
(the implicit `Default` is never exposed) and its price/stock come from the
product fields. A value may appear in `optionTypes` with no enabled variant
carrying it — the picker greys such values rather than hiding them.
`delivery.restricted` reflects the product's **effective** delivery rule
(its own override, else the store default) without revealing the pincodes.

### `GET /api/v1/public/stores/:slug/delivery-check?pincode=629154&productIds=a,b`
Can these products be delivered to one pincode? Each product is judged by
its effective rule — its own `deliveryRule` if set, otherwise the store's
`shipping.deliveryRule` — the **same** evaluation order placement enforces,
so the answer here is never contradicted at checkout. `productIds` is a
comma-separated list (1–100 ids); products that are not publicly visible
are simply absent from `results`.
```jsonc
{ "pincode": "629154",
  "results": [ { "productId": "cmr…", "deliverable": false } ] }
```
Used by the product page (against the signed-in customer's primary address,
or a pincode they typed) and by the checkout (against the chosen address).

---

### Orders — `POST /api/v1/public/stores/:slug/orders` 🔒 customer → `201`

Place an order with one store. **Requires a signed-in customer** (`401`
without a valid customer token — the checkout page sends guests through
`/login?next=` first); the order is attached to the account that placed
it. **Published stores only** — an owner's draft preview can browse but
never sell.

```jsonc
{
  "fulfilment": "DELIVERY",          // DELIVERY | PICKUP — must be allowed by
                                     // the store's shipping mode
  "paymentMethod": "COD",            // ONLINE | COD — must be seller-enabled
  "customer": {                      // validated per the STORE's checkout-field
    "name": "Ravi", "phone": "+91 98765 43210", "email": null,
    "address": "12/4 MG Road, Kochi", // config: enabled fields are required
    "pincode": "682016", "state": "Kerala", "country": "India"
  },                                 // (address fields skipped for PICKUP)
  "items": [                         // references + quantities ONLY — prices
    { "productId": "cmr…", "variantId": null, "quantity": 2 }
  ]                                  // are re-read from the live catalog
}
```

Server-side: every line is re-priced from the catalog (client prices are
never trusted), visibility rules apply, and stock is decremented with a
guarded update inside the transaction — concurrent orders can't oversell
(`409` "just sold out" if they race). Product aggregates recompute in the
same transaction. Totals: `subtotal` + `shippingCharge` (0 until the
shipping-rules feature) = `total`.

**Delivery areas** (`DELIVERY` orders): every line's effective pincode rule
(the product's own `deliveryRule`, else the store's `shipping.deliveryRule`)
is checked against `customer.pincode` before anything is written —
`400 "Not deliverable to pincode 629154: "Bat", "Gloves""` names the
offending products. A restricted product with **no pincode** in the payload
(the store does not collect one) is refused too
(`400 "Enter your pincode — …"`) rather than shipped unchecked. Pickup
orders skip the check.

**Payment:** `COD` orders start `paymentStatus: "PENDING"`. `ONLINE` goes
through **Cashfree** when the gateway keys are configured (see
[CASHFREE_PAYMENTS.md](./CASHFREE_PAYMENTS.md)): the order is created
`PENDING`, a Cashfree order is registered, and the response carries a
`payment` object for the web SDK. If Cashfree rejects the registration the
placement is rolled back (stock restored, order deleted, `502`). Without
keys, the pre-gateway behavior holds: dev **simulates** (instantly `PAID`,
`paymentRef: "DEV-SIMULATED"`), production answers
**`503 "Online payment is not available yet"`**.

Response: the full order —
```jsonc
{ "id", "orderNumber",              // e.g. "UM-MDL3X9K2-7QHT"
  "status": "PENDING", "storeName", "storeSlug",
  "fulfilment", "customerName", "customerPhone", "customerEmail",
  "addressLine", "pincode", "state", "country",   // null when not collected
  "subtotal", "shippingCharge", "total",          // decimal strings
  "paymentMethod", "paymentStatus", "paymentRef",
  "placedAt",
  "confirmedAt", "packedAt", "shippedAt",         // lifecycle stamps — null
  "deliveredAt", "cancelledAt", "cancelReason",   // until the seller gets there
  "items": [ { "id", "productName", "variantName", "productSlug",
               "imageUrl",          // cover snapshot (key-derived)
               "unitPrice", "quantity", "lineTotal" } ],
  "payment": {                      // ONLY on a gateway ONLINE placement —
    "paymentSessionId": "session_…",// feed to the Cashfree web SDK checkout()
    "cfOrderId": "UM-…",            // the order id registered with Cashfree
    "mode": "sandbox"               // sandbox | production (SDK load mode)
  }                                 // null on COD / simulated placements
}
```

### `GET /api/v1/public/stores/:slug/orders/:orderId` (no auth)

Confirmation lookup for the order-success page, keyed by the order's
unguessable cuid scoped to its store slug — anonymous so the confirmation
link keeps working in a fresh session. Same shape as above (never includes
`payment`); `404` if unknown. An ONLINE order still awaiting payment is
**reconciled against Cashfree** before answering (webhook fallback), so the
success page converges on `PAID` by polling this endpoint.

### `POST /api/v1/public/stores/:slug/orders/:orderId/pay` 🔒 customer

"Pay now / retry payment" for an unpaid `ONLINE` order the signed-in
customer placed. Reconciles with Cashfree first, reuses the active payment
session when it is still valid, and registers a fresh Cashfree order
(`orderNumber~R<n>`) once the previous one expired. Answers
`{ "paymentStatus": "PAID" }` when the money already landed, else
`{ "paymentStatus": "PENDING", "payment": { paymentSessionId, cfOrderId,
mode } }`. `409` on COD/cancelled/paid-and-refunded orders; `503` when the
gateway is not configured.

### `POST /api/v1/payments/webhooks/cashfree` (no auth — HMAC-guarded)

Cashfree's server-to-server payment notification. Authenticity is verified
with `x-webhook-signature` = Base64(HMAC-SHA256(`x-webhook-timestamp` +
raw body, API secret)) — invalid signatures get `401`. Verified
`PAYMENT_SUCCESS_WEBHOOK` events flip the order to `PAID` (after an amount
check) and send the deferred placement emails; `PAYMENT_FAILED_WEBHOOK`
marks a still-pending order `FAILED` (retryable); everything else is
acknowledged and ignored. Idempotent — replays and duplicates are no-ops.
Not rate-limited. Details: [CASHFREE_PAYMENTS.md](./CASHFREE_PAYMENTS.md).

### `GET /api/v1/orders` 🔒 customer

The signed-in customer's order history, newest first (max 100) — the
account **Orders** page. Full order shape (same as placement, including
per-item `imageUrl` thumbnails). The auth package's `GET /auth/me/orders`
predates this and returns a leaner shape without media.

---

## Marketplace Discovery — `/api/v1/public` (no auth)

Platform-wide, read-only surface behind the marketplace homepage (`/`).
Every query enforces the same visibility rules as the storefront (published
store; product + category chain active; sellable), so search can never
surface something a store page would hide.

### `GET /api/v1/public/search`

Grouped global search across the whole platform. Results are **always
grouped** — stores / categories / products, never interleaved.

| Query   | Type   | Default | Notes                              |
| ------- | ------ | ------- | ---------------------------------- |
| `q`     | string | —       | **required**, 2–120 chars          |
| `limit` | int    | 5       | cap **per group**, max 10          |

```jsonc
{ "success": true, "data": {
  "stores":     [ { "id", "name", "slug", "logoUrl" } ],
  "categories": [ { "id", "name", "slug", "parentName",      // "Cricket" in "Power Sports"
                    "store": { "name", "slug" } } ],
  "products":   [ { "id", "name", "slug", "price", "stockQuantity",
                    "categoryName", "store": { "name", "slug" },
                    "image": { "url", "altText" } | null } ] } }
```

Categories and products carry their **owning store**, because they only
exist inside one (`/store/{storeSlug}/category/{slug}`, `…/product/{slug}`
are their only addresses — there is no global category page). Category hits
require at least one visible product (a hit never lands on an empty page);
product hits respect the owner's `hideFromSearch` flag. Matching is
name-`contains` (categories/products) — the upgrade path at large scale is a
pg_trgm/FTS index behind the same contract.

### `GET /api/v1/public/products`

Platform-wide product rail — the **newest** discoverable products across all
published stores (feeds the homepage "Fresh Finds" row). Recency-only by
design (no popularity/analytics sort exists yet). Enforces the same rules as
global search: `PUBLIC_PRODUCT_VISIBILITY`, published store, and the owner's
`hideFromSearch` opt-out. Items share the search product-hit shape.

| Query      | Type | Default | Notes   |
| ---------- | ---- | ------- | ------- |
| `page`     | int  | 1       |         |
| `pageSize` | int  | 20      | max 100 |

```jsonc
{ "success": true,
  "data": [ { "id", "name", "slug", "price", "stockQuantity",
              "categoryName", "store": { "name", "slug" },
              "image": { "url", "altText" } | null } ],
  "meta": { "total", "page", "pageSize", "totalPages" } }
```

### `GET /api/v1/public/categories`

Homepage "Shop by Category" chips. Categories are per-store (no global
taxonomy), so this aggregates: the most common category **names** across
published stores, grouped case-insensitively (most frequent spelling wins),
ordered by spread, max 12. Only categories with at least one publicly
visible product count — a chip never leads to an empty search. Served from
a 60 s in-process cache.

```jsonc
{ "success": true, "data": [ { "name": "Cricket", "count": 7 }, … ] }
```

### `GET /api/v1/public/stats`

Marketplace trust counters — published stores, publicly visible products,
and orders placed (all statuses except `CANCELLED`; orders survive store
deletion, so the count never shrinks). Served from a 60 s in-process cache,
so homepage traffic costs one count-scan per minute.

```jsonc
{ "success": true, "data": { "stores": 18, "products": 642, "orders": 97 } }
```

---

## Categories (Public)

### `GET /api/v1/categories`
List **active** categories.

| Query      | Type    | Default | Notes                                  |
| ---------- | ------- | ------- | -------------------------------------- |
| `q`        | string  | —       | Search by name (case-insensitive)      |
| `parentId` | string  | —       | Filter to children of a category       |
| `rootOnly` | boolean | —       | `true` → top-level categories only     |
| `page`     | number  | 1       |                                        |
| `pageSize` | number  | 20      | max 100                                |

Each item includes `_count: { products, children }`.

### `GET /api/v1/categories/:slug`
Category detail by slug, including `parent` and **active** `children`.
`404` if not found.

---

## Categories (Admin) — `/api/v1/admin/categories` 🔒 admin

All routes require an admin token. Same list query as public, but returns **all**
categories (`isActive` filterable).

### `POST /api/v1/admin/categories` → `201`
```jsonc
{
  "name": "Hard Tennis Bats",   // required
  "description": "…",            // optional
  "imageUrl": "https://…",       // optional (must be a URL)
  "displayOrder": 0,             // optional
  "isActive": true,              // optional (default true)
  "parentId": "cmr…"             // optional (null/omit for root)
}
```
`slug` is auto-generated and made unique.

### `GET /api/v1/admin/categories/:id`
By id. `404` if not found.

### `PATCH /api/v1/admin/categories/:id`
Partial update (any create field). A category cannot be its own parent (`400`).

### `DELETE /api/v1/admin/categories/:id`
`409` if the category still has products or sub-categories. → `{ "data": { "id" } }`

---

## Products (Public)

### `GET /api/v1/products`
List **active** products in **active** categories.

| Query          | Type    | Default  | Notes                                                        |
| -------------- | ------- | -------- | ------------------------------------------------------------ |
| `q`            | string  | —        | Search name / description / brand / sku                      |
| `categoryId`   | string  | —        | Filter by category id                                        |
| `categorySlug` | string  | —        | Filter by category slug                                      |
| `brand`        | string  | —        | Exact brand (case-insensitive)                               |
| `minPrice`     | number  | —        |                                                              |
| `maxPrice`     | number  | —        |                                                              |
| `isFeatured`   | boolean | —        |                                                              |
| `inStock`      | boolean | —        | `true` → `stockQuantity > 0`                                 |
| `sort`         | enum    | `newest` | `newest·oldest·price_asc·price_desc·name_asc·name_desc`      |
| `page`         | number  | 1        |                                                              |
| `pageSize`     | number  | 20       | max 100                                                      |

List items include `category` (id/name/slug) and the cover image.

### `GET /api/v1/products/:slug`
Product detail by slug: all images (cover first), `specifications`, `category`, and up
to 8 `related` products from the same category. `404` if not found or inactive.

---

## Products (Admin) — `/api/v1/admin/products` 🔒 admin

All routes require an admin token. `GET /` and `GET /:id` return **all** products (any
status); `status` is filterable on the list.

### `POST /api/v1/admin/products` → `201`
```jsonc
{
  "name": "SS Ton Reserve Edition",   // required
  "sku": "SS-TON-001",                // required (unique)
  "categoryId": "cmr…",               // required
  "price": 8999.00,                   // required (>= 0)
  "brand": "SS",                      // optional
  "description": "…",                 // optional
  "discountPrice": 7499.00,           // optional (<= price, else 422)
  "stockQuantity": 12,                // optional (default 0)
  "lowStockThreshold": 3,             // optional (overrides store default)
  "specifications": {                  // optional key/value map (any keys)
    "Willow": "English", "Weight": "1180g"
  },
  "status": "ACTIVE",                 // optional: ACTIVE | INACTIVE
  "isFeatured": true,                 // optional
  "images": [                          // optional (max 20)
    { "url": "https://…/a.jpg" },
    { "url": "https://…/b.jpg", "isCover": true, "displayOrder": 1 }
  ]
}
```
Exactly one image is marked cover (first image defaults to cover if none set).
Duplicate `sku` → `409`.

### `GET /api/v1/admin/products/:id`
Full product detail by id. `404` if not found.

### `PATCH /api/v1/admin/products/:id`
Partial update. Providing `images` **replaces the entire image set**. `sku`/`categoryId`
changeable. `discountPrice > price` → `422`; duplicate `sku` → `409`.

### `DELETE /api/v1/admin/products/:id`
Deletes the product. Order history is preserved (order items keep a product snapshot).
→ `{ "data": { "id" } }`

---

## Support Tickets — `/api/v1/support` 🔒 customer · `/api/v1/admin/support` 🔒 admin

A tracked conversation raised from inside the app. **Three flows, one
resource**, separated by two columns:

| Raised from | `recipient` | `storeId` | Answered by |
| ----------- | ----------- | --------- | ----------- |
| The account menu's Help & Support | `PLATFORM` | `null` | UnieMax |
| A store's UnieMax Support section | `PLATFORM` | the store | UnieMax |
| A storefront's Help & Support (`/store/{slug}/support`) | `STORE` | the store | **the shop's owner** |

`storeId` alone cannot express the third: a seller writing *about* a store
and a shopper writing *to* it name the same store. Hence `recipient`. The
`scope` filter on the PLATFORM surfaces (`STORE`/`ACCOUNT`) is **derived**
from `storeId` rather than stored, so it can never disagree with the row.

**STORE threads never enter the admin console** — a conversation between a
buyer and a seller is theirs, and `/api/v1/admin/support` 404s on one. A
shopper who needs the platform instead uses the `STORE_REPORT` category on an
account ticket.

Every surface reads and writes the **same thread**, so the rules live in one
service:

- A ticket belonging to someone else is a **404**, never a 403.
- **CLOSED is terminal** — neither side can post to a closed ticket (`409`).
- A customer reply on a **RESOLVED** ticket **reopens** it (→ `OPEN`).
- An admin reply on an **OPEN** ticket moves it to **IN_PROGRESS**.
- `priority` is admin-only input; the reporter never sets or sees it.
- Each account may hold **10** OPEN/IN_PROGRESS tickets at a time (`409`).

Every message and status change notifies the other side (feed + Web Push),
and every admin write appends an audit-trail row.

### `GET /api/v1/public/support-contact` (no auth)

How to reach support without opening a ticket — printed on the seller's
Support page.
→ `{ "data": { "email": "support@uniemax.com", "phone": "+91 7708774542", "hours": "…" } }`

### The ticket shape

```jsonc
{ "id", "ticketNumber": "TKT-MT66KRBQ-FDYR",
  "recipient": "PLATFORM" | "STORE",     // who answers
  "subject", "category", "status", "priority",
  "storeId", "storeName", "storeSlug",   // null for account-level tickets
  "contactEmail", "contactPhone",        // snapshot of how to reach the reporter
  "lastMessageAt", "resolvedAt", "closedAt", "createdAt",
  "messageCount",
  "customer": { "id", "name", "email", "phone" },   // who raised it
  "messages": [                          // detail + every write response
    { "id", "authorType": "CUSTOMER" | "ADMIN", "authorId", "authorName",
      "authorRole": "REPORTER" | "STORE" | "PLATFORM",
      "body", "createdAt" }
  ] }
```

**Render messages from `authorRole`, not `authorType`.** On a STORE thread the
seller replies from a Customer account, so both sides are `CUSTOMER`;
`authorRole` is derived server-side (author vs. the ticket's reporter) so two
clients cannot disagree about who said what.

`category` ∈ `ORDERS | PAYMENTS | PAYOUTS | PRODUCTS | STORE_SETUP |
STORE_REPORT | ACCOUNT | TECHNICAL | OTHER` · `status` ∈ `OPEN | IN_PROGRESS |
RESOLVED | CLOSED` · `priority` ∈ `LOW | NORMAL | HIGH | URGENT`.

The API accepts **any** category from any entry point; which ones are
*offered* is a client decision — `PAYOUTS`/`STORE_SETUP` are seller-only,
`STORE_REPORT` is shopper-to-UnieMax only (reporting a seller *to* that same
seller is not a channel), and a message to a shop offers the four it can act
on.

### `GET /api/v1/support/tickets` 🔒 customer

Query: `page`, `pageSize`, `status`, `storeId` (**id or slug**, ownership
enforced), `scope` (`STORE`/`ACCOUNT`; ignored when `storeId` is given).
**PLATFORM tickets only** — threads with a shop are listed under that shop
(below). Own tickets, most recent activity first. `scope=ACCOUNT` is what
keeps a seller's store threads out of their personal Help & Support list.

### `POST /api/v1/support/tickets` 🔒 customer → `201`

Rate limited to **5 / 10 min**.
```jsonc
{
  "subject": "Payout not received for last week",  // 4–150
  "category": "PAYOUTS",                            // defaults to OTHER
  "message": "…",                                   // 10–4000
  "storeId": "my-store",                            // optional, id or slug
  "contactEmail": "seller@example.com",             // optional — falls back to
  "contactPhone": "+91 98765 43210"                 //   the account's own
}
```

### `GET /api/v1/support/tickets/:ticketId` 🔒 customer
The ticket with its full thread.

### `POST /api/v1/support/tickets/:ticketId/messages` 🔒 customer → `201`
Body `{ "message" }` (10–4000). Rate limited to **20 / 10 min**. Reopens a
RESOLVED ticket; `409` on a CLOSED one.

### `POST /api/v1/support/tickets/:ticketId/close` 🔒 customer
The reporter closing their own ticket. `409` if already closed.

The three endpoints above serve **both** recipients: a reporter's own thread
behaves identically whoever answers it, so only *starting* one is scoped.

### `GET /api/v1/support/stores/:storeRef/tickets` 🔒 customer

The shopper's own threads **with one shop**. `:storeRef` is its slug or id,
resolved by the same public-visibility rule as the storefront — you can only
message a shop you could have bought from, and an unpublished or suspended
one is a `404`. Query: `page`, `pageSize`, `status`.

### `POST /api/v1/support/stores/:storeRef/tickets` 🔒 customer → `201`

Raise one. Body is the create shape **without `storeId`** — the shop is the
path, not a field, since a body that could name a different one would be a way
to post into a store you never opened. Rate limited to **5 / 10 min**.
`400` when the caller owns the store (messaging yourself), `409` past **5**
open threads with that one shop.

### `GET /api/v1/stores/:id/support/tickets` 🔒 customer (store owner)

The **shop's inbox** — what its customers raised. Ownership is enforced per
call; another owner's store is a `404`. Query: `page`, `pageSize`, `q`
(ticket number / subject / customer), `status`, `open` (`"true"`). Sorted
oldest-activity-first under `open`, newest first otherwise; `meta` carries
`openCount` for the store.

### `GET /api/v1/stores/:id/support/tickets/:ticketId` 🔒 customer (store owner)
One thread. A **platform** ticket about this store is a `404` here — that one
is with UnieMax, not with the shop.

### `POST /api/v1/stores/:id/support/tickets/:ticketId/messages` 🔒 customer (store owner) → `201`
Body `{ "message" }`. Notifies the customer; moves OPEN → IN_PROGRESS.

### `PATCH /api/v1/stores/:id/support/tickets/:ticketId` 🔒 customer (store owner)
Body `{ "status" }` — **status only**. `priority` is the platform's triage
vocabulary and is not offered to sellers. A change stamps
`resolvedAt`/`closedAt` and notifies the customer.

### `GET /api/v1/admin/support/tickets` 🔒 admin

Query: `page`, `pageSize`, `q` (ticket number / subject / store / reporter
name or email), `status`, `open` (`"true"` — OPEN + IN_PROGRESS), `category`,
`priority`, `storeId`, `scope` (`STORE` = from sellers, `ACCOUNT` = from
shoppers; ignored when `storeId` is given). **PLATFORM tickets only** — a
shopper's thread with a shop is invisible here, including by direct id.
Sorted **oldest activity first** under `open`, newest first otherwise. `meta`
carries `openCount` — the platform-wide backlog, independent of the current
filter.

### `GET /api/v1/admin/support/tickets/:ticketId` 🔒 admin
The ticket with its full thread.

### `POST /api/v1/admin/support/tickets/:ticketId/messages` 🔒 admin → `201`
Body `{ "message" }`. Notifies the reporter; moves OPEN → IN_PROGRESS.
Audit: `support.reply`.

### `PATCH /api/v1/admin/support/tickets/:ticketId` 🔒 admin

Body `{ "status"?, "priority"? }` — at least one. A status change stamps
`resolvedAt`/`closedAt` (and clears them when it moves away) and notifies the
reporter; a priority change is silent. Audit: `support.status` /
`support.priority`.

---

## Notifications — `/api/v1/notifications` 🔒 customer · `/api/v1/admin/notifications` 🔒 admin

The **same handlers** serve both surfaces; the guard that ran decides whose
feed is read, so a customer token can never reach an admin's notifications.
Every path below exists under both prefixes. Full architecture:
[`PUSH_NOTIFICATIONS.md`](./PUSH_NOTIFICATIONS.md).

### `GET /api/v1/public/push-config` (no auth)

The VAPID public key browsers subscribe with. Public by definition — it
identifies the sender and authorises nothing.
→ `{ "data": { "publicKey": "B…" | null, "enabled": true } }`

### `GET …/notifications`

Query: `page`, `pageSize`, `unreadOnly` (`"true"`/`"false"`).
→ `{ "data": [ { id, kind, title, body, url, data, readAt, createdAt } ], "meta": { … }, "unread": 3 }`

`kind` ∈ `ORDER_PLACED | ORDER_STATUS | PAYMENT | STORE | ACCOUNT | ANNOUNCEMENT | SUPPORT`.
`url` is an in-app path the client navigates to on click.

### `GET …/notifications/unread-count`
→ `{ "data": { "unread": 3, "pushEnabled": true } }` — the bell's badge poll.

### `POST …/notifications/:id/read` · `POST …/notifications/read-all`
→ `{ "data": { "id", "read": true } }` · `{ "data": { "markedRead": 4 } }`
Already-read is not an error; a notification belonging to someone else is a 404.

### `POST …/notifications/subscribe`

Body is the browser's `PushSubscription.toJSON()` verbatim:
```json
{ "endpoint": "https://fcm.googleapis.com/fcm/send/…",
  "keys": { "p256dh": "…", "auth": "…" } }
```
Keyed on `endpoint`, so re-subscribing is idempotent. An endpoint returning
under a different principal is **reassigned** (shared computer).
→ `{ "data": { "id", "subscribed": true, "createdAt" } }`

### `POST …/notifications/unsubscribe`
Body `{ "endpoint" }`. Scoped to the caller — one account cannot silence
another's device. → `{ "data": { "subscribed": false } }`

### `GET …/notifications/devices`
→ `{ "data": [ { id, userAgent, disabledAt, createdAt, lastUsedAt } ] }`
`disabledAt` = the push service permanently rejected it (404/410).

### `POST /api/v1/admin/notifications/broadcast` 🔒 admin

Rate limited to **5/minute**. Body:
```json
{ "audience": "SELLERS", "title": "…", "body": "…", "url": "/stores" }
```
`audience` ∈ `ADMINS` (active admins) · `SELLERS` (customers owning ≥1 store)
· `CUSTOMERS` (every non-blocked customer). Feed rows are written
transactionally; pushes go out in batches afterwards.
→ `{ "data": { "recipients": 128 } }`

---

## Platform Admin Console — `/api/v1/admin` 🔒 admin

The UnieMax operator's API, behind `requireAdmin`. **Money is always a
decimal string** (`"14250.00"`), never a float. Every write appends a row to
the audit trail.

Fulfilment is deliberately **not** here: the seller owns their orders, so the
console reports on them rather than driving them.

### `GET /api/v1/admin/dashboard`

Query `days` (1–365, default 30). One request feeds the whole landing page.
```jsonc
{ "data": {
  "range":   { "days": 30, "since": "…" },
  "totals":  { "stores", "publishedStores", "draftStores", "customers",
               "sellers", "blockedCustomers", "products", "orders", "revenue" },
  "today":   { "orders", "revenue" },
  "orderStatus": { "pending","confirmed","packed","shipped","delivered","cancelled" },
  "payments":{ "paid","pending","failed","refunded","collected",
               "codRevenue","onlineRevenue" },
  "series":  [ { "date": "2026-08-01", "orders": 4, "revenue": "25483.00" } ],
  "topStores":   [ { id, name, slug, logoUrl, orders, revenue } ],
  "topProducts": [ { id, name, storeName, storeSlug, unitsSold, revenue } ],
  "recentOrders":[ … ], "lowStock": [ { id, name, stockTotal, storeName } ],
  "integrations": { "paymentGateway": true, "push": true }
} }
```
`series` carries **one point per day including empty days**, so a chart can't
misread the trend.

### `GET /api/v1/admin/stores`

Query: `q` (name / slug / owner email), `status` (`PUBLISHED` · `DRAFT` ·
`SUSPENDED` — suspension outranks the publish flag, so the filters never
overlap), `sort` (`NEWEST` · `OLDEST` · `NAME` · `ORDERS`), `page`, `pageSize`.
→ rows of `{ id, name, slug, logoUrl, isPublished, publishedAt, suspendedAt,
suspendedReason, createdAt, owner{…}, counts{products,categories,orders}, revenue }`

### `GET /api/v1/admin/stores/:id`

`:id` accepts an id or a slug. Adds `settings` (resolved payments / shipping /
checkout — the same effective values the storefront sees), `bankAccounts`
(**account numbers masked to the last 4**), `orderStatus` counts, `theme`,
`footer` and the 10 latest orders.

### `PATCH /api/v1/admin/stores/:id/suspend`

Body `{ "suspended": true, "reason"?: "…" }`. Suspension removes the store from
the storefront, the marketplace and the owner's draft preview, and blocks new
orders — while leaving the owner's management access intact so they can fix
the cause. Lifting it restores whatever the owner had chosen. The owner is
notified. Already in that state → `409`. → the full store.

### `PATCH /api/v1/admin/stores/:id/bank-accounts/:accountId/verification`

Body `{ "status": "VERIFIED" | "FAILED" | "PENDING", "note"?: "…" }` — the
**MANUAL** half of payout verification (the other being a third-party
validator). `FAILED` **requires** a note: a failure the seller can't act on is
worse than no answer. Stamps `verifiedBy` with the acting admin. The seller is
notified. → the full store.

### `GET /api/v1/admin/customers`

Query: `q` (name / email / phone), `filter` (`SELLERS` · `BUYERS` · `BLOCKED`),
`page`, `pageSize`. "Seller" is not a separate account type — it is a customer
owning ≥ 1 store.
→ rows of `{ id, name, email, phone, avatarUrl, emailVerifiedAt,
phoneVerifiedAt, blockedAt, blockedReason, createdAt,
counts{stores,orders,addresses}, isSeller }`

### `GET /api/v1/admin/customers/:id`
Adds `altPhone`, `stores[]`, `spend { orders, total }` and the 10 latest orders.
Never selects `passwordHash`.

### `PATCH /api/v1/admin/customers/:id/block`

Body `{ "blocked": true, "reason"?: "…" }`. Blocking does two things: the flag
stops any future sign-in (checked by **every** strategy in
`package/auth`) **and every existing session is revoked**, so a browser
holding a refresh token is cut off — only the current 15-minute access token
outlives it. Unblocking notifies the customer. Already in that state → `409`.
→ the customer plus `revokedSessions`.

### `GET /api/v1/admin/orders` · `GET /api/v1/admin/orders/:id`

List query: `q` (order number / customer / phone / store / payment reference),
`status`, `paymentStatus`, `paymentMethod`, `storeId`, `from`, `to`, `page`,
`pageSize`. The list also returns **`filteredRevenue`** — the revenue of the
current filter, so the header answers "what is this slice worth".
Detail adds the money breakdown, contact + delivery snapshot, lifecycle
timestamps, `cfOrderId`, the linked customer/store, and items with `imageUrl`.

### `GET /api/v1/admin/payments`

The same order rows through the money lens (there is no separate payments
table — a payment *is* an order's settlement). Query: `q`, `paymentStatus`,
`paymentMethod`, `from`, `to`. Also returns **`totals`** — count + amount per
payment status for the current filter.

### `GET /api/v1/admin/catalog/products` · `GET …/:id`

Namespaced under `/catalog` because `/admin/products` belongs to the original
single-tenant catalog (`modules/product`); these are the **sellers'** products.
Query: `q` (product / store name), `storeId`, `status` (`ACTIVE` · `DISABLED` ·
`LOW_STOCK` ≤ 5 · `OUT_OF_STOCK`), `page`, `pageSize`. Detail adds
`description`, `hideFromSearch`, `updatedAt`, `optionTypes[]` (`{ name,
values[] }`), `specifications[]` (`{ label, value }`), `deliveryRule`
(`{ type: ALL | INCLUDE | EXCLUDE, pincodes[] }`, or `null` = follows the
store default), `variants[]` (each with `optionValues`) and the full
`media[]` — everything the seller configured, read-only.

### `PATCH /api/v1/admin/catalog/products/:id/visibility`

Body `{ "isActive": false, "reason"?: "…" }` — content moderation. Flips the
**same `isActive` flag the seller toggles**, so there is one visibility rule
in the system rather than two that can contradict each other. The seller is
notified with the reason. Already in that state → `409`.

### `GET /api/v1/admin/audit`

The append-only admin trail, newest first. Query: `action`, `entityType`,
`entityId`, `page`, `pageSize`.
→ rows of `{ id, adminId, adminEmail, action, entityType, entityId, meta, ip,
userAgent, createdAt }`. `adminEmail` is a snapshot, so the trail survives the
admin account being deleted.

Actions: `store.suspend` · `store.restore` · `customer.block` ·
`customer.unblock` · `product.hide` · `product.show` ·
`bankAccount.verified|failed|pending` · `admin.create` · `admin.update` ·
`admin.passwordReset`.

### Store appearance templates — `/api/v1/admin/theme-templates` 🔒 admin

The curated palettes sellers pick from in their store's Appearance section.
**Colors only** — a template never carries a store's name, logo, catalog or
settings. Applying one copies its colors onto the store, so nothing here can
alter a live storefront: editing a template leaves every shop that used it
untouched, disabling one only removes it from the seller's picker, and
deleting one is equally non-destructive.

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET`   | `/theme-templates` | Every template (disabled included). Optional `?isActive=true` / `?isActive=false` |
| `POST`  | `/theme-templates` | `{ name, description?, theme, isActive?, displayOrder? }` → `201` |
| `GET`   | `/theme-templates/:id` | One template |
| `PATCH` | `/theme-templates/:id` | Any subset of the create body; `theme` replaces all five colors |
| `DELETE`| `/theme-templates/:id` | `{ id, deleted: true }` |

`theme` is the same five-key object as a store's: `backgroundColor` and
`primaryColor` are required `#rrggbb`; `secondaryColor`, `surfaceColor` and
`buttonTextColor` are `#rrggbb` **or `null`** (Auto). `name` ≤ 60 chars,
`description` ≤ 160, `displayOrder` 0–9999.

Audit actions: `themeTemplate.create` · `themeTemplate.update` ·
`themeTemplate.enable` · `themeTemplate.disable` · `themeTemplate.delete`.

The initial five were seeded from real, well-configured stores (colors only)
by `npm run seed-theme-templates`.

### Admin accounts — `/api/v1/admin/admins` 🔒 SUPER_ADMIN

| Method | Path | Notes |
| ------ | ---- | ----- |
| `GET`  | `/admins` | Active first, then by creation |
| `POST` | `/admins` | `{ email, password, name?, role }` — password ≥ 12 chars with upper/lower/digit |
| `PATCH`| `/admins/:id` | `{ name?, role?, isActive? }` — deactivating revokes that admin's sessions |
| `POST` | `/admins/:id/password` | `{ password }` — revokes every session of that admin |

A non-super admin gets `403`. Two invariants the server enforces: nobody may
change their own role or deactivate themselves, and the **last active
SUPER_ADMIN** cannot be demoted or deactivated (`409`).

---

## Planned Endpoints (not yet implemented)

- Cashfree **refunds** — `POST /pg/orders/{id}/refunds` on seller
  cancellation of a PAID order (today cancellation only flips the status;
  the money is refunded manually from the Cashfree dashboard)
- `GET /api/v1/shipping/quote` — auto shipping calculation (orders currently
  ship free)
- `GET /api/v1/banners`, `GET /api/v1/store` — home page content
- `POST /api/v1/auth/{web,mobile}/apple` — Apple Sign-In (same shape as Google)
- OAuth token verification for Google/Apple (email delivery
  via Resend and SMS OTP via Message Central are live with console fallbacks; Google
  sign-in stays 400 until a verifier is registered — see
  [`backend/docs/PACKAGE_AUTH.md`](../backend/docs/PACKAGE_AUTH.md))

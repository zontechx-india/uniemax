# Backend Context — White-Label E-Commerce Platform

> Engineering reference for the backend. Read alongside [CONTEXT.md](./CONTEXT.md)
> (product spec) and [API.md](./API.md) (endpoint reference).

---

## Tech Stack

| Concern        | Choice                                             |
| -------------- | -------------------------------------------------- |
| Runtime        | Node.js (ESM, `"type": "module"`)                  |
| Language       | TypeScript (strict, `nodenext`, `verbatimModuleSyntax`) |
| HTTP framework | Fastify 5                                          |
| ORM            | Prisma 7 (driver adapter, **not** schema `url`)    |
| Database       | PostgreSQL (Supabase)                              |
| Validation     | Zod 4                                              |
| Dev runner     | `tsx watch`                                        |
| Logging        | Pino (built into Fastify)                          |

Cookie parsing via `@fastify/cookie` (web-client auth). Security headers via
`@fastify/helmet` (CSP off — the server returns JSON/media, never HTML;
cross-origin resource policy relaxed so `/uploads` images render on the
storefront origin). Abuse protection via `@fastify/rate-limit` — global
300/min per IP, with strict per-route overrides on the code-sending
endpoints (5 / 5 min), credential/code checks (10/min) and order placement
(10/min); 429s flow through the standard error envelope. `TRUST_PROXY`
controls whether `X-Forwarded-*` is believed (set `false` when the API is
exposed without a proxy, or clients could spoof IPs past the limits).
Media uploads via
`@fastify/multipart` + the **`package/storage`** sub-system (S3 driver via
`@aws-sdk/client-s3`, local-disk driver for dev served by `@fastify/static`;
**production refuses the local driver** — object storage only).
Transactional email via the tiny **`package/mail`** (Resend REST, console
fallback without a key; `PUBLIC_WEB_URL` adds deep links) — used by the
order notifications. Browser **Web Push** via **`package/push`** (`web-push`
library, VAPID; console fallback without keys — see
`docs/PUSH_NOTIFICATIONS.md`). Online payments via **Cashfree PG v4**
(`modules/payments` — REST wrapper, no SDK; see
`docs/CASHFREE_PAYMENTS.md`). Planned (hooks already in place): Socket.IO
(real-time), Google/Apple token verification, Cashfree refunds.

---

## Directory Layout

```
backend/
├── prisma/
│   ├── schema.prisma          # Data model (26 models, source of truth)
│   └── check.sql              # Connectivity probe for `npm run db:check`
├── prisma.config.ts           # Prisma 7 config — migration datasource (DIRECT_URL)
├── src/
│   ├── server.ts              # Entrypoint: listen + graceful shutdown + Socket.IO slot
│   ├── app.ts                 # buildApp(): plugins, error handlers, routes (no port)
│   ├── routes.ts              # Central route registrar (public + /admin subtrees)
│   ├── config/
│   │   ├── env.ts             # Zod-validated, typed `env`
│   │   └── prisma.ts          # PrismaClient singleton (pg adapter, pooled URL)
│   ├── plugins/
│   │   └── prisma.ts          # Decorates app.prisma; connect/disconnect lifecycle
│   ├── middleware/
│   │   └── errorHandler.ts    # Central error + 404 handler
│   ├── package/               # Self-contained sub-systems (extraction-ready)
│   │   ├── storage/           # Provider-agnostic media storage — see "Media storage"
│   │   │   ├── index.ts       #   facade: storage driver, readUpload, mediaRules,
│   │   │   ├── config.ts      #     registerStoragePlugins; own env parsing
│   │   │   ├── types.ts       #   StorageDriver port (put / remove / publicUrl)
│   │   │   └── drivers/       #   s3.ts (AWS) · local.ts (dev, served at /uploads)
│   │   ├── mail/              # Transactional email (Resend REST / console
│   │   │                      #   fallback) — order notifications use it
│   │   ├── push/              # Web Push (VAPID) — see "Push notifications"
│   │   │   ├── index.ts       #   facade: `push` sender + publicKey/configured
│   │   │   ├── config.ts      #   own env parsing (VAPID_*, PUSH_TTL_SECONDS)
│   │   │   ├── types.ts       #   PushSender port (send → sent/expired/failed)
│   │   │   └── drivers/       #   webPush.ts (real) · console.ts (no keys)
│   │   └── auth/              # The whole auth system — see "Authentication" below
│   │       ├── index.ts       #   PUBLIC facade — the ONLY entry the app imports
│   │       ├── guards.ts      #   requireAdmin / requireCustomer + request types
│   │       ├── core/          #   generic engine (tokens, sessions, cookies/CSRF,
│   │       │   └── config/    #     delivery, guards) + its OWN env + prisma shim
│   │       ├── providers/     #   pluggable ports + adapters (Resend email, Message
│   │       │                  #     Central SMS, bcrypt; console fallbacks) + registry
│   │       ├── verification/  #   generic code engine (OTP / email verify / reset)
│   │       ├── customer/      #   strategies (password, Google, phone OTP) + self-service
│   │       └── admin/         #   admin password credential provider + me
│   ├── modules/               # Feature modules (one folder each)
│   │   ├── health/
│   │   ├── category/          # schema · service · controller · routes
│   │   ├── product/
│   │   ├── stores/            # customer stores: stores.* · storeCatalog.* ·
│   │   │                      #   storeBank.* (payout accounts) ·
│   │   │                      #   publicStore.* (storefront) · catalogSlug.ts
│   │   ├── themeTemplates/    # curated storefront palettes: seller read
│   │   │                      #   (active only) + admin CRUD; colors only
│   │   ├── addresses/         # customer address book (schema · service ·
│   │   │                      #   controller · routes, requireCustomer)
│   │   ├── orders/            # storefront order placement (requireCustomer)
│   │   │                      #   + confirmation lookup (public) + history
│   │   │                      #   + seller order management (list/detail/
│   │   │                      #   status progression/cancel w/ stock restore)
│   │   │                      #   + orders.notifications.ts (email alerts)
│   │   │                      #   (GET /orders) + seller dashboard
│   │   │                      #   (GET /stores/:id/dashboard)
│   │   ├── discovery/         # marketplace: global search + platform stats
│   │   ├── notifications/     # feed + push subscriptions (one handler set,
│   │   │                      #   guard picks the principal) + notify()/
│   │   │                      #   notifyAdmins() dispatch + admin broadcast
│   │   ├── admin/             # PLATFORM CONSOLE (all behind requireAdmin):
│   │   │                      #   admin.schema.ts (every query/body) ·
│   │   │                      #   admin.controller.ts (thin, audits writes) ·
│   │   │                      #   adminDashboard/Stores/Customers/Orders/
│   │   │                      #   Products/Accounts.service.ts · adminAudit.ts
│   │   ├── support/           # support tickets — THREE flows, one table:
│   │   │                      #   support.shared.ts (selects/shapes/urls) ·
│   │   │                      #   support.service.ts (→ UnieMax + /admin) ·
│   │   │                      #   supportStore.service.ts (shopper ↔ seller)
│   │   ├── payments/          # Cashfree gateway: cashfree.client.ts (PG v4
│   │   │                      #   REST wrapper) + session create/retry +
│   │   │                      #   HMAC-verified webhook + reconcile fallback
│   │   │                      #   + session termination on seller cancel
│   │   │                      #   (see docs/CASHFREE_PAYMENTS.md)
│   │   └── (shipping, inventory, settings, dashboard — planned)
│   ├── scripts/
│   │   ├── createAdmin.ts     # Bootstrap an admin (npm run create-admin)
│   │   ├── seedThemeTemplates.ts # Starter appearance templates, colors
│   │   │                      #   lifted from real stores (npm run
│   │   │                      #   seed-theme-templates)
│   │   ├── generatePushKeys.ts# VAPID key pair (npm run push-keys)
│   │   └── backfillCatalog.ts # Slugs + price aggregates (npm run backfill-catalog)
│   ├── utils/                 # response, slug, httpError, zodHelpers, logger, password
│   └── generated/prisma/      # Prisma client (generated, git-ignored)
└── .env                       # runtime, DB, JWT, cookie, OTP config (see Environment below)
```

---

## Application Lifecycle

1. `server.ts` calls `buildApp()`.
2. `buildApp()` (in `app.ts`):
   - creates Fastify (`trustProxy: true`, Pino logger),
   - registers `@fastify/cors`,
   - `registerPrisma(app)` → `prisma.$connect()` + `app.decorate("prisma", …)` + `onClose` disconnect,
   - sets the global error handler + not-found handler,
   - registers routes.
3. `server.ts` calls `app.listen()` and wires `SIGINT`/`SIGTERM` → `app.close()` (drains
   requests, disconnects Prisma).

**Socket.IO attaches later** at the marked slot in `server.ts` via `app.server` (the raw
HTTP server) — no separate port. `app.decorate("io", io)` will expose it to handlers.

---

## Module Pattern (how every feature is structured)

Each feature module is four files with a strict one-way dependency flow:

```
routes.ts  →  controller.ts  →  service.ts  →  prisma
   │              │                 │
 defines       parses request    DB logic + business rules
 endpoints     (zod), calls      (throws HttpError), returns
 (plugins)     service, wraps    plain data
               with ok()/list()
schema.ts  →  zod schemas + inferred TS types (shared by controller)
```

- **`*.schema.ts`** — Zod schemas for body/query/params + `z.infer` types.
- **`*.service.ts`** — all Prisma access and business rules. Imports the `prisma`
  singleton directly. Throws `HttpError` for expected failures. Returns plain objects.
- **`*.controller.ts`** — thin. Parses input with the zod schema (parse errors become
  422 via the error handler), calls the service, wraps the result in `ok()` / `list()`.
- **`*.routes.ts`** — exports `FastifyPluginAsync`(s). Public and admin surfaces are
  exported separately so auth can wrap admin routes.

To add a module: create the four files, then add one `register` line in `routes.ts`.
`modules/health/health.routes.ts` is the minimal template.

---

## Conventions

### Response envelope (`utils/response.ts`)
```jsonc
// success
{ "success": true, "data": { … } }
// list
{ "success": true, "data": [ … ], "meta": { "total", "page", "pageSize", "totalPages" } }
// error
{ "success": false, "statusCode": 409, "error": "Conflict", "message": "…", "issues"?: [ … ] }
```

### Errors (`utils/httpError.ts` + `middleware/errorHandler.ts`)
Throw `HttpError.notFound(msg)` / `.conflict()` / `.badRequest()` etc. from services.
The central handler maps:
| Thrown / caught                     | HTTP | Notes                                   |
| ----------------------------------- | ---- | --------------------------------------- |
| `ZodError`                          | 422  | includes field-level `issues[]`         |
| `HttpError`                         | its code | reason-phrase `error` label         |
| Prisma `P2002` (unique)             | 409  | e.g. duplicate SKU/slug                 |
| Prisma `P2025` (not found)          | 404  |                                         |
| Prisma `P2003` (FK)                 | 400  | bad `categoryId` etc.                   |
| anything else                       | 500  | details hidden in production            |

### Validation
Request data is parsed with Zod **inside controllers** (`schema.parse(request.body)`).
No unvalidated input reaches services. `utils/zodHelpers.ts` holds shared pieces:
`boolQuery` (safe `"true"/"false"` coercion), `paginationQuery`, `idParamSchema`,
`slugParamSchema`.

### Slugs
`utils/slug.ts` `slugify()` + a per-module `uniqueSlug()` that appends `-2`, `-3`… on
collision. Slugs are generated on create and kept stable across renames.

### Public vs Admin
Routes split into `/api/v1/...` (public/customer) and `/api/v1/admin/...`. Public
list/detail queries force `status = ACTIVE` / `isActive = true`; admin sees everything.

### Media storage — the `package/storage` sub-system

All file storage goes through one self-contained package (`src/package/storage`)
whose boundary is the `StorageDriver` port (`put` / `remove` / `publicUrl`).
The app deals only in **logical buckets** (`"logo"` for store logos —
bucket A — and `"media"` for product images/videos — bucket B) plus **object
keys**; the database stores keys, **never URLs** (e.g.
`products/{storeId}/{productId}/{uuid}.webp`). Public URLs are assembled from
configuration at read time (optional CDN base URL per bucket, else the
standard S3 URL), so buckets, AWS accounts, CloudFront, or a different
provider entirely (R2/MinIO/Azure/GCS = one new driver) can change without
touching a row. Two drivers exist: **s3** (AWS SDK v3; explicit keys or the
default credential chain) and **local** (dev default — writes under
`backend/uploads/`, served at `/uploads/*` by `@fastify/static`, proxied by
Vite in dev). Uploads arrive as multipart (`readUpload`, which also returns
the plain text fields sent alongside the file so an endpoint can take a file
and its metadata in one request — `POST /stores` takes name + logo that way),
validated against env-configured size/type rules (`mediaRules`) that are also served to clients
via `GET /api/v1/public/media-config`, so UI hints can't drift from what the
server enforces. Keys are never reused (a replace mints a new key), which
makes objects immutable and infinitely cacheable. The package parses its own
env (`config.ts`) — see Environment below.

### Push notifications — `package/push` + `modules/notifications`

> Full reference: [`PUSH_NOTIFICATIONS.md`](./PUSH_NOTIFICATIONS.md).

Two layers, deliberately split the same way storage and mail are:

- **`package/push`** is domain-free. Its boundary is the `PushSender` port
  (`send(target, payload) → sent | expired | failed`), it parses its own env
  (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` /
  `PUSH_TTL_SECONDS`), and it knows an endpoint and a payload — never a
  customer, an order or the database. Real delivery uses the `web-push`
  library (RFC 8291 encryption + RFC 8292 VAPID); **without both keys a
  console driver logs instead**, so development works end to end and nothing
  is silently dropped. Swapping in FCM/APNs later is one new driver.
- **`modules/notifications`** owns the domain: it stores subscriptions, writes
  the feed, and decides who gets what.

**The feed is the source of truth, push is best effort.** `notify()` writes a
`Notification` row first, then fans out to that principal's live
subscriptions; it is fire-and-forget and never throws, so a push-service
outage cannot fail (or slow) an order. `notifyAdmins()` is the same for every
active admin.

Subscriptions are keyed on the browser's `endpoint`, which makes
re-subscribing idempotent; an endpoint returning under a **different
principal** (shared computer) is reassigned rather than left pushing one
person's orders to another person's screen. A `404`/`410` from the push
service retires the row (`disabledAt`) instead of deleting it, and five
consecutive transient failures do the same — a returning endpoint clears both.

Order events fire from `modules/orders/orders.notifications.ts`, **the same
function that sends the email**, so a channel can't be added to one and
forgotten on the other.

### The platform admin console — `modules/admin`

Mounted inside the `requireAdmin` subtree in `routes.ts`, so no route in the
module repeats the guard. Deliberate scope decisions:

- **Read-heavy.** The seller owns fulfilment (they hold the stock and the
  customer relationship), so the console reports on orders rather than driving
  them. The only writes are moderation levers and admin-account management.
- **Store suspension** (`Store.suspendedAt`) is a separate axis from the
  owner's `isPublished`. Suspension outranks it in every public query
  (`PUBLIC_STORE_VISIBILITY` in `publicStore.service.ts`, reused by
  `modules/discovery` and by order placement) and hides the store even from
  its owner's draft preview — but leaves management access intact so they can
  fix the cause. Lifting it restores exactly what the owner had chosen.
- **Customer blocking** (`Customer.blockedAt`) sets the flag *and* revokes
  every session. The sign-in check lives in `customer.shared.ts#authResult()`
  — the single function every strategy funnels through to build a
  `CustomerAuthResult` — so a new strategy cannot forget it.
- **Product moderation** flips the very same `isActive` flag the seller
  toggles: one visibility rule in the system, never two that can contradict.
- **Payout verification** is the `MANUAL` half of the `BankVerificationMethod`
  the schema already provisioned; `FAILED` requires a note, and `verifiedBy`
  records who decided, because money settles to that account.
- **Every write appends an `AdminAuditLog` row** via `recordAudit(request, …)`
  — fire-and-forget, so an audit failure never fails the action it describes,
  and carrying a snapshot of the actor's email so the trail survives the admin
  being deleted.

`admin.schema.ts` keeps every request shape in one file (unlike the per-area
split in `modules/stores`) because admin input is almost entirely list
filters, which read better side by side.

Endpoint naming note: the console's catalog lives under
`/api/v1/admin/catalog/products` because `/admin/products` is already the
original single-tenant catalog (`modules/product`) — these are the *sellers'*
products, a different thing.

### Store appearance templates — `modules/themeTemplates`

One table (`StoreThemeTemplate`), two surfaces. Sellers read
`GET /api/v1/theme-templates` (behind `requireCustomer`, **active rows only**)
and pick a palette in their store's Appearance section; the console owns full
CRUD at `/api/v1/admin/theme-templates`, auditing every write.

The design rule that makes the whole feature safe: **a template is colors, and
applying one is a copy.** There is no foreign key from `Store` to
`StoreThemeTemplate` — the store's own `theme` JSON holds its five colors plus
a `templateId` breadcrumb. So a template that is edited, disabled or deleted
changes no storefront, and a seller customising their colors (saved under
`theme.themeName`) never writes back to the template.

`storeThemeColorsSchema` in `modules/stores/stores.schema.ts` is the single
definition of those five colors — both the store column and the template column
parse with it, so the two shapes cannot drift apart.

### Support tickets — `modules/support`

One module, three route trees: a public contact endpoint, the reporter's
surface behind `requireCustomer` (`/api/v1/support`), and the platform
queue inside the `/admin` guard (`/api/v1/admin/support`). **One service**
backs both sides, because they are the same thread read from opposite ends —
splitting them would mean two definitions of "who may post here", which is
exactly the rule that must not diverge.

**Three flows, one table**, separated by two columns:

| Flow | `recipient` | `storeId` | Answered by |
| ---- | ----------- | --------- | ----------- |
| Shopper → UnieMax (account menu) | PLATFORM | null | the console |
| Seller → UnieMax (their shop) | PLATFORM | the store | the console |
| Shopper → the shop they buy from | STORE | the store | **the store owner** |

`storeId` alone cannot express the third — a seller writing *about* a store
and a shopper writing *to* it name the same store — which is the whole reason
`recipient` exists. The `scope` filter the PLATFORM surfaces expose
(`STORE`/`ACCOUNT`) is still **derived** from `storeId`, so that flag can
never disagree with the row it describes, and a customer who also sells never
sees their shop threads in their personal list or the reverse.

**The console answers PLATFORM tickets only.** `adminListTickets` filters on
it and `adminGetTicket` 404s on a store thread: a conversation between a
buyer and a seller is theirs, and a queue padded with threads nobody there is
expected to answer is a queue that stops being read. A shopper who needs the
platform to step in has the `STORE_REPORT` category on an account ticket.

Code layout follows the split: `support.shared.ts` holds what every flow
needs (selects, the wire shape, ticket numbers, per-flow reporter URLs),
`support.service.ts` owns the PLATFORM flows plus the console, and
`supportStore.service.ts` owns the store flows. The reporter's own reads and
writes stay in `support.service.ts` **for both recipients** — a thread behaves
identically for the person who raised it whoever answers, and only the
notification target differs — so they branch on `recipient` instead of
existing in two copies.

The category enum spans every audience (`PAYOUTS`/`STORE_SETUP` are seller
concerns, `STORE_REPORT` a shopper's); the **API accepts any of them** and the
clients decide which to offer, because the alternative is a validation rule
that has to know which page the request came from.

Decisions worth keeping:

- **Ownership failures are 404s**, not 403s: a 403 confirms the ticket exists.
- **CLOSED is terminal** for both sides; carrying on means a new ticket, so a
  thread always has exactly one subject. A reporter's reply on a **RESOLVED**
  ticket, by contrast, **reopens** it — "resolved" is the platform's opinion,
  and the person who raised it gets to disagree without filing a duplicate.
- **An admin reply moves OPEN → IN_PROGRESS.** Answering *is* picking it up;
  making that a second manual step guarantees a queue that lies.
- **`priority` is admin-only input.** Offered the choice, every reporter picks
  URGENT and the field stops sorting anything.
- **Contact details come from env** (`SUPPORT_EMAIL` / `SUPPORT_PHONE` /
  `SUPPORT_HOURS`, served at `GET /public/support-contact`) rather than being
  hardcoded in the client, so the number changes with one deploy. The client
  still ships a fallback copy — a support page showing no way to reach support
  is the one failure mode it must not have.
- Creating a ticket fans a notification out to **every** admin, so the route is
  rate-limited (5 / 10 min) well below the global ceiling. The admin's
  notification names the store, or says "(shopper)", so the queue it belongs
  to is clear before anything is opened.
- The reporter's notifications deep-link to **their** view of the ticket,
  which differs per flow (`reporterUrl` in `support.shared.ts`):
  `/support/{id}` for an account thread, `/stores/{slug}/support/{id}` for a
  seller's platform thread, `/store/{slug}/support/{id}` for a shopper's
  thread with a shop.
- **A message's `authorRole` is derived server-side** (`REPORTER`/`STORE`/
  `PLATFORM`) and is what clients render from. `authorType` cannot answer it
  on a store thread: the seller replies from a Customer account, so both
  sides read `CUSTOMER` and telling them apart means comparing the author to
  the ticket's reporter. Doing that once, server-side, stops two clients
  implementing it slightly differently.
- **A shop is messaged through its public identity.** `createStoreTicket`
  resolves the store with `PUBLIC_STORE_VISIBILITY` — the same rule the
  storefront uses — so you can only write to a shop you could have bought
  from, and an owner writing to their own store is refused outright (it would
  land in their own inbox). A seller answers only from their own store's
  subtree, so a ticket id from another shop is a 404.
- **Sellers set status, never priority.** Priority is the platform's triage
  vocabulary; a shop's inbox is small enough to read without one.

### Authentication — the `package/auth` sub-system

> Full architecture reference:
> [`backend/docs/PACKAGE_AUTH.md`](../backend/docs/PACKAGE_AUTH.md). Endpoint payloads:
> [`API.md`](./API.md). Summary below.

All auth lives in **one self-contained package** (`src/package/auth`), built so it can be
extracted into a standalone service later with minimal churn. The rest of the app imports
**only** its facade — `package/auth/index.ts` (route trees, guards, `registerAuthPlugins`)
— and never reaches into the internals. Inside:

- **`core/`** — the generic, domain-free **engine**: access JWT + opaque rotating refresh
  tokens (`AuthSession`-backed, reuse ⇒ all sessions revoked), web-cookie + CSRF and
  mobile-bearer delivery, `requirePrincipal` guard, generic refresh/logout routes.
  Web cookies are namespaced into a **cookie surface per principal**
  (`authConfig.cookieSurface`): customer keeps `access_token`/`refresh_token`/
  `csrf_token` at `/`, admin uses `um_admin_*` with its tokens path-scoped to
  `/api/v1/admin`. The storefront and the console share one origin, and a
  browser keys cookies by `(name, domain, path)` with the **port excluded** —
  a shared namespace meant signing in on one surface evicted the other's
  session and a logout revoked whichever session owned the cookie. Every
  function in `core/cookies.ts` takes the principal type, so the isolation is
  compiler-enforced rather than a convention. Knows
  only a **principal** (`{ id, type, role? }`) — never a credential or domain table. Owns
  its own env parsing (`core/config/env.ts` — JWT, cookie, OTP, OAuth vars; the app's
  `config/env` carries none of them) and the single DB seam (`core/config/prisma.ts`).
  Access JWTs are pinned by `iss`/`aud` claims and carry the minting session's id
  (`sid`), so guards expose `request.{admin,customer}.sessionId` — this is what lets
  a password change keep the current device while revoking every other session
  (`revokeOtherSessions`). The CSRF double-submit check compares in constant time,
  and each login opportunistically deletes that principal's expired session rows,
  so `auth_sessions` never grows unboundedly.
- **`providers/`** — the **pluggable provider layer**: ports (`EmailSender`, `SmsSender`,
  `OAuthVerifier`, `PasswordHasher`) + current adapters: **Resend** email sender (real —
  used when `RESEND_API_KEY` is set, console fallback otherwise), **Message Central**
  SMS OTP (real, provider-managed — used when its credentials are set, console fallback
  otherwise) and real bcrypt. **No OAuth verifier is registered** — the registry's
  `oauth` map is empty (the mock Google verifier file still exists but is unplugged),
  so the Google endpoints answer `400 "GOOGLE sign-in is not enabled"`. The registry
  (`providers/index.ts`) is the one file edited when Google/Apple verification lands.
- **`verification/`** — a generic **code engine** behind every prove-ownership flow
  (phone-OTP login, registration email verification, password reset, linking), with
  TTL + attempt limits in `Otp`. **Email codes are locally generated + hashed** and
  delivered via Resend (never echoed in responses). **SMS codes are provider-managed**
  — Message Central generates/delivers/validates them; we store only its
  `verificationId` (`Otp.providerRef`). Console fallbacks cover missing credentials;
  `OTP_BYPASS` (SMS-only, default on outside production) accepts `OTP_DEV_CODE`.
- **`customer/`** — three sign-in **strategies** (email+password [primary, bcrypt, fully
  real, **verify-first registration** — the account is created only after the emailed
  code is confirmed], Google [**currently disabled** — no verifier registered, the
  endpoints return 400], phone OTP [Message Central delivery, console/`OTP_BYPASS`
  fallback in dev, **login-only** for phones linked via `/me/link` — never creates
  accounts]; Apple planned), each resolving to the same
  `{ principal, customer, isNewUser }` — plus
  self-service: `/me`, orders, change/set password, identifier linking. Password reset
  revokes all sessions; a password change revokes every session **except the one that
  made the change**. Login failures cost the same bcrypt work whether the email exists
  or not (no timing-based account enumeration — same for admin login). Google
  resolution: linked `(provider, sub)` → sign-in; else
  customer owning the provider-verified email → linked; else account created. Accounts
  therefore always start with a **verified email**.
- **`admin/`** — the admin credential provider: email+password check, `/me`. First admin
  via `npm run create-admin` (no signup endpoint).
- **`guards.ts`** — binds `requirePrincipal` to `requireAdmin` / `requireCustomer` and
  declares the `request.admin` / `request.customer` types. `requireAdmin` wraps the whole
  `/admin` resource subtree in `routes.ts`. Wrong-kind token → `403`; missing/invalid →
  `401`. Both guards accept bearer header **or** cookie. Also exports
  `optionalCustomerId(request)` — the **no-throw** variant for public routes that grant
  owner-only extras (used by the public storefront's draft preview): valid customer
  token → its id, anything else → `undefined`.

Strategies return a `principal`; `core`'s `issueSession()` mints the tokens — the engine
never sees a password, OTP, or Google token, which is what makes providers swappable
without touching auth logic.

---

## Data Model (see `prisma/schema.prisma`)

White-label design — one codebase, any business:
- **StoreSetting** — single-row branding/contact/defaults.
- **Category** — self-relation (`parentId`) → arbitrary trees (Sports > Cricket Bat),
  `displayOrder`, `isActive`. Add categories without code changes.
- **Product** — price/discount as `Decimal(10,2)`, `stockQuantity`, JSON `specifications`
  (any product type, no schema change), `status`, `isFeatured`, unique `sku`/`slug`.
- **ProductImage** — multiple per product, one `isCover`, `displayOrder`.
- **Customer** — identified by `email` and/or `phone` (each nullable + unique, so an
  identifier maps to one account), with `emailVerifiedAt` / `phoneVerifiedAt`, optional
  `passwordHash` (null for social/OTP-only accounts) and `avatarUrl`. Guest checkout;
  account not mandatory.
- **Store** — customer-owned store (`ownerId` → Customer, cascade delete; a customer
  can own several). Minimal by design: `name`, unique `slug` (auto-generated,
  stable across renames — the store's public URL identity), `logoKey`
  (the uploaded logo's storage **object key** — responses expose a derived
  `logoUrl`, never the key; supplied at creation and replaceable but never
  removable, so the column is nullable only for stores that predate the
  requirement), a `theme` JSON column for the Appearance settings
  (five colors — background, primary and the nullable secondary/surface/button
  text — plus `templateId` and `themeName` recording which appearance template
  the colors were **copied** from and what the seller named their customised
  palette) so customization evolves without migrations, a `homepage` JSON column holding
  the storefront sections as an **ordered** `{ key, enabled }[]` (`hero`,
  `categories`, `featured`, `newArrivals`, `bestSellers`; default order, all
  enabled — the owner drags to reorder and toggles each). `resolveHomepage`
  normalises it on read, tolerating null, the legacy boolean-map shape, and
  appending any newly-added section key so old stores get it without a
  migration. A `footer` JSON column (same evolve-without-migration pattern)
  holds the owner-managed storefront footer: `locations[]` (max 10 —
  label/address/contactPerson/phone/altPhone/email/hours/isPrimary plus an
  optional `lat`/`lng` map pin; ids minted server-side, exactly one primary
  kept), `social` (facebook/instagram/youtube live + whatsapp/x/linkedin/
  telegram/pinterest future-ready; whatsapp is a number, the rest URLs),
  `info` (about, establishedYear, gstNumber, registrationNumber), `support`
  (email/phone/whatsapp/hours), `policies` (privacy/terms/shipping/returns/
  cancellation as optional external URLs until policy pages land), `links[]`
  (custom label+url, max 10) and `copyrightText` (null = default
  "© {year} {store name}. All Rights Reserved."). `resolveFooter`
  (`stores.schema.ts`) normalises the column on read — each section parses
  independently and falls back to its default, so a malformed value never
  breaks a response — and both the owner responses and the public shell
  return the footer fully resolved. Updated via `PATCH /stores/:id/footer`,
  whose body is any subset of the sections (a present section replaces that
  section wholesale). A `payments` JSON column holds the payment acceptance
  switches `{ acceptOnlinePayment, acceptCod }` — how customers PAY
  (`resolvePayments` defaults: COD on, online off), updated via
  `PATCH /stores/:id/payments`; a `shipping` JSON column holds the
  fulfilment mode `{ mode: DELIVERY | PICKUP | BOTH }` — how customers
  RECEIVE orders (`resolveShipping` default DELIVERY; the shipping-charge
  rules join this column later), updated via `PATCH /stores/:id/shipping`;
  a `checkout` JSON column holds the **checkout field toggles**
  `{ name, phone, email, address, pincode, state, country }` — which
  customer details the checkout collects (`resolveCheckoutFields`, all
  default true; disabled = hidden from the customer and excluded from
  validation), updated via `PATCH /stores/:id/checkout`. All three are
  included resolved in the owner responses and the public shell so the
  checkout knows what a store offers/asks. And `isPublished` (default false) —
  the switch that makes the public storefront page live — plus `publishedAt`,
  stamped on the **first** publish only (never reset), so the marketplace
  "New Stores" index ranks by real publish time and re-publishing an old
  store doesn't bump it back to the top. Module: `modules/stores`
  (owner routes behind `requireCustomer`, ownership enforced in the service —
  foreign ids 404; `:id` params accept id or slug). A separate unauthenticated
  surface under `/api/v1/public/stores/:slug` serves **published** stores only
  (unpublished → 404) — except for the **owner draft preview**: the customer
  session is resolved best-effort (`optionalCustomerId`, never a 401) and an
  unpublished store resolves for its own owner, with `isPublished: false` in
  the shell so the client can flag the draft. It is **split per storefront
  page** rather than
  returning one catalog blob — shell (branding + category tree, no products),
  `/home` (merchandising sections), `/products` (paginated, filtered and
  sorted in SQL), `/categories/:categorySlug` and `/products/:productSlug` —
  so a store with thousands of products never ships its whole catalog to
  render a page. Implemented in `publicStore.{schema,service,controller}.ts`.
- **StoreCategory / StoreProduct / StoreProductVariant** — the catalog
  *inside* a customer store (separate from the admin's global
  Category/Product), following Store → Category → Subcategory (optional) →
  Product → Variants. `StoreCategory` has an optional `parentId`
  self-relation, **one level deep** (a subcategory can't have children —
  service-enforced; parent must be a root of the same store), `name` unique
  per store, deletes `Restrict`ed (category with products or subcategories
  → 409). Both `StoreCategory` and `StoreProduct` carry a **`slug`** that is
  unique per store, generated from the name on create and **stable across
  renames** — it is the storefront's URL identity
  (`/store/{storeSlug}/category/{slug}`, `.../product/{slug}`), so a rename
  never breaks a shared link. `StoreProduct` also carries owner-controlled
  **merchandising flags** (`isFeatured`, `isBestSeller`, `isNewArrival`,
  `hideFromSearch`). Each section flag maps to **exactly one** storefront
  homepage row and nothing else — the sections are strictly flag-driven with no
  fallback, so a flag never leaks a product into another row.
  `StoreCategory.isFeatured` drives the Shop-by-Category row (when no category is
  starred, that row falls back to all categories).
  `StoreProduct` requires a category — root or subcategory — of the
  same store, and holds only `name` + optional `description`: it has **no
  price or stock column**. **The variant is the unit of sale** —
  `StoreProductVariant` (cascade delete with its product) is a labeled
  variation ("Red / 128 GB") carrying a **required** `price Decimal(10,2)`,
  its own `stockQuantity`, and `name` unique per product. Every product owns
  at least one variant: a product without options carries a single implicit
  one flagged `isDefault`, so there is exactly one place a price can live.
  Adding the first real option removes that default; deleting the last option
  demotes it back to the default (keeping price/stock) rather than leaving
  the product unsellable. Product-level `price` (cheapest), `priceMax`,
  `stockQuantity` (total) and `hasVariants` are **derived** in the service and
  are read-only; the public storefront never sees the default variant, so a
  simple product still arrives with `variants: []`.
  **Denormalised aggregates:** `StoreProduct` also stores `priceMin` /
  `priceMax` / `stockTotal`, maintained by `recomputeProductAggregates()`
  (`modules/stores/catalogSlug.ts`) on every variant mutation and on product
  create, mirroring the **sellable** view (active variants only). They exist
  because price lives on the *variant*, so without them the storefront could
  not sort or filter by price in SQL — it would have to load every product
  into memory, defeating pagination. `priceMin = null` means nothing is
  sellable, which is exactly the "hide from the storefront" condition the
  public queries filter on. The helper accepts a transaction client so it
  commits atomically with the variant change that triggered it.
  The mandatory category is what enforces the setup
  sequence: category first, then products. All three carry `isActive`
  (default true) — the enable/disable switch for the public storefront: a
  product is publicly visible only when it and its category chain are
  active (a disabled root hides its subcategories' products); disabling
  never touches the children's own flags. **Enabling a product requires at
  least one photo** (`400` otherwise): the photo cannot be demanded at create
  time — media is attached by product id, so it can only follow the product —
  so the invariant is enforced at the moment the product would become
  visible. Disabling is never blocked.
  Handled by the `storeCatalog.*` files in `modules/stores` (routes nested
  under `/stores/:id/…`, same ownership rules), with slug/aggregate helpers in
  `catalogSlug.ts` and the anonymous storefront surface in `publicStore.*`.
- **StoreBankAccount** — a seller **payout account** (cascade delete with its
  store; unique per store on `accountNumber + ifsc`; service caps at 5).
  Fields: holder name, account number (9–18 digits), IFSC, bank name,
  branch, optional UPI id. Exactly **one per store is `isPrimary`** — the
  only account that receives payouts from UnieMax (first saved account is
  primary automatically; promoting one demotes the current primary in the
  same transaction; deleting the primary never auto-promotes — the payout
  target must be an explicit choice, payouts hold until one is picked).
  **Verification is provisioned, not wired**: `verificationStatus`
  (`PENDING`/`VERIFIED`/`FAILED`, default `PENDING`), `verificationMethod`
  (`THIRD_PARTY` account-validation provider / `MANUAL` by a UnieMax admin
  from the future admin panel), `verificationRef` (provider check id),
  `verifiedBy` (admin id), `verificationNote`, `verifiedAt`. Editing any
  bank detail of a verified account resets it to `PENDING`
  (service-enforced). Handled by the `storeBank.*` files in
  `modules/stores` (owner routes under `/stores/:id/bank-accounts`).
- **StoreProductMedia** — media attached to a store product (cascade delete):
  up to **8 IMAGEs + 1 VIDEO** (service-enforced), each holding a storage
  **object key** (never a URL), optional `altText` (accessibility) and
  `displayOrder`. The image with the lowest `displayOrder` is the product's
  **cover** — there is no separate cover flag to fall out of sync. Reordering
  rewrites the image orders 0..n-1; the video sits at a high order outside
  the image sequence. Owner endpoints under
  `/stores/:id/products/:productId/media` (upload/replace are multipart);
  the public listing sends only the cover, the product page the full gallery.
- **CustomerAddress** — the customer's **address book** (cascade delete
  with the customer; service caps at 10). Fields: optional `label`
  ("Home"/"Work"), name, phone, optional email, addressLine, pincode,
  state, country (default "India"). Exactly one per customer is
  `isPrimary` — the default checkout suggestion (first saved is primary
  automatically; promoting demotes the current one transactionally;
  deleting the primary promotes the oldest remaining — unlike payout
  accounts, an address book should always have a default). Module:
  `modules/addresses` behind `requireCustomer` at `/api/v1/addresses`;
  checkout reads the list as selectable suggestions.
- **OAuthAccount** — social identity linked to a Customer; unique on
  `(provider, providerAccountId)` (the provider's stable `sub`). Supports Google now,
  Apple later (enum value already present).
- **Order / OrderItem** — customer orders, placed **per store** at the
  storefront checkout (`modules/orders`; placement runs behind
  `requireCustomer` — only signed-in customers can order, and every order
  is attached to its account; browsing and the cart stay anonymous, and
  the confirmation lookup is public). Order snapshots the store
  (`storeId` SetNull + `storeName`/`storeSlug`), fulfilment
  (`OrderFulfilment`: DELIVERY/PICKUP), the contact + delivery fields (all
  **nullable** — sellers choose what their checkout collects), money
  (subtotal/shipping/total), `paymentMethod` (ONLINE/COD/…),
  `paymentStatus`, `paymentRef` (Cashfree `cf_payment_id` once paid, or
  `"DEV-SIMULATED"` when the gateway keys are absent in dev), plus the
  gateway attempt fields `cfOrderId` (unique — the order id registered
  with Cashfree, `orderNumber` or `orderNumber~R<n>` on retries) and
  `paymentSessionId` (latest Cashfree session for the web SDK; see
  `docs/CASHFREE_PAYMENTS.md`). Items reference
  `StoreProduct`/`StoreProductVariant` (SetNull)
  and snapshot name/variant label/slug/cover `imageKey`/price, so history
  survives catalog edits and deletions. Order creation re-prices every
  line from the live catalog, enforces the seller's payment/shipping/
  checkout configs, and decrements variant stock with a **guarded
  `updateMany` inside the transaction** (concurrent orders can't oversell),
  recomputing product aggregates in the same transaction.
  **Seller order management** (owner-scoped under `/stores/:id/orders`):
  list (status/search filters, paginated), detail, `PATCH …/status`
  (forward-only lifecycle `PENDING → CONFIRMED → PACKED → SHIPPED →
  DELIVERED`, jumps ahead allowed — pickup orders skip SHIPPED; each move
  stamps `confirmedAt`/`packedAt`/`shippedAt`/`deliveredAt`; delivering a
  COD order flips `paymentStatus` to PAID) and `POST …/cancel` (only before
  SHIPPED; stamps `cancelledAt` + optional `cancelReason`, **restores item
  stock** and recomputes aggregates transactionally, **terminates the
  Cashfree order** of an unpaid ONLINE order so the returned stock can't
  still be paid for, flips a PAID payment to REFUNDED — status only; the
  Cashfree refund API call is a planned follow-up). Both mutations use a guarded
  `updateMany` re-checking the read status, so concurrent updates conflict
  (409) instead of double-applying.
- **ShippingRule** — `FIXED` / `DISTRICT` / `STATE` / `FREE` with `priority`.
- **Otp** — hashed verification code with `channel` (SMS/EMAIL), `destination`, `purpose`
  (LOGIN / LINK / EMAIL_VERIFY / PASSWORD_RESET / ORDER_PLACEMENT), optional `customerId`
  (account-bound codes), expiry + attempts.
- **StoreThemeTemplate** — a curated storefront palette a seller applies in one
  click (`name`, `description`, `isActive`, `displayOrder` + a `theme` JSON
  column holding the same five colors as `Store.theme`). Deliberately holds
  **colors and nothing else**, and there is **no relation to Store**: applying a
  template copies its colors onto the store, so editing, disabling or deleting
  one never changes a storefront, and a seller's customisation never writes
  back. Sellers see `isActive` rows only; `/admin/theme-templates` owns the
  full list. Seeded from real, well-configured stores (colors only) by
  `npm run seed-theme-templates`.
- **Banner** — home carousel.
- **Admin** — email + hashed password, roles (multi-admin ready).
- **AuthSession** — refresh-token session for `package/auth/core`. Domain-agnostic on purpose:
  opaque `principalId` + `principalType` (no FK), `refreshHash` (sha256, unique), `role`
  snapshot, `expiresAt`, `revokedAt`, `replacedById` (rotation chain), `userAgent`/`ip`.
- **PushSubscription** — one browser's Web Push registration.
  Domain-agnostic like `AuthSession`: opaque `principalId` +
  `principalType` (`ADMIN`/`CUSTOMER`), never a FK. `endpoint` is **unique** —
  the browser keeps it stable, which is what makes re-subscribing idempotent
  — plus the device's own `p256dh`/`auth` keys (they encrypt the payload, so
  the push service can't read it). `disabledAt` retires an endpoint the push
  service permanently rejected (404/410) or that failed `failureCount` ≥ 5
  times in a row; a returning endpoint clears both.
- **Notification** — the delivered-notification feed, so a recipient has a
  bell menu independent of whether a push reached a device. Same opaque
  principal. `kind` (`ORDER_PLACED`/`ORDER_STATUS`/`PAYMENT`/`STORE`/
  `ACCOUNT`/`ANNOUNCEMENT`), `title`, `body`, optional in-app `url` and `data`
  JSON, `readAt`. Indexed for the two queries that exist: the feed and the
  unread count.
- **SupportTicket / SupportTicketMessage** — the seller↔platform
  conversation (`modules/support`). The ticket is owned by the `Customer`
  who raised it (cascade) and optionally points at the `Store` it is about
  (`SetNull` + a `storeName` snapshot, so a deleted store never takes the
  thread with it). Carries a quotable `ticketNumber` (unique,
  "TKT-MT66KRBQ-FDYR"), `subject`, `category`
  (`SupportTicketCategory`), `status` (`SupportTicketStatus` —
  OPEN/IN_PROGRESS/RESOLVED/CLOSED), `priority` (`SupportTicketPriority`,
  admin-set), `contactEmail`/`contactPhone` **snapshots** (an account's email
  can change; a ticket must stay answerable by the details actually given),
  and `lastMessageAt` — bumped by every message on either side, so the queue
  sorts by "who is waiting longest" without joining the message table.
  `recipient` (`SupportRecipient` — PLATFORM/STORE) says **who answers**, the
  one thing `storeId` cannot express: a seller writing *about* a store and a
  shopper writing *to* it both name the same store. Together the two columns
  separate all three flows with nothing to keep in sync.
  `SupportTicketMessage` is one post in the thread: `authorType` reuses
  `PrincipalType` (the same vocabulary as sessions and notifications) with an
  `authorName` snapshot, so a thread still reads correctly after an admin
  account is removed.
- **AdminAuditLog** — append-only record of every state-changing admin
  action. Nothing in the app updates or deletes a row, which is what keeps it
  trustworthy for an incident review. Holds `adminId` **plus a snapshot of
  `adminEmail`** (the trail outlives the account), a dotted `action`
  (`store.suspend`, `customer.block`…), `entityType`/`entityId`, free-form
  `meta` (previous value, reason, affected counts), `ip` and `userAgent`.
- **Store** additions: `suspendedAt` / `suspendedReason` — the admin
  moderation switch, independent of the owner's `isPublished` (see "The
  platform admin console").
- **Customer** additions: `blockedAt` / `blockedReason` — set when an admin
  blocks the account; every sign-in strategy checks it and blocking revokes
  all sessions.

Enums: `ProductStatus`, `OrderStatus`, `PaymentMethod`, `PaymentStatus`, `ShippingType`,
`OtpChannel`, `OtpPurpose`, `AuthProvider`, `AdminRole`, `StoreMediaType`,
`BankVerificationStatus`, `BankVerificationMethod`, `PrincipalType`,
`NotificationKind` (includes `SUPPORT`), `SupportRecipient`,
`SupportTicketStatus`, `SupportTicketCategory`, `SupportTicketPriority`.

---

## Database & Prisma 7 Notes

- **Two connection URLs** (Supabase):
  - `DATABASE_URL` — pooled (PgBouncer, `:6543`, `?pgbouncer=true`). Used by the app at
    runtime via the pg **driver adapter**.
  - `DIRECT_URL` — direct (`:5432`). Used by the Prisma CLI for migrations.
- In Prisma 7 the schema `datasource` has **no `url`** — connection config lives in
  `prisma.config.ts` (migrations) and in the `PrismaClient({ adapter })` constructor
  (runtime). The client is generated into `src/generated/prisma` so it typechecks under
  the strict `rootDir`.
- **Formal migrations are adopted**: `prisma/migrations/0_init` is the
  baseline of the full schema (marked applied on the existing database via
  `prisma migrate resolve`). Workflow: edit `schema.prisma` → `npm run
  db:migrate` (dev — creates + applies a migration) → commit the migration
  folder → `npm run db:deploy` on production. `npm run db:status` shows
  pending migrations. `prisma db push` is no longer used.

---

## NPM Scripts

| Script            | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `npm run dev`     | `tsx watch src/server.ts` (hot reload)              |
| `npm run build`   | `tsc` → `dist/`                                      |
| `npm start`       | `node dist/server.js`                               |
| `npm run typecheck` | `tsc --noEmit`                                    |
| `npm run db:check`  | Connectivity probe (`SELECT 1;` over `DIRECT_URL`) |
| `npm run db:migrate` | Create + apply a migration from schema changes (dev) |
| `npm run db:deploy` | Apply pending migrations (production deploys)      |
| `npm run db:status` | Show applied/pending migrations                    |
| `npm run create-admin -- <email> <pw> [name]` | Bootstrap/reset an admin account |
| `npm run push-keys` | Generate a VAPID key pair for Web Push (run once per environment) |
| `npm run backfill-catalog` | Fill missing category/product slugs, recompute price aggregates, stamp `publishedAt` on pre-column published stores (idempotent) |
| `npm run seed-theme-templates` | Create the five starter store appearance templates — palettes (colors only) lifted from real configured stores, topped up from curated fallbacks. Idempotent; `-- --force` tops an existing table back up to five |
| `npx prisma generate` | Regenerate client after schema edits            |

**Environment files are layered, never edited to switch.** `config/loadEnv.ts`
resolves `mode = APP_ENV ?? NODE_ENV ?? "development"` and loads
`.env.<mode>` (wins) then `.env` (shared fallback). It is the **first import**
of every entrypoint — `server.ts`, `prisma.config.ts`, and the `scripts/` —
so the Prisma CLI always targets the same database the server would. The
`import "dotenv/config"` lines inside `package/*` stay as extraction-ready
fallbacks; they no-op once the loader has run. Invariant: a key lives in
either `.env` or a per-mode file, never both. `config/env.ts` prints
`env: mode=… NODE_ENV=… db=<host> web=…` at boot. On the server pm2 supplies
`APP_ENV=production` via `backend/ecosystem.config.cjs`.

Key env vars. App-level (`config/env.ts`): `DATABASE_URL`, `DIRECT_URL`, `CORS_ORIGIN`,
`TRUST_PROXY`, plus `HOST`/`PORT`/`LOG_LEVEL`, the platform support contact
`SUPPORT_EMAIL` / `SUPPORT_PHONE` / `SUPPORT_HOURS` (all defaulted to the live
UnieMax details, so no environment has to set them), and the Cashfree gateway set
`CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` / `CASHFREE_ENV`
(`sandbox`/`production`) / `CASHFREE_API_VERSION` (`2023-08-01`) /
`PUBLIC_API_URL` (webhook `notify_url` origin) — see
`docs/CASHFREE_PAYMENTS.md`. Mail-level
(`package/mail/index.ts`): reuses `RESEND_API_KEY`/`EMAIL_FROM`, plus optional
`PUBLIC_WEB_URL` (storefront origin for deep links in order emails).
Push-level, parsed by `package/push/config.ts`: `VAPID_PUBLIC_KEY` /
`VAPID_PRIVATE_KEY` (both required for real delivery — without them a console
driver logs instead), optional `VAPID_SUBJECT` (contact URL/mailto) and
`PUSH_TTL_SECONDS` (86400). Generate the pair with `npm run push-keys`;
rotating it invalidates every existing browser subscription — see
`docs/PUSH_NOTIFICATIONS.md`.
**Production fail-fast guards** — with `NODE_ENV=production` the server
refuses to boot when: `DATABASE_URL`/`DIRECT_URL` missing, `CORS_ORIGIN="*"`,
`OTP_BYPASS=true`, `AUTH_COOKIE_SECURE=false`, `JWT_SECRET` shorter than 32
chars, `STORAGE_DRIVER` is not `s3`, or only one of the two Cashfree keys
is set. Auth-level, parsed by the package itself
(`package/auth/core/config/env.ts`): `JWT_SECRET` (required), `JWT_ACCESS_EXPIRES_IN`
(access TTL, `15m`), `JWT_ADMIN_EXPIRES_IN` / `JWT_CUSTOMER_EXPIRES_IN` (**refresh**
TTLs, `7d` / `30d`), `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAMESITE` / `AUTH_COOKIE_DOMAIN`,
`OTP_LENGTH` / `OTP_TTL_MINUTES` / `OTP_MAX_ATTEMPTS` / `OTP_BYPASS` / `OTP_DEV_CODE`,
delivery providers `RESEND_API_KEY` / `EMAIL_FROM` (email) and
`MESSAGE_CENTRAL_CUSTOMER_ID` / `MESSAGE_CENTRAL_AUTH_TOKEN` /
`MESSAGE_CENTRAL_SEND_URL` / `MESSAGE_CENTRAL_VERIFY_URL` / `SMS_COUNTRY_CODE` (SMS
OTP), and `GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` (for the real OAuth verifiers later).
Storage-level, parsed by `package/storage/config.ts`: `STORAGE_DRIVER`
(`local` default / `s3`), `AWS_REGION` / `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY`, `STORAGE_LOGO_BUCKET` / `STORAGE_MEDIA_BUCKET`
(required when `s3`), optional `STORAGE_LOGO_PREFIX` /
`STORAGE_MEDIA_PREFIX` (folder inside the bucket — lets both kinds share one
physical bucket; applied at the driver, never stored in DB keys), optional
`STORAGE_LOGO_PUBLIC_URL` /
`STORAGE_MEDIA_PUBLIC_URL` (CDN bases), `STORAGE_LOCAL_DIR` (`uploads`), and
the upload rules `MEDIA_MAX_IMAGE_MB` (5) / `MEDIA_MAX_VIDEO_MB` (50) /
`MEDIA_MAX_LOGO_MB` (2) / `MEDIA_IMAGE_TYPES` / `MEDIA_VIDEO_TYPES`. All read
from the same `.env`.

---

## Status & Roadmap

**Done:** base server, env/logging, Prisma wiring, error/response conventions, health
check, **Category** + **Product** APIs (public browse + admin CRUD), standalone
**`package/auth`** (access + rotating refresh tokens, DB-backed sessions, reuse detection,
**web-cookie + mobile-bearer** profiles, CSRF, provider-agnostic strategy layer) powering
**admin** (password) and **customer** (email+password · phone OTP) auth with
self-service profile/orders/verification/linking, with **real delivery providers** —
Resend (email) and Message Central (SMS), each with a console fallback when
credentials are absent. Google sign-in is **disabled** (no verifier registered). All
verified end-to-end.

Also done: **marketplace discovery** (`modules/discovery` + the public store
index in `modules/stores`) powering the marketplace homepage —
`GET /public/stores` (published stores, newest publish first via
`Store.publishedAt`), `GET /public/search` (grouped stores/categories/products;
capped per group; category/product hits carry their owning store) and
`GET /public/stats` (60 s in-process cache). All three reuse the storefront's
exported `PUBLIC_PRODUCT_VISIBILITY` rule (`publicStore.service.ts`), so
discovery can never surface what a store page would hide.

Also done: **orders** — `modules/orders` places per-store orders from the
storefront checkout (**signed-in customers only** — placement runs behind
`requireCustomer`; guests browse and fill a cart but must sign in to
order), re-pricing from the live catalog,
enforcing the seller's payment/shipping/checkout-field configs, and
decrementing stock transactionally. COD is live end-to-end; ONLINE payment
runs through **Cashfree** (`modules/payments` — session on placement,
HMAC-verified webhook, reconcile fallback, pay/retry endpoint; see
`docs/CASHFREE_PAYMENTS.md`) when the gateway keys are configured, and
falls back to the dev **simulation** (`paymentRef: "DEV-SIMULATED"`) /
production 503 without them. The module also serves
the anonymous confirmation lookup, the customer's order history
(`GET /orders`), the per-store **seller dashboard**
(`GET /stores/:id/dashboard` — today's/pipeline counters, revenue, latest
orders) and **seller order management** (`/stores/:id/orders` —
list/detail, forward-only status progression with lifecycle stamps, and
pre-shipment cancellation with transactional stock restore). **Order
emails** (`orders.notifications.ts` over `package/mail`) fire-and-forget on
placement (customer confirmation + seller alert) and on Confirmed /
Shipped / Delivered / Cancelled (customer) — a mail failure never fails
the order flow.

Also done: the **platform admin console** (`modules/admin`, behind
`requireAdmin`) — one-request dashboard (totals, today, per-day series, order
pipeline, payment split, top stores/products, low stock, integration health),
store + seller oversight with **suspension**, customer oversight with
**blocking** (revokes every session), platform-wide order and payment views,
seller-catalog oversight with a **hide/restore** moderation switch, **manual
payout-account verification**, an append-only **audit trail** of every admin
write, and SUPER_ADMIN-only **admin-account management** (create / role /
deactivate / password reset, each revoking that admin's sessions). Verified
end to end against the live database.

Also done: **notifications + Web Push** — `package/push` (VAPID, `web-push`,
console fallback) under `modules/notifications` (feed, per-device
subscriptions, `notify()`/`notifyAdmins()` dispatch, admin broadcast).
Order placement and every status change now fire email **and** push from the
same function; store suspension, product moderation and payout verification
notify the seller. Full reference: `docs/PUSH_NOTIFICATIONS.md`.

Also done: **support tickets** — `modules/support` covers all three
conversations the product has, over one table:

1. **Shopper → UnieMax** from the account menu's Help & Support.
2. **Seller → UnieMax** from their store's UnieMax Support section.
3. **Shopper → the shop they buy from**, raised at
   `/store/{slug}/support` and answered by the owner in that store's
   Customer Support section.

`recipient` + `storeId` separate them; the console answers (1) and (2) from
one queue filterable by audience and never sees (3). Every message and status
change notifies the other side over the existing feed + Web Push, and every
admin write lands in the audit trail.

**Not yet (hooks in place):**
1. **Cashfree refunds** — cancelling a paid order marks REFUNDED (status
   only); the actual refund API call is manual (Cashfree dashboard) until
   wired. Also: automatic expiry/cancel sweep for abandoned unpaid ONLINE
   orders (they hold stock until the seller cancels).
2. Shipping-charge calculation (orders currently ship free), Inventory
   alerts, Banners.
3. OAuth verification: Google (verifier currently unregistered — endpoints return 400)
   and Apple Sign-In. Email (Resend) + SMS (Message Central) delivery are DONE;
   adapters slot into `package/auth/providers/` — see
   [`backend/docs/PACKAGE_AUTH.md`](../backend/docs/PACKAGE_AUTH.md).
4. (Media storage is DONE —
   `package/storage` with S3 + local drivers powers store logos and product
   images/videos; switch to S3 via `STORAGE_DRIVER=s3` + bucket env vars.
   Payments provider is DONE — Cashfree, `modules/payments`.)
5. Socket.IO real-time layer.
6. Formal Prisma migrations for production.

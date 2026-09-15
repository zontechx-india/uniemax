# Affiliate System — Seller-Run Affiliate Marketing

> **Status: Phases 0–2 implemented (September 2026).** Programmes, invitations,
> partner links, click attribution, per-line commissions with delivery + hold
> approval, and the seller / partner / admin screens are live on the dev
> database. Phase 3 (payouts) waits for the platform ledger. This document is
> the knowledge base for the subsystem: business model, architecture, data
> model and what is still open — keep it current as the code changes.
> Endpoints are documented in `API.md`; the Prisma models in
> `BACKEND_CONTEXT.md`; the screens in `FRONTEND_CONTEXT.md`.
>
> Read alongside [CONTEXT.md](./CONTEXT.md) (product spec),
> [BACKEND_CONTEXT.md](./BACKEND_CONTEXT.md) (engineering reference) and
> [API.md](./API.md) (endpoint reference).
>
> **Doc ownership:** this file owns affiliate business rules, the data model, the
> package boundary and the extraction plan. Once endpoints ship they are
> documented in `API.md` like every other route; the Prisma models go in the
> `BACKEND_CONTEXT.md` Data Model section. The sketches here are the design, not
> a second copy of either.

---

## 1. What this is

A **seller-run, store-level** affiliate programme. UnieMax supplies the
infrastructure — invitations, links, click tracking, attribution, commission
calculation, payout records. Each seller owns and funds their own programme.

```text
UnieMax Platform            <- infrastructure + platform guardrails
   |
   +-- Store A              Affiliate programme: ON   Commission 10%
   |     +-- Affiliate Rahul
   |     +-- Affiliate Anu
   |
   +-- Store B              Affiliate programme: OFF
   |
   +-- Store C              Affiliate programme: ON   Commission 7%
         +-- Affiliate Rahul
```

One affiliate can partner with many stores, each with its own rate. An invited
person does **not** need an existing UnieMax account — they create one during
invitation acceptance.

### Terminology

| Term | Meaning |
| --- | --- |
| **Affiliate programme** | A store-level configuration enabling external partners to promote that store's eligible products. |
| **Affiliate (partner)** | A person who promotes products for commission. One row per person, platform-wide. |
| **Store affiliate** | The relationship between one affiliate and one store — rate, status, links, commissions. |
| **Invitation** | A seller-issued, tokenised invite that creates a store affiliate on acceptance. |
| **Affiliate link** | A short public token resolving server-side to (affiliate, store, product?, channel?). |
| **Attribution** | The server-side record that a visitor arrived via a link, valid for the store's window. |
| **Commission** | The amount owed to an affiliate for a qualifying order line. |

---

## 2. Architecture: a self-contained package, built to be lifted out

Affiliate ships **inside the existing backend and frontend**, as a self-contained
package in each — not as a second process, second database or second repo. It
runs in the same pm2 app, on the same port, against the same database, deployed
by the same workflow.

The isolation is not about runtime. It is about **being able to lift the folder
out into a standalone service later without rewriting it**. Every rule below
exists to serve that one goal.

This is the shape the codebase already uses. From
[`package/storage/types.ts`](../backend/src/package/storage/types.ts):

> _"Swapping AWS S3 for Cloudflare R2, MinIO, Azure Blob or GCS means writing one
> new driver implementing these three methods — no database or module changes."_

The affiliate package works the same way, except the swappable driver is **the
host platform itself**: an in-process driver today that reads the core's Prisma
and modules directly, and an HTTP driver on extraction day. The package's own
code — domain logic, repositories, routes — does not change when that swap
happens.

```text
        ┌──────────────── package/affiliate ────────────────┐
        │  api/      domain/      data/      events/        │   never changes
        └───────────────────┬───────────────────────────────┘
                            │  AffiliateHost  (types.ts)         ← the boundary
        ┌───────────────────┴───────────────────────────────┐
        │  hosts/inProcess.ts        hosts/remote.ts        │   swap one for
        │  (today: direct Prisma)    (later: HTTP to core)  │   the other
        └───────────────────────────────────────────────────┘
```

### The rules that keep it liftable

1. **No relative import escapes the package folder.** Not `../../modules/orders`,
   not `../../config/prisma`. The only permitted outbound imports are the
   portable primitives that would move with it — `utils/httpError`,
   `utils/response`, `utils/zodHelpers`, `package/auth` — and they are listed
   here so the list is checkable, not vibes.
2. **Everything the package needs from the platform is declared in `types.ts`**
   as the `AffiliateHost` interface, and obtained through it. Stores, products,
   order snapshots, mail, notifications, the ledger.
3. **The Prisma client is injected, never imported.** `registerAffiliate(app,
   { prisma, host })` is the single wiring point.
4. **Affiliate tables live in their own Prisma schema file** and are prefixed
   `affiliate_`. No foreign key points out of them (§5).
5. **The core never imports the affiliate package.** One registration call in
   `app.ts`, and one nullable column on `Order` that the core does not interpret.
6. **Event handlers are idempotent from day one**, keyed by
   `(eventType, orderId)`. Today the emitter is in-process and can't lose an
   event; after extraction it can redeliver. Handlers must not care which world
   they are in.
7. **Never use a transaction that extraction would take away.** Attribution is
   resolved in an event handler, not inside `createOrder`'s transaction, even
   though in-process it could be. Behaviour is then identical before and after
   the split. This is the discipline that makes extraction day boring.

### Ownership boundaries

| Owns | Where |
| --- | --- |
| Product, category, price, inventory, the eligibility flag's source | core — `modules/stores` |
| Cart, order, order items, status, cancellation, return | core — `modules/orders` |
| Payments, refunds, gateway transactions | core — `modules/payments` |
| Programmes, affiliates, invitations, links, clicks, attribution, commission, campaigns, coupons, analytics, payout records | **`package/affiliate`** |

Affiliate stores affiliate _configuration_, never a duplicate product catalog.

---

## 3. Backend layout

`backend/src/package/affiliate/` — mirroring the `config.ts` / `types.ts` /
`drivers` / `index.ts` shape that `package/storage` and `package/push` already
use, with `hosts/` as this package's drivers.

```text
backend/src/package/affiliate/
  index.ts              # PUBLIC facade — registerAffiliate(app, { prisma, host })
  types.ts              # THE boundary: AffiliateHost + the DTOs it trades in
  deps.ts               # the injected prisma + host, filled once at registration
  config.ts             # env-driven tunables (max %, invite expiry, click retention)
  domain.ts             # pure rules: rate resolution, amounts, tokens — no I/O
  guards.ts             # requireAffiliate
  schema.ts             # every Zod schema
  README.md             # the extraction checklist (§16b), kept beside the code

  hosts/
    inProcess.ts        # today — reads core Prisma + modules directly
                        # (remote.ts — later, HTTP against the core)

  services/             # Prisma is the data layer, as in every module
    program.ts          # programme config, product rules, seller summary, partners
    invitations.ts      # create / list / withdraw / preview / accept
    partner.ts          # profile, stores, products, links, admin account list
    tracking.ts         # click → attribution
    commissions.ts      # create-from-order, lifecycle, approval job, lists, totals

  routes/               # thin handlers, one file per audience
    seller.ts  partner.ts  public.ts  admin.ts

  events.ts             # subscribers to order events + the hourly approve/prune job
```

Deliberately fewer files than first sketched: the codebase's own modules keep
Prisma as the repository layer and handlers thin enough to live in the routes
file, and this package follows suit. `domain.ts` is the part worth the most and
cheapest to move — pure functions, no Prisma, no Fastify, no host.

### Wiring — the entire contact surface with the core

```text
backend/src/app.ts
  await registerAffiliate(app, { prisma, host: createInProcessHost(prisma) })

backend/src/package/events/        # typed in-process emitter (~40 lines)
  orders + payments publish; affiliate subscribes. The core never
  references affiliate by name.

backend/prisma/schema/             # Prisma 7 multi-file schema support
  core.prisma                      # @db.GeneratedValue, existing core models
  affiliate.prisma                 # affiliate_* models, own file → affiliate schema
```

**Prisma 7 schema folder:** Both files share one datasource and generate one
Prisma client (`prisma generate`). Migrations from both land in `prisma/migrations/`
by timestamp. To deploy to the separate `affiliate` schema, add a schema
specification in `affiliate.prisma`:

```prisma
// prisma/schema/affiliate.prisma
datasource db {
  provider = "postgresql"
}

model AffiliateProgram {
  // ...
  @@schema("affiliate")  // ← explicit schema assignment
}
```

On extraction that file leaves with the package; the core keeps `core.prisma`
unchanged.

The **one** core schema change the whole system needs:

```prisma
// prisma/schema/core.prisma
model Order {
  // …
  /// Opaque affiliate attribution token captured at checkout. The core
  /// stores it and never interprets it; the affiliate package resolves it.
  affiliateRef String?
}
```

---

## 4. Frontend layout

`frontend/src/packages/affiliate/` — a new top-level folder beside `admin/`,
`storefront/` and `shared/`, mirroring the backend's `package/` idea: one
self-contained folder that owns every affiliate screen, hook and API call, and
exposes route objects the host apps mount.

```text
frontend/src/packages/affiliate/
  index.ts              # PUBLIC facade: route arrays + attribution helpers
  config.ts             # AFFILIATE_API_BASE — one constant to repoint
  api.ts                # typed client: seller · partner · public · admin
  attribution.ts        # localStorage token from /a/:token, per store
  ui.tsx                # useLoad, StatTile, StatusChip, Pager, TabNav, CopyButton…
  pages/
    ClickPage.tsx       # /a/:token
    InvitePage.tsx      # /affiliate/invite/:token — public, pre-auth
    CommissionsTable.tsx# shared by all three audiences
    partner/            # PartnerLayout + Overview · Stores (+ products, get link) · Links · Commissions
    seller/             # AffiliateLayout + Programme · Products · Partners · Commissions
    admin/              # AffiliateAdminPage — accounts, commissions, run approval
```

### Mounting — four imports, no other coupling

```text
storefront/app/router.tsx        + affiliatePublicRoutes (spread), affiliatePartnerRoutes
                                   (account subtree), affiliateSellerRoutes (manage children)
storefront/pages/stores/StoreSectionNav.tsx   + the "Marketing" group
admin/app/router.tsx             + /affiliates → pages/admin/AffiliateAdminPage
storefront/pages/cart/CheckoutPage.tsx        + getAttribution / clearAttribution
```

**Direction of dependency:** host apps import from the affiliate package. The
package imports from `shared/` and from exactly four host files —
`storefront/app/marketSession` and `storefront/features/auth/authDialogStore`
(is the visitor signed in / open sign-in, on the invite page),
`storefront/features/stores/useManagedStore` (which store, read once in
`AffiliateLayout`) and `storefront/pages/stores/ActiveSwitch` (the catalog
toggle, reused on the Products tab). They are listed here so they stay the
_only_ ones; on extraction they are what the new app has to provide.

---

## 5. Identity and auth

**Do not create a third principal type.** `PrincipalType` is `ADMIN | CUSTOMER`
and drives sessions, notifications and push. An affiliate is a **Customer with an
`Affiliate` profile row** — precisely how a seller is a Customer who owns a
Store.

```text
Customer (the login)
   |
   +-- Store[]        -> this person is a seller
   |
   +-- Affiliate?     -> this person is an affiliate
         |
         +-- StoreAffiliate[]   -> one per store partnership
```

One guard, living inside the package:

```text
requireCustomer   (existing, package/auth)  -> valid customer token
requireAffiliate  (new, package/affiliate)  -> loads the Affiliate row for
                                               that customer, 403 if absent
                                               or suspended
```

Seller routes verify store ownership through `AffiliateHost.assertStoreOwner()`
rather than a local join — the same call that becomes an HTTP request later.
Admin-on-behalf-of-a-seller reuses the same handlers with an admin actor, so
support never gets a parallel implementation that can drift.

**Invitee with no account:** the invitation link is public. Acceptance is
`register (or sign in) -> accept`, with the invitation token carried through the
auth flow so the relationship attaches to the new customer account. No second
identity system, no separate affiliate password.

**IDs:** `Affiliate` has its own `id`. Never use `customerId` as the affiliate
identifier — the distinction matters the moment an affiliate is suspended
independently of their shopping account.

> On extraction, token signing moves from HS256 with a shared secret to
> RS256/EdDSA with a JWKS endpoint, so the standalone service can verify without
> being able to mint. Nothing else in §5 changes. Noted in the checklist (§16b),
> not needed now.

---

## 6. Database schema

### Separate `affiliate` schema in Supabase

All affiliate tables live in their own **`affiliate` schema** on the same Supabase
instance as the core. This is **Option 1** — chosen for clean extraction later.

**Setup (Phase 0, step 1):**

```sql
-- Run in Supabase SQL Editor
CREATE SCHEMA affiliate;
```

**Database structure:**

```text
Supabase Database (UnieMax-Production)
├── public              (existing core tables)
│   ├── customers
│   ├── orders
│   ├── stores
│   ├── products
│   └── ... (all existing)
│
└── affiliate           (NEW — all affiliate tables)
    ├── affiliate_programs
    ├── affiliate_commission_rules
    ├── affiliates
    ├── affiliate_invitations
    ├── store_affiliates
    ├── affiliate_links
    ├── affiliate_clicks
    ├── affiliate_attributions
    ├── affiliate_commissions
    ├── affiliate_payouts
    ├── affiliate_payout_items
    ├── affiliate_fraud_events
    ├── affiliate_campaigns         (V2)
    └── affiliate_coupons           (V2)
```

---

## 6b. Data model

Affiliate models live in `prisma/schema/affiliate.prisma`, all prefixed
`affiliate_` (plus `store_affiliates`), all deployed to the `affiliate` schema.
Prisma conventions match the core: `cuid()` ids, `Decimal(10, 2)` for money,
`@@map` to snake_case table names, snapshot columns wherever a historical record
must outlive the thing it points at, and `DateTime?` stamps rather than booleans
where "when" is what an audit needs.

**Prisma setup:**

```prisma
// prisma/schema/affiliate.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model AffiliateProgram {
  id String @id @default(cuid())
  // ...
  @@map("affiliate_programs")
}

// … rest of models
```

The `schema/` folder approach means both `core.prisma` and `affiliate.prisma`
share one datasource and one Prisma client. Migrations from both land in
`prisma/migrations/`, keyed by timestamp.

### No foreign keys point out of the affiliate schema

Every reference to a core entity — `customerId`, `storeId`, `productId`,
`orderId`, `orderItemId` — is a **plain indexed string** holding the core's cuid,
alongside a snapshot of whatever that row needs to display. No Prisma
`@relation` crosses the line, in either direction.

This is the single most important rule in the data model. It is what makes the
tables detachable: on extraction day they move to another database without a
dangling constraint, and nothing in the core's schema has to be touched. It also
means **no cross-domain joins are possible**, which is the point — a query that
needs a store's name reads the snapshot, or asks `AffiliateHost`.

Other notes that matter:

- **`affiliate_commissions` is per order line, not per order.** A partial return
  must reverse exactly one line's commission. Deciding this later is a migration
  plus a recomputation of balances people have already been shown.
- **`affiliate_clicks`** needs a retention/prune policy on day one
  (`jobs/pruneClicks.ts`). It is the table that will eventually justify the
  extraction.
- Money rows snapshot the **rate and the base** used, not only the result, so a
  commission can be audited without re-running the rules — the same reason
  `Order.shippingBasis` exists.
- Nothing is hard-deleted. Programmes disable, links revoke, relationships
  deactivate; historical rows stay for accounting.

---

## 7. Commission rules

### Resolution hierarchy — the most specific valid rule wins

```text
Platform guardrails (max rate, allowed types)   <- admin: a ceiling, not a rate
        |
Store default commission
        |
Category override
        |
Product override
        |
Affiliate-specific override (per store)
```

V1 ships **store default -> product override -> affiliate-specific override**.
Category overrides and campaign rates are additive later; the resolver in
`domain/commission.ts` is written as an ordered list from the start, so adding a
level is one entry.

Commission types: `PERCENTAGE` and `FIXED_AMOUNT`.

### Base — decide once, never change quietly

Commission is calculated on the order line's **net goods value**: `lineTotal`,
**excluding** shipping, tax and platform discounts. Rounded to 2 decimals per
line using `Decimal`, never on a float, never on the order grand total.

### Product eligibility

The seller toggles which products are affiliate-eligible. The catalog remains the
source of truth for the product itself; the affiliate package stores only the
eligibility and rate configuration. An ineligible product yields **no
commission**, even when bought in an attributed session — checked at commission
time against the eligibility **as it stood when the order was placed**.

---

## 8. Links, clicks and attribution

### Public link shape

```text
https://uniemax.com/a/X7K92P
```

The token resolves **server-side** to link id, affiliate, store, optional
product, optional channel. Never put an affiliate id, store id or rate in the
URL. Channels (`YOUTUBE`, `INSTAGRAM`, `FACEBOOK`, `WEBSITE`, `WHATSAPP`,
`TELEGRAM`, `OTHER`) get their own tokens under one affiliate, which is what
makes channel-level analytics possible.

### Click flow

```text
Visitor opens /a/:token   (a storefront SPA route — no nginx rule needed)
      |
      v
POST /api/v1/affiliate/public/click/:token   (no auth, 60/min per IP)
      |
      +-- resolve token            -> 404 if unknown / disabled
      +-- validate link enabled, partnership ACTIVE, affiliate ACTIVE
      +-- validate programme enabled
      +-- one transaction: attribution row (expiresAt = now + window),
      |   link.clickCount + 1, click log row
      |
      v
{ path, storeSlug, ref, expiresAt }  -> browser saves ref, navigates to path
```

The landing page is a normal storefront URL (`/store/:slug/product/:slug`, or
the store home for a store-level link); after it, the shopper has an ordinary
UnieMax experience.

### Carrying the attribution — cookie is not enough

Storefronts are path-based on one origin (`/store/:storeSlug/...`), so a cookie
works. It is still not sufficient alone: Safari's ITP truncates JS-visible cookie
lifetimes to ~7 days, which silently shortens a 30-day attribution window and
quietly under-pays affiliates.

**Approach:** the authoritative record is the server-side
`affiliate_attributions` row. The client holds only its **opaque token**, in
`localStorage` keyed by store slug (`packages/affiliate/attribution.ts`), handed
back by the click endpoint. Checkout sends the token explicitly as
`affiliateRef`; the server re-validates it (exists, not expired, store matches,
partnership and programme still active) and ignores anything it does not like.
A client that lost its token loses the attribution — never trust a
client-supplied affiliate id.

### Rules

- **Last valid click wins.** Clicks Rahul on Monday, Anu on Wednesday, buys on
  Thursday: Anu is credited — the browser simply keeps the newest token for
  that store.
- **One click credits one order.** The attribution row records the order that
  used it (`orderId`, unique) and the storefront clears its token after
  checkout; a second purchase needs a fresh click. Conservative for the
  seller's money and the duplicate-attribution guard the spec asked for.
  Relaxing it to "every order in the window" is a policy change, not a
  migration.
- **Attribution window** is per store (`attributionDays`, default 30).
- **Attribution is per store.** A click on store A never attributes an order at
  store B.
- **Self-purchase earns nothing** — matched on the customer account, recorded
  as a fraud event.
- **Affiliate coupons (V2)** outrank link attribution when both are present.

---

## 9. Order integration — the seam that matters most

The core must not learn what an affiliate is, and the flow must behave
identically before and after extraction. Three pieces, and nothing else:

```text
1. Order.affiliateRef  String?      ONE nullable column. The opaque token the
                                    client sends at checkout. The core stores
                                    it and interprets nothing.

2. package/events                   Typed in-process emitter. Orders and
                                    payments publish; the affiliate package
                                    subscribes at registration. The core never
                                    names affiliate.

3. events/handlers.ts               Idempotent, keyed by (eventType, orderId).
                                    Resolves the ref, applies eligibility as of
                                    placement, writes per-line commissions.
```

Events published by the core:

```text
order.placed      -> resolve attribution, write PENDING commissions
order.paid        -> commission eligible to progress
order.delivered   -> start the hold period
order.cancelled   -> commission CANCELLED
order.returned    -> commission REVERSED (per line)
payment.refunded  -> commission REVERSED (per line, proportional)
```

`jobs/approveMatured.ts` moves matured commissions to `APPROVED` — an
affiliate-local job, not an event.

An order that never becomes `PAID` never produces a payable commission.

> **Why attribution is resolved in a handler and not inside `createOrder`'s
> transaction**, even though in-process it could be: that transaction disappears
> on extraction. Writing commissions in the handler means the timing, the failure
> modes and the idempotency requirements are the same in both worlds, so
> extraction changes the transport and nothing else. The cost is that commission
> appears milliseconds after the order instead of within it — invisible to every
> user, and the price of a split that doesn't need a rewrite.

On extraction this piece becomes a transactional outbox in the core plus a
cursor feed the standalone service pulls. The handlers themselves are unchanged,
which is the whole point of making them idempotent now.

---

## 10. Commission lifecycle

```text
PENDING     order placed, nothing owed yet
   |
APPROVED    delivered + return window elapsed + order paid
   |
AVAILABLE   counted in the affiliate's withdrawable balance
   |
PAID        settled by a payout
```

Terminal/exception states: `CANCELLED` (order cancelled before approval),
`REVERSED` (returned or refunded after approval — a clawback against the
balance), `REJECTED` (fraud or a manual seller/admin decision).

**Cancellation and returns are line-level.** In an order where product A was
delivered and product B returned, only A's commission survives. This is the
single hardest thing to retrofit, which is why the table is per line from day
one.

---

## 11. Payouts — and the blocker

```text
Commission APPROVED -> affiliate available balance
      -> affiliate requests withdrawal
      -> payout PROCESSING
      -> payout PAID -> commissions marked PAID
```

**Dependency, stated plainly:** affiliate payouts terminate in a ledger that does
not exist. [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) §S1 records that
UnieMax has no ledger, no commission mechanism, no payout run — money can come in
but cannot go out, for sellers either.

Build the `LedgerEntry` primitive first and make affiliate commission the
**second** entry type after seller sale. Otherwise the platform grows a parallel
money path that has to be reconciled with the real one later.

The ledger belongs to the core, so affiliate reaches it through
`AffiliateHost.postLedgerEntries()` like everything else. Treat the payout as
two-phase from the start — affiliate marks commissions `PROCESSING` under a
payout id, the host settles, the result flips them to `PAID` — with the payout id
as the idempotency key. In-process that discipline looks like overkill; after
extraction it is the difference between a retry and a double payment.

If affiliate must ship before the ledger: accrue commissions as far as
`APPROVED`, expose balances honestly as "approved, payout coming", and leave
withdrawal unimplemented. Do **not** pay out through a side channel.

**Funding, to be settled before payouts are built:** this is a seller-run
programme, so the seller funds the commission. The system must record that
obligation — whether it is deducted from the seller's settlement or invoiced
separately is a commercial decision that changes the ledger entries, not the
affiliate model.

---

## 12. Lifecycle edge cases

**Programme disabled by the seller.** Stops new activity, erases nothing: no new
invitations, no new links, existing links stop creating new attributions,
existing orders keep their historical attribution, and commissions already
accrued run to completion through the normal lifecycle.

**Relationship deactivated.** Same shape — the affiliate's links stop converting;
already-earned commissions are still owed.

**Store suspended or seller leaves.** Historical affiliate relationships, clicks,
attributions, commissions and payout records are retained for accounting and
audit. Status-based lifecycle only; no hard deletes anywhere in this subsystem.

**Link lifecycle:** `ACTIVE -> DISABLED | EXPIRED | REVOKED`.

**Invitation lifecycle:** `PENDING -> ACCEPTED | REJECTED | EXPIRED | CANCELLED`
(the seller can cancel a pending invitation). For V1 the invitation _is_ the
approval; a `PENDING_APPROVAL` step is available for sellers who want to vet
after registration.

---

## 13. Fraud guardrails (V1)

- An affiliate earns nothing from their own order (match on customer identity,
  not just the browser).
- Expired, revoked or disabled links create no attribution.
- One attribution per order; duplicates rejected.
- The affiliate/store relationship and product eligibility are re-validated at
  commission time, not trusted from the click.
- Repeated cancellation/return patterns are recorded as fraud events for human
  review — recorded, never auto-punished.
- No commission after a relationship is terminated, except for orders already
  legitimately attributed before termination.

---

## 14. Platform (admin) guardrails

Admin controls the platform rules; admin does **not** own a seller's programme.

- Maximum allowed commission rate and permitted commission types
- Minimum payout amount and attribution-policy options
- Fraud rules, affiliate terms, seller and affiliate eligibility
- Platform fee on affiliate sales, if any
- Suspending an affiliate or a store's programme platform-wide

---

## 15. API surface

**Every affiliate route lives under `/api/v1/affiliate/**`** — including the
seller ones, which deliberately do _not_ sit under `/api/v1/stores/**`. One
prefix means extraction day is a single nginx `location` block, and until then it
marks exactly which routes belong to the package. Registered by
`registerAffiliate(app, …)` from `app.ts`, not by hand in `src/routes.ts`.

The endpoints are documented in [API.md — Affiliate Marketing](./API.md):
`/seller/stores/:storeId/**` (programme, products, invitations, partners,
commissions, summary), `/me/**` (profile, stores, products, links,
commissions), `/public/**` (invitation preview + accept, the click endpoint)
and `/admin/**` (accounts, commissions, fraud events, run approval).

Not built yet: withdrawal / payout endpoints (Phase 3) and admin-on-behalf
seller routes (support fixing a programme in the seller's name — the section is
hidden from the admin manage mount until then).

---

## 16. Build order

**Phase 0 — the package boundary** — _done_ (except step 7)

1. **Supabase setup:** Create the `affiliate` schema:
   ```sql
   CREATE SCHEMA affiliate;
   ```

2. `package/events`: typed in-process emitter; orders and payments publish the
   six order events (§9). The core names no subscriber.

3. Split `prisma/schema.prisma` into `prisma/schema/core.prisma` +
   `prisma/schema/affiliate.prisma` with `@@schema("affiliate")` assignments on
   affiliate models; confirm `prisma generate` and `db:migrate` work.

4. `Order.affiliateRef` column + migration; checkout accepts and stores the
   opaque token.

5. `package/affiliate` scaffold: `types.ts` (`AffiliateHost`), `config.ts`,
   `hosts/inProcess.ts`, `index.ts` with `registerAffiliate(app, deps)`, one
   health route, `README.md` carrying the extraction checklist.

6. `frontend/src/packages/affiliate` scaffold: `config.ts`, `api/client.ts`,
   `index.ts` exporting empty route arrays, mounted in all three host routers.

7. A lint rule (or a CI grep) enforcing rule §2.1 — no relative import escapes
   the package except the allowlist. **Not done yet** — today the rule is
   held by review; `hosts/inProcess.ts` is the only file with core imports.

Phase 0 is done when an order placed on dev with a dummy `affiliateRef` reaches
an affiliate event handler, the affiliate tables exist in the `affiliate` schema,
and the import check passes in CI.

**Phase 1 — programme and partners** — _done_

8. Seller: enable programme, default rate, window, per-product eligibility.
9. Invitations: create, send, public preview, accept (with and without an
   existing account), cancel, expire.
10. Affiliate portal: my stores, eligible products.

**Phase 2 — tracking and money** — _done_

11. Links + `/a/:token` + attribution (token in `localStorage`).
12. Attribution resolution from `order.placed` + per-line `PENDING` commissions.
13. Lifecycle handlers: paid, delivered, cancelled, returned, refunded; the
    return-window job that approves.
14. Dashboards: affiliate earnings, seller analytics.

**Phase 3 — settlement** — _not started; blocked on the ledger_

15. Ledger primitive (PRODUCTION_READINESS §S1), then payout runs and
    withdrawal.

**V2 (explicitly deferred):** affiliate coupon codes, campaigns, category
overrides, advanced analytics, automated payouts, advanced fraud detection,
promotional assets, leaderboards, tiered commissions.

---

## 16b. Extraction checklist

The reason for every rule above. Kept here and in the package's own `README.md`
so it survives contact with a future engineer. **Nothing in this list requires
rewriting `domain/`, `data/`, `api/` or `events/`.**

**Trigger:** click-ingestion volume, or a team that needs its own deploy cadence.
Not module size.

1. Move `backend/src/package/affiliate/` into the new service; it brings
   `domain/`, `data/`, `api/`, `events/`, `jobs/` unchanged.
2. Copy the allowlisted primitives with it — `utils/httpError`,
   `utils/response`, `utils/zodHelpers`, `package/auth`. (They were chosen
   because they are already portable;
   [`authCore.types.ts`](../backend/src/package/auth/core/authCore.types.ts)
   says so in its own header.)
3. Move `prisma/schema/affiliate.prisma` to the new service's own Prisma project.
   No foreign key has to be dropped, because none crosses (§6b).
4. Create a new Supabase instance (or new schema if staying on the same instance)
   and restore the `affiliate` schema tables: `pg_dump --schema=affiliate` from
   the old instance, restore to the new one. Tables are clean with no dangling
   constraints.
5. Write `hosts/remote.ts` against the same `AffiliateHost` interface, and pass
   it to `registerAffiliate` instead of `inProcess`. This is the only new code.
6. In the core, replace the in-process `package/events` publish with a
   transactional outbox table plus `GET /internal/v1/events?cursor=`, and give
   the new service a poller. Handlers are already idempotent (§2.6), so
   redelivery is safe.
7. Add the core's internal read API for what `hosts/remote.ts` needs — stores,
   products, order snapshots — guarded by a machine JWT.
8. Switch token signing to RS256/EdDSA + JWKS so the new service can verify
   without being able to mint (§5).
9. nginx: one `location /api/v1/affiliate` plus `location /a/` to the new port.
   Every affiliate route already sits under those two prefixes (§15).
10. Frontend: repoint `packages/affiliate/config.ts` at the new base URL. Lift
    the folder into its own Vite app only if it needs a separate origin — the
    three route-array imports are the only thing the host apps know about it.
11. Add the reconciliation job that re-walks the event feed and reports drift —
    the one genuinely new operational requirement the split introduces.

---

## 17. Fixed design decisions

These stay fixed unless the business model changes.

1. The affiliate programme is **store-level**; the seller enables it, sets the
   commission, invites the partners and funds the commission.
2. UnieMax provides infrastructure and platform-level guardrails; admin does not
   own a seller's programme.
3. An affiliate can exist without being a seller, and needs no prior UnieMax
   account — the invitation creates one.
4. One UnieMax user can be an affiliate for many stores, at different rates.
5. Affiliates generate their own links after joining a store.
6. Product, order and payment ownership stays with the existing modules;
   affiliate never creates or owns an order.
7. Affiliate lives in **one package per side** — `backend/src/package/affiliate`
   and `frontend/src/packages/affiliate` — running in-process today, behind the
   `AffiliateHost` boundary, so extraction to a standalone service is a driver
   swap rather than a rewrite.
8. Commission is per order line, on net goods value, snapshotted with its rate.
9. Commission becomes payable only after the configured eligibility conditions
   are met; it is never paid at order time.
10. Historical affiliate, attribution, commission and payout records are never
    deleted — status lifecycle only.

---

## 18. Open questions

- **Commission funding mechanics.** Deducted from seller settlement, or invoiced?
  Changes the ledger entries, not the affiliate model — but it must be answered
  before Phase 3.
- **Platform fee on affiliate sales**, if any.
- **Return window length** — per store, or a platform default? Currently assumed
  a platform default with a per-store override.
- **Minimum payout threshold** and payout cadence.
- **Tax treatment of affiliate commission** (TDS on payouts to individuals in
  India) — likely required before real payouts run.

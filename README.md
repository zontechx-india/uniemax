# UnieMax

A **white-label e-commerce platform**. One codebase, any business — a seller signs
up, creates a store, builds a catalog, picks a look, and gets a live storefront at
`/store/<slug>` without a line of code being written for them.

The first live vertical is a cricket-bat store; nothing in the schema or the UI is
specific to it. Categories, product specifications, theming, checkout fields,
payment methods and fulfilment modes are all data, not code.

---

## What's in the box

The platform has **three distinct surfaces** on one deployment:

| Surface | Who uses it | Where |
| ------- | ----------- | ----- |
| **Marketplace + storefronts** | Shoppers (no account needed to browse) | `/`, `/store/:slug` |
| **Seller console** | Customers who own stores | `/stores/...` (signed in) |
| **Platform admin console** | UnieMax staff | `/admin` (separate bundle) |

The seller console is not a separate app — it lives inside the same storefront
build behind a session gate, because a seller *is* a customer who happens to own a
store. The admin console is a separate Vite entry (`admin.html`) so its bundle
never ships to a shopper.

---

## Feature overview

### For shoppers

- Marketplace homepage: newest published stores, global search across stores /
  categories / products, platform stats.
- Per-store storefronts with the seller's own colors, logo, footer and homepage
  section order.
- Browse by category (two levels), product detail with a variant picker, search
  and filtered/sorted listing.
- One cart that spans multiple stores, but **orders are placed per store** — each
  "Place Order" carries exactly one store's items.
- Checkout collects only the fields that store enabled; COD or online payment
  (Cashfree), delivery or pickup, per the seller's configuration.
- Order history, saved addresses, notification feed with Web Push.
- Help & Support **with UnieMax** (account menu) or **with the shop itself**
  (store top bar / footer) — call, email, or raise a tracked ticket.

### For sellers

- Create multiple stores through a **four-step guided wizard** (store → business
  → address → tax), pre-filled from the account and resumable: the store is
  created at step 1, so leaving midway loses nothing and a dashboard checklist
  shows exactly what's left. Each store gets a stable slug that survives
  renames.
- Business identity kept separately from storefront presentation: legal name,
  accountable seller, contact details, a structured business address,
  PAN / GSTIN.
- Catalog: categories → optional subcategories → products → variants. **The
  variant is the unit of sale** — price and stock live only on variants; a simple
  product carries one hidden default variant.
- Merchandising flags (`isFeatured`, `isBestSeller`, `isNewArrival`,
  `hideFromSearch`) each map to exactly one storefront homepage row.
- Appearance: pick a curated theme template, recolor it, name the palette,
  preview it before publishing.
- Homepage builder: drag to reorder and toggle the storefront sections
  (hero, categories, featured, new arrivals, best sellers).
- Footer builder: up to 10 locations with map pins, social links, business info,
  support contacts, policy links, custom links, copyright.
- Configure payments (COD / online), fulfilment (delivery / pickup / both),
  pincode-based delivery areas (a store default — all / only selected / all
  except selected pincodes — with per-product overrides; shown on the product
  page against the customer's default address and enforced at checkout) and
  which checkout fields to ask for.
- Orders: dashboard counters, order list/detail, forward-only status progression,
  pre-shipment cancellation with transactional stock restore.
- Payout bank account (verified manually by platform staff).
- Answer the support tickets their own shoppers raise.
- Publish switch — a store is a private draft until the owner publishes it. The
  owner can still preview an unpublished store; everyone else gets a 404.
- Capability gates rather than upfront forms: a seller builds their whole
  catalog with nothing filled in, and requirements attach to what they're
  trying to *do* — publishing needs contact details, an address and a product;
  online payment needs a PAN and a payout account; pickup needs an address to
  collect from. One server-side registry decides all of it.

### For platform staff (`/admin`)

- One-request dashboard: totals, today, per-day series, order pipeline, payment
  split, top stores/products, low stock, integration health.
- Store oversight with **suspension**; seller payout-account verification.
- Customer oversight with **blocking** (revokes every session).
- Platform-wide order and payment views.
- Seller-catalog moderation — hide/restore a listing.
- Support queue for shopper→UnieMax and seller→UnieMax threads (store-level
  tickets stay private to that store).
- Appearance templates the sellers choose from.
- Platform announcements (broadcast notification + push).
- Append-only **audit trail** of every admin write.
- SUPER_ADMIN-only admin account management.

---

## Tech stack

**Backend** — Node.js · Fastify 5 · TypeScript (ESM) · Prisma 7 with the `pg`
adapter · PostgreSQL (Supabase) · Zod 4 for validation · `jsonwebtoken` + `bcrypt`
· `web-push` · `@aws-sdk/client-s3`.

**Frontend** — React 19 · Vite 8 · TypeScript · Tailwind CSS 4 · React Router 7 ·
Axios · `@cashfreepayments/cashfree-js` · `react-easy-crop` for image cropping.
No state library — session context plus small per-feature hooks.

**Infrastructure** — AWS EC2 behind nginx, pm2 for the API, GitHub Actions for
CI/CD, Let's Encrypt certificates, two Supabase projects (dev + prod).

The repo is an **npm workspace** (`frontend` + `backend`); always install from the
root — a per-folder install wipes the shared `node_modules`.

---

## Repository layout

```
.
├── backend/                     Fastify API
│   ├── prisma/
│   │   ├── schema.prisma        ~1050 lines — the single source of truth
│   │   └── migrations/          committed; how schema changes reach production
│   └── src/
│       ├── config/              loadEnv · env (validated) · prisma
│       ├── plugins/             Fastify plugins (prisma decorator)
│       ├── middleware/          errorHandler (Zod/Prisma/HttpError → envelope)
│       ├── utils/               response · httpError · logger · slug · password
│       ├── package/             self-contained, reusable subsystems
│       │   ├── auth/            tokens, sessions, guards, providers, strategies
│       │   ├── mail/            Resend + console fallback
│       │   ├── push/            VAPID Web Push + console fallback
│       │   └── storage/         S3 + local drivers
│       ├── modules/             one folder per feature (see below)
│       ├── routes.ts            central route registrar
│       └── server.ts
├── frontend/
│   ├── index.html               storefront entry
│   ├── admin.html               admin console entry (separate bundle)
│   └── src/
│       ├── shared/              theme tokens, auth http, media, push, analytics
│       ├── storefront/          app · layout · pages · features
│       └── admin/               app · layout · pages · features · ui
├── docs/                        the reference documentation (see below)
└── .github/workflows/           ci.yml · deploy-dev.yml · deploy-prod.yml
```

### Backend modules

`addresses` · `admin` · `category` · `discovery` · `health` · `notifications` ·
`orders` · `payments` · `product` · `stores` · `support` · `themeTemplates`

Each is `schema.ts` · `service.ts` · `controller.ts` · `routes.ts`, registered in
[`backend/src/routes.ts`](./backend/src/routes.ts). `stores` and `admin` are large
enough to be split into several service files along the same lines.

---

## Architecture

### Route surfaces

Everything except the health probe mounts under `/api/v1`, split into two
subtrees:

- **Public / customer** — `/auth`, `/categories`, `/products`, `/stores`,
  `/addresses`, `/orders`, `/notifications`, `/support`, `/theme-templates`,
  `/public/**` (storefront pages by slug, discovery, support contact, VAPID key,
  media config), `/payments` (Cashfree webhook, signature-guarded).
- **Admin** — `/api/v1/admin/**`, a separate subtree where login is public and
  everything else sits behind a `requireAdmin` `preHandler`.

Public queries force active-only visibility. The storefront's
`PUBLIC_PRODUCT_VISIBILITY` rule is exported and reused by discovery, so search
can never surface what a store page would hide.

### Authentication

Bearer JWT with **two token kinds**:

- **Admin** — email + password.
- **Customer** — OTP delivered to **email or phone**. Each identifier is unique to
  one account; the second identifier is linked after login.

Access tokens plus rotating refresh tokens, DB-backed sessions with reuse
detection, and two profiles: **web cookie** (httpOnly + CSRF) and **mobile
bearer**. Guards live in `middleware/auth.ts` — wrong token kind → 403, missing or
invalid → 401. Google sign-in is scaffolded but disabled (no verifier registered);
Apple is not started.

The whole auth subsystem is self-contained under `src/package/auth/` with its own
env config — see [`backend/docs/PACKAGE_AUTH.md`](./backend/docs/PACKAGE_AUTH.md).

### Conventions

- **Validation** — Zod parsing happens in controllers; services never see
  unvalidated input.
- **Errors** — services throw `HttpError.*`; the central handler maps Zod, Prisma
  and `HttpError` to one JSON envelope.
- **Responses** — always `ok()` / `list()` from `utils/response.ts`.
- **Evolving shapes without migrations** — store `theme`, `homepage`, `footer`,
  `profile`, `payments`, `shipping` and `checkout` are JSON columns, each with a
  `resolveX` normaliser that tolerates null, legacy shapes and newly-added keys.
  A malformed value degrades to the default instead of breaking a response.
- **One requirement registry** — `storeReadiness.ts` declares what a store needs
  and which capability each requirement gates. The server enforces from it, the
  seller's checklist renders from it, and the signup wizard's steps *are* its
  steps, so a new requirement is one entry rather than an endpoint, a UI change
  and a migration.

### Data model highlights

- **Store** — owned by a Customer (a customer may own several), unique stable
  slug, logo object key (responses expose a derived URL, never the key), the JSON
  config columns above, `isPublished` + `publishedAt`. `publishedAt` is stamped on
  the **first** publish only, so re-publishing an old store doesn't bump it back
  to the top of "New Stores".
- **StoreCategory / StoreProduct / StoreProductVariant** — the catalog *inside* a
  seller's store, separate from the admin's global `Category` / `Product`.
  Categories are one level deep; products require a category; variants carry price
  and stock. Product-level `price`, `priceMax`, `stockQuantity` and `hasVariants`
  are **derived and read-only**.
- **Order / OrderItem** — placed per store, re-priced from the live catalog at
  placement, stock decremented transactionally.
- **SupportTicket / SupportTicketMessage** — one table serving all three
  conversations (shopper→UnieMax, seller→UnieMax, shopper→shop), separated by
  `recipient` + `storeId`.
- **Notification / PushSubscription** — in-app feed and per-device Web Push, fired
  from the same dispatch function.
- **AdminAuditLog** — append-only record of every admin write.

Full model-by-model detail lives in the Data Model section of
[`docs/BACKEND_CONTEXT.md`](./docs/BACKEND_CONTEXT.md).

### Frontend routing

The storefront app mounts a **public router** first (no session required):

```
/store/:storeSlug                           store homepage
/store/:storeSlug/category/:categorySlug    category page
/store/:storeSlug/product/:productSlug      product detail + variant picker
/store/:storeSlug/shop?q=                   browse all / search
/store/:storeSlug/support[/:ticketId]       help with this shop
/cart, /cart/:storeSlug                     cart (outside the store layout)
/checkout/:storeSlug                        per-store order review
/order/:storeSlug/:orderId                  confirmation
```

Store pages are lazy-loaded so the marketplace homepage bundle stays small.
Signed-in routes (`/orders`, `/profile`, `/addresses`, `/support`, and the whole
`/stores/...` seller console) sit behind the session gate.

In dev, Vite proxies `/api` and `/uploads` to the backend on `:4000` so httpOnly
auth cookies work with no CORS setup — mirroring production, where nginx serves
the SPA and API from one origin. A dev-only Vite plugin mirrors nginx's
`/admin → admin.html` fallback.

---

## Getting started

```bash
npm ci                        # from the repo root — workspace install
cd backend && npx prisma generate
```

Then, from the root:

```bash
npm run dev                   # frontend + backend together
npm run frontend              # storefront on :5173 (admin at :5173/admin)
npm run backend               # API on :4000
```

Backend scripts (run in `backend/`):

| Script | Does |
| ------ | ---- |
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` / `start` | compile to `dist/` / run it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | create + apply a migration locally |
| `npm run db:deploy` | apply committed migrations (production) |
| `npm run db:status` | migration status |
| `npm run create-admin` | seed an admin account |
| `npm run push-keys` | generate VAPID keys |
| `npm run seed-theme-templates` | seed the appearance templates |
| `npm run backfill-catalog` | one-off catalog backfill |

Setup detail and the full env-var list: [`backend/README.md`](./backend/README.md).

### Environment files

Env files are **layered, never edited to switch environments**.
`config/loadEnv.ts` loads `.env.<mode>` then `.env`, where
`mode = APP_ENV ?? NODE_ENV ?? "development"`. Locally that means dev; pm2 sets
`APP_ENV=production` on the server. A key lives in either `.env` or a per-mode
file, never both. New entrypoints must `import "./config/loadEnv.js"` **first**.

One-off local run against production:

```powershell
$env:APP_ENV="production"; npm run dev
```

Commands and rules: [`backend/ENV.md`](./backend/ENV.md).

### Database changes

After editing `prisma/schema.prisma`, run `npm run db:migrate` and **commit
`prisma/migrations/`** — that committed folder is how the change reaches
production, which runs `npm run db:deploy`. Never `prisma db push`: it mutates the
local DB without producing a migration, so production never learns of it.

---

## Deployment

Single EC2 box behind nginx, pm2 running the API on `:4000`, two Supabase
projects.

| Environment | URL | Trigger |
| ----------- | --- | ------- |
| **dev** | `https://dev.uniemax.zontechx.com` | every push to `main` (`deploy-dev.yml`) |
| **prod** | `https://uniemax.com` | `v*` tag + approval (`deploy-prod.yml`) |

`ci.yml` runs on every push and PR (install, `prisma generate`, backend typecheck
+ build, frontend build) and is reused as a gate by both deploy workflows.
Production runs its own backend against the production database — nothing is
shared with dev, and prod intentionally lags dev until a release tag.

Server layout, nginx vhosts, certificates, env-file locations and the manual
fallback runbook: [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md).

---

## Not yet built

- **Cashfree refunds** — cancelling a paid order marks it REFUNDED (status only);
  the refund itself is done manually in the Cashfree dashboard. There is also no
  automatic expiry sweep for abandoned unpaid online orders — they hold stock
  until the seller cancels.
- **Shipping-charge calculation** — orders currently ship free.
- **Inventory alerts** and **banners**.
- **Google / Apple sign-in** — scaffolded, verifier unregistered (endpoints 400).
- **Socket.IO real-time layer.**

---

## Documentation map

Every code change keeps these in sync — one fact lives in exactly one file.

| Doc | Covers |
| --- | ------ |
| [`docs/CONTEXT.md`](./docs/CONTEXT.md) | Product scope, features, requirements |
| [`docs/BACKEND_CONTEXT.md`](./docs/BACKEND_CONTEXT.md) | Architecture, module pattern, conventions, data model, roadmap |
| [`docs/FRONTEND_CONTEXT.md`](./docs/FRONTEND_CONTEXT.md) | Frontend architecture and conventions |
| [`docs/API.md`](./docs/API.md) | Every endpoint — params, responses |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | EC2, nginx, pm2, CI/CD, env files |
| [`docs/CASHFREE_PAYMENTS.md`](./docs/CASHFREE_PAYMENTS.md) | Payment gateway integration |
| [`docs/PUSH_NOTIFICATIONS.md`](./docs/PUSH_NOTIFICATIONS.md) | Web Push + notification feed |
| [`docs/PRODUCTION_READINESS.md`](./docs/PRODUCTION_READINESS.md) | Hardening checklist |
| [`backend/README.md`](./backend/README.md) | Backend setup, scripts, env vars |
| [`backend/ENV.md`](./backend/ENV.md) | Env switching (dev ↔ production) |
| [`backend/docs/PACKAGE_AUTH.md`](./backend/docs/PACKAGE_AUTH.md) | The auth package in depth |
| [`CLAUDE.md`](./CLAUDE.md) | Working conventions for this repo |

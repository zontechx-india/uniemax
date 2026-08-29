# UnieMax Backend

Fastify + Prisma 7 + PostgreSQL (Supabase) API for the white-label e-commerce platform.

> **Docs:** architecture → [`docs/BACKEND_CONTEXT.md`](../docs/BACKEND_CONTEXT.md) ·
> endpoints → [`docs/API.md`](../docs/API.md) · product spec → [`docs/CONTEXT.md`](../docs/CONTEXT.md) ·
> auth package → [`docs/PACKAGE_AUTH.md`](./docs/PACKAGE_AUTH.md)

## Quick Start

```bash
npm install
cp .env.example .env    # fill the SHARED block; see "Environment files" below
                        # then create .env.development with NODE_ENV + DB URLs
npx prisma generate     # generate the Prisma client
npm run db:deploy       # apply migrations to the database
npm run create-admin -- admin@store.com "StrongPassword" "Store Owner"   # first admin
npm run dev             # start on http://localhost:4000 (hot reload)
```

## Environment files

Three layered files, none of them in git. **You never edit a file to switch
environments** — the mode comes from the machine:

| File | Purpose |
| ---- | ------- |
| `.env` | Values identical everywhere (JWT, S3, Cashfree, mail, media rules) |
| `.env.development` | Your laptop — `NODE_ENV`, dev DB pair, `PUBLIC_WEB_URL` |
| `.env.production` | The server — prod DB pair, `CORS_ORIGIN`, `PUBLIC_*`, its own VAPID keys |

`src/config/loadEnv.ts` resolves `mode = APP_ENV ?? NODE_ENV ?? "development"`
and loads `.env.<mode>` first, then `.env` for anything the overlay omits.
Locally nothing is set, so you get development. On the server pm2 supplies
`APP_ENV=production` via `ecosystem.config.cjs`.

Every entrypoint prints its resolved target at boot, so the active database is
never a guess:

```
env: mode=development NODE_ENV=development db=aws-1-….pooler.supabase.com:6543 web=http://localhost:5173
```

> A key belongs to **either** `.env` **or** a per-mode file, never both.

**Copy-paste commands for switching: [ENV.md](./ENV.md).**

Verify: `curl http://localhost:4000/health`

## Scripts

| Command             | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Dev server with hot reload (`tsx watch`)         |
| `npm run build`     | Compile TypeScript to `dist/`                    |
| `npm start`         | Run the compiled build                           |
| `npm run typecheck` | Type-check without emitting                      |
| `npm run db:check`  | Probe the DB connection (`SELECT 1;`)            |
| `npm run db:migrate` | Create + apply a migration from schema changes (dev) |
| `npm run db:deploy` | Apply pending migrations (production deploys)    |
| `npm run db:status` | Show applied/pending migrations                  |
| `npm run create-admin -- <email> <pw> [name]` | Create/reset an admin account  |
| `npm run push-keys` | Print a fresh VAPID key pair for Web Push — run once per environment and paste into `.env` |
| `npm run backfill-catalog` | Fill missing store category/product slugs and recompute product price/stock aggregates. Idempotent — safe to re-run. |
| `npm run seed-theme-templates` | Create the five starter store appearance templates. Copies the **colors only** from real, well-configured stores (never any other store data), topped up from curated fallbacks. Idempotent — does nothing when templates exist; `-- --force` tops the table back up to five. |

## Environment (`.env`)

| Var            | Notes                                                     |
| -------------- | --------------------------------------------------------- |
| `NODE_ENV`     | `development` \| `test` \| `production`                   |
| `PORT`/`HOST`  | HTTP bind (default `4000` / `0.0.0.0`)                    |
| `LOG_LEVEL`    | Pino level (default `info`)                               |
| `CORS_ORIGIN`  | `*` or comma-separated allowlist (**production requires an explicit allowlist**) |
| `TRUST_PROXY`  | `true` (default — behind Nginx/LB) \| `false` (exposed directly) \| hop count \| address list. Controls whether `X-Forwarded-*` is believed — set `false` when direct, or clients can spoof IPs past the rate limits |
| `PUBLIC_WEB_URL` | Optional storefront origin (e.g. `https://shop.example.com`) — when set, order emails carry deep links and Cashfree payments return to the order page |
| `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` | Cashfree PG credentials. Both set → real ONLINE payments (sandbox keys work in dev); unset → dev simulates, production answers 503. **Production refuses to boot with only one of the two** |
| `CASHFREE_ENV` | `sandbox` (default — `sandbox.cashfree.com/pg`) \| `production` (`api.cashfree.com/pg`); also picks the web SDK mode |
| `CASHFREE_API_VERSION` | `x-api-version` header (default `2023-08-01`, PG API v4) |
| `PUBLIC_API_URL` | Optional public origin of this API — builds the per-order webhook `notify_url`; otherwise configure the webhook URL in the Cashfree dashboard (see [docs/CASHFREE_PAYMENTS.md](../docs/CASHFREE_PAYMENTS.md)) |
| `SUPPORT_EMAIL` / `SUPPORT_PHONE` / `SUPPORT_HOURS` | Platform support contact served at `GET /api/v1/public/support-contact` and printed on the seller's Help & Support page. All default to the live UnieMax details, so no environment has to set them |
| `DATABASE_URL` | Pooled connection (runtime) — Supabase PgBouncer `:6543`  |
| `DIRECT_URL`   | Direct connection (migrations) — Supabase `:5432`         |
| `JWT_SECRET`   | **Required.** Signs access tokens (admin + customer)      |
| `JWT_ACCESS_EXPIRES_IN` | Access-token lifetime (default `15m`)            |
| `JWT_ADMIN_EXPIRES_IN` / `JWT_CUSTOMER_EXPIRES_IN` | **Refresh**-token lifetimes (`7d` / `30d`) |
| `AUTH_COOKIE_SECURE` | `true`/`false` for web cookies (default: prod = secure) |
| `AUTH_COOKIE_SAMESITE` / `AUTH_COOKIE_DOMAIN` | Web-cookie SameSite (`lax`) + optional domain |
| `OTP_LENGTH` / `OTP_TTL_MINUTES` / `OTP_MAX_ATTEMPTS` | Verification-code settings (OTP login, email verify, password reset) |
| `OTP_BYPASS` / `OTP_DEV_CODE` | **SMS-only** dev bypass: accept a fixed code (default `123456`) for phone OTP. Email codes are always real (Resend). Defaults on outside production; **refused in production** |
| `RESEND_API_KEY` | Resend API key (`re_…`). When set, verification **and order** emails send via Resend; unset → console stub |
| `EMAIL_FROM` | Sender address on a Resend-verified domain |
| `MESSAGE_CENTRAL_CUSTOMER_ID` / `MESSAGE_CENTRAL_AUTH_TOKEN` | Message Central credentials. Both set → live SMS OTP (they generate + verify the code); unset → console fallback |
| `SMS_COUNTRY_CODE` | Country code for SMS OTP (default `91`) |
| `GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` | Optional — for the real OAuth verifiers later (the current mock ignores them) |
| `STORAGE_DRIVER` | `local` (default — files under `uploads/`, served at `/uploads/*`) or `s3`. **Production requires `s3`** — the local driver refuses to boot |
| `AWS_REGION` | S3 region (required when `STORAGE_DRIVER=s3`) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Explicit S3 credentials; omit to use the SDK default chain (IAM role) |
| `STORAGE_LOGO_BUCKET` | Bucket A — store logos (required when `s3`) |
| `STORAGE_MEDIA_BUCKET` | Bucket B — product images & videos (required when `s3`) |
| `STORAGE_LOGO_PREFIX` / `STORAGE_MEDIA_PREFIX` | Optional folder inside each bucket — lets both kinds share ONE bucket (e.g. `uniemax` + `store_logo` / `product_media`). Applied at the driver; DB keys never include it |
| `STORAGE_LOGO_PUBLIC_URL` / `STORAGE_MEDIA_PUBLIC_URL` | Optional CDN/base URL per bucket (e.g. CloudFront); default is the standard S3 URL |
| `STORAGE_LOCAL_DIR` | Local-driver directory (default `uploads`) |
| `MEDIA_MAX_IMAGE_MB` / `MEDIA_MAX_VIDEO_MB` / `MEDIA_MAX_LOGO_MB` | Upload size limits (defaults `5` / `50` / `2`) |
| `MEDIA_IMAGE_TYPES` / `MEDIA_VIDEO_TYPES` | Allowed MIME types, comma-separated (defaults: `image/jpeg,image/png,image/webp,image/avif` · `video/mp4,video/webm,video/quicktime`) |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push key pair — generate once per environment with `npm run push-keys`. Both set → real browser push; unset → the console driver logs instead (the in-app feed still works). **Rotating the pair invalidates every existing subscription.** See [docs/PUSH_NOTIFICATIONS.md](../docs/PUSH_NOTIFICATIONS.md) |
| `VAPID_SUBJECT` | Contact the push service can reach you on — `mailto:` or `https:` (default `mailto:connect@zontechx.com`) |
| `PUSH_TTL_SECONDS` | How long a push service holds an undelivered message (default `86400`) |

> All auth vars (`JWT_*`, `AUTH_COOKIE_*`, `OTP_*`, OAuth client ids) are read from the
> same `.env` but validated **inside** the self-contained
> `package/auth/core/config/env.ts`, not `config/env.ts`. See
> [`docs/PACKAGE_AUTH.md`](./docs/PACKAGE_AUTH.md). Storage vars (`STORAGE_*`,
> `AWS_*`, `MEDIA_*`) are likewise validated inside
> `package/storage/config.ts`. The database stores only object keys — public
> URLs are derived from this config, so buckets/CDNs can change freely.

## Adding a feature module

Create four files under `src/modules/<name>/` (`schema` · `service` · `controller` ·
`routes`) and register the routes in `src/routes.ts`. See `modules/product/` for the
reference pattern, documented in [`docs/BACKEND_CONTEXT.md`](../docs/BACKEND_CONTEXT.md).

## The admin console API

Everything under `/api/v1/admin` (beyond auth) lives in `src/modules/admin/`
and is mounted **inside** the `requireAdmin` subtree, so no route repeats the
guard. Endpoints, filters and payloads: [`docs/API.md`](../docs/API.md);
design rationale: [`docs/BACKEND_CONTEXT.md`](../docs/BACKEND_CONTEXT.md).

Two things to know before adding an endpoint there:

- **Every write must call `recordAudit(request, …)`** (`adminAudit.ts`). It is
  fire-and-forget, so it can never fail the action it describes, and the trail
  is what makes a moderation decision reviewable later.
- **Admin-account routes check `assertSuperAdmin`** in the controller. Guard
  in the API, not only in the UI.

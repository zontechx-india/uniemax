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
| `npm run seed-theme-templates` | Create the five starter store appearance templates. Copies the **colors only** from real, well-configured stores (never any other store data), topped up from curated fallbacks. Idempotent — does nothing when templates exist; `-- --force` tops the table back up to five. |
| `npm run seed-categories` | Seed the global category taxonomy (29 top-level + 125 sub) from `src/scripts/data/globalCategories.ts`. Upserts by slug — idempotent, never duplicates, never deletes. Realigns `name`/`parentId`/`displayOrder`; leaves `isActive`/`description`/`imageUrl` as the admin set them; fills `optionTemplates`/`specTemplates` from `data/categoryPresets.ts` only where never set. `-- --dry-run` reports without writing. |
| `npm run audit-media` | Compare every S3 object against the media keys the current environment's DB references (`Store.logoKey`, `StoreProductMedia.key`, `OrderItem.imageKey`, plus bucket-hosted legacy URL columns). Writes `media-audit-<mode>.{json,md}` + CSVs to `backend/migration-backups/`. Both envs share one bucket, so run once per env and pass `-- --merge migration-backups/media-audit-<other>.json` on the second run to get true orphans (referenced by neither DB). Read-only unless `--delete-orphans --yes` is added to a merged run. |

| `npm run optimize-media` | Bring stored images up to the server's upload rules (upright, size-capped WebP — what new uploads get) and render their missing derived images (sized `srcset` copies for every image, link previews for covers and logos — share images and store cards). **Dry run** unless `-- --apply`; `--only=products,logos,store-banners,marketplace-banners`, `--limit=N`. Runs against the current mode's DB — once per environment (`$env:APP_ENV="production"; npm run optimize-media -- --apply`). Re-runnable; never deletes (old objects stay for order snapshots — `audit-media` reports them). |
| `npm run test:unit` | Unit tests for pure logic (`test/unit/*.test.ts`, `node:test` run through `tsx`) — no server, no database. Currently the WhatsApp webhook signature check and payload parsing, and the store-readiness gates (what blocks publishing, payouts and online payment, in order) |
| `npm run test:api` | API regression suite (`test/*.test.mjs`, Node's built-in `node:test`, no extra deps) against a **running** backend. Env: `API_BASE`, `QA_EMAIL_A`/`QA_PASSWORD_A` (seller + buyer), `QA_EMAIL_B`/`QA_PASSWORD_B` (second customer), optional `QA_PHONE_A` (+ `QA_OTP_CODE`, default `123456`) so the test store can publish via the SMS OTP bypass. Creates a store, products and orders — local or dev only; refuses `*.uniemax.com`. |

## Environment (`.env`)

| Var            | Notes                                                     |
| -------------- | --------------------------------------------------------- |
| `NODE_ENV`     | `development` \| `test` \| `production`                   |
| `PORT`/`HOST`  | HTTP bind (default `4000` / `0.0.0.0`). The EC2 clones set `HOST=127.0.0.1` — only nginx on the same box should reach the API |
| `LOG_LEVEL`    | Pino level (default `info`)                               |
| `CORS_ORIGIN`  | `*` or comma-separated allowlist (**production requires an explicit allowlist**) |
| `TRUST_PROXY`  | `true` (default — behind Nginx/LB) \| `false` (exposed directly) \| address list (hop counts are refused at boot — Fastify 5.12 dropped them). Controls whether `X-Forwarded-*` is believed — set `false` when direct, or clients can spoof IPs past the rate limits |
| `PUBLIC_WEB_URL` | Optional storefront origin (e.g. `https://shop.example.com`) — when set, order emails carry deep links and Cashfree payments return to the order page |
| `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` | Cashfree PG credentials. Both set → real ONLINE payments (sandbox keys work in dev); unset → dev simulates, production answers 503. **Production refuses to boot with only one of the two** |
| `CASHFREE_ENV` | `sandbox` (default — `sandbox.cashfree.com/pg`) \| `production` (`api.cashfree.com/pg`); also picks the web SDK mode |
| `CASHFREE_API_VERSION` | `x-api-version` header (default `2023-08-01`, PG API v4) |
| `PUBLIC_API_URL` | Optional public origin of this API — builds the per-order webhook `notify_url`; otherwise configure the webhook URL in the Cashfree dashboard (see [docs/CASHFREE_PAYMENTS.md](../docs/CASHFREE_PAYMENTS.md)) |
| `SUPPORT_EMAIL` / `SUPPORT_PHONE` / `SUPPORT_HOURS` | Platform support contact served at `GET /api/v1/public/support-contact` and printed on the seller's Help & Support page. All default to the live UnieMax details, so no environment has to set them |
| `WEB_SHELL_PATH` | Optional path to the built storefront `index.html` the page shells (`GET /store/*`, `GET /c/*`) write each page's head into. Default: this clone's `../frontend/dist/index.html` — right on the server (each clone builds its own frontend) and locally after `npm run build` in `frontend/`. Without a build those routes answer 503 |
| `AFFILIATE_MAX_PERCENT` | Highest percentage commission a seller may offer (default `50`) — the platform ceiling for `package/affiliate` |
| `AFFILIATE_INVITE_DAYS` | Days an affiliate invitation stays valid (default `14`) |
| `AFFILIATE_CLICK_RETENTION_DAYS` | Days of raw click rows kept before the hourly job prunes them (default `90`); link click counters are never pruned |
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
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Explicit S3 credentials; omit to use the SDK default chain (IAM role). **Unset on EC2** — both clones use the instance role `uniemax-ec2-role` (see `docs/DEPLOYMENT.md`); only local dev needs keys |
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
| `WA_ENABLED` | `true` turns on the WhatsApp Cloud API module (default `false` — every `/whatsapp` route answers 503). **`true` refuses to boot in any environment unless the five keys below are set** |
| `WA_VERIFY_TOKEN` | Webhook handshake token — any random string, **different per environment**, entered in that environment's Meta app |
| `WA_APP_SECRET` | App secret of the Meta app used in this environment — verifies `X-Hub-Signature-256` |
| `WA_ACCESS_TOKEN` | System-user permanent token (Bearer for the Graph API). Never logged |
| `WA_PHONE_NUMBER_ID` / `WA_WABA_ID` | Sender number id + WhatsApp Business Account id (prod `1297227253483920` / `946861481250667`; dev: the Meta test number's ids) |
| `WA_GRAPH_VERSION` | Graph API version (default `v21.0`) |
| `WA_DEV_ALLOWED_RECIPIENTS` | **Non-production only:** comma-separated numbers sends are restricted to (anything else → 403; empty = nothing sends). Ignored in production |
| `WA_SEND_RATE_PER_SEC` | Campaign send pace (default `20`) |
| `WA_LOG_PAYLOADS` | Production only: `true` logs the full Graph request (URL, headers with the token masked, body) and Meta's full response, to debug a failing send. Puts message text in the logs — switch it back off. Non-production always logs in full (default `false`) |

> All auth vars (`JWT_*`, `AUTH_COOKIE_*`, `OTP_*`, OAuth client ids) are read from the
> same `.env` but validated **inside** the self-contained
> `package/auth/core/config/env.ts`, not `config/env.ts`. See
> [`docs/PACKAGE_AUTH.md`](./docs/PACKAGE_AUTH.md). Storage vars (`STORAGE_*`,
> `AWS_*`, `MEDIA_*`) are likewise validated inside
> `package/storage/config.ts`. The database stores only object keys — public
> URLs are derived from this config, so buckets/CDNs can change freely.

## WhatsApp Cloud API

Module: `src/modules/whatsapp/`. Endpoint contracts: [`docs/API.md`](../docs/API.md#whatsapp-cloud-api);
rules and data model: [`docs/BACKEND_CONTEXT.md`](../docs/BACKEND_CONTEXT.md). Day to day
it is used from the admin console's **WhatsApp** page (`/admin/whatsapp` — inbox,
campaigns, templates); the curl below is for testing and scripting. Dev and
prod use **separate Meta apps**, so every credential differs per environment (see the
per-mode blocks in `.env.example`).

### Dev setup

1. In the **dev** Meta app → WhatsApp → API Setup, use the Meta **test number**; add your
   own phone as a test recipient. Put its ids, the app secret and a token in
   `.env.development`, set `WA_ENABLED=true`, and list your phone in
   `WA_DEV_ALLOWED_RECIPIENTS`.
2. `npm run dev`, then expose it: `cloudflared tunnel --url http://localhost:4000`
3. Dev Meta app → WhatsApp → Configuration → Webhook: callback URL
   `https://<random>.trycloudflare.com/api/v1/whatsapp/webhook`, verify token =
   `WA_VERIFY_TOKEN`. Subscribe to the **messages** field.

The tunnel URL changes on every `cloudflared` run — update the callback each time.

### Prod setup

Prod Meta app → WhatsApp → Configuration → Webhook: callback URL
`https://uniemax.com/api/v1/whatsapp/webhook` (nginx's existing `/api` proxy serves it),
verify token = prod `WA_VERIFY_TOKEN`; subscribe to **messages**. Credentials go in the
server's `.env.production`. The tables ship with the committed migration
(`npm run db:deploy` — never `migrate dev` against prod).

### curl

```bash
API=http://localhost:4000/api/v1
# Admin bearer token (send/campaign/message routes live under /admin):
TOKEN=$(curl -s $API/admin/auth/mobile/login -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"…"}' | jq -r .data.accessToken)

# 1. Webhook handshake (what Meta does) → prints 12345
curl "$API/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=$WA_VERIFY_TOKEN&hub.challenge=12345"

# 2. Signed webhook event (simulating Meta)
BODY='{"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{"contacts":[{"wa_id":"919876543210","profile":{"name":"Asha"}}],"messages":[{"id":"wamid.TEST1","from":"919876543210","timestamp":"1760000000","type":"text","text":{"body":"Hi"}}]}}]}]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WA_APP_SECRET" | sed 's/^.* //')
curl -X POST $API/whatsapp/webhook -H 'content-type: application/json' \
  -H "x-hub-signature-256: sha256=$SIG" -d "$BODY"

# 3. Template
curl -X POST $API/admin/whatsapp/send-template -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"to":"+919876543210","templateName":"hello_world","languageCode":"en_US","bodyParams":[]}'

# 4. Free-form text (only within 24h of the contact's last message)
curl -X POST $API/admin/whatsapp/send-text -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"to":"919876543210","text":"Your order shipped!"}'

# 5. Campaign → 202 { campaignId }
curl -X POST $API/admin/whatsapp/campaigns -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"Diwali","templateName":"festive_offer","languageCode":"en","recipients":[{"to":"919876543210","bodyParams":["Asha","20%"]}]}'

# 6. Campaign progress
curl $API/admin/whatsapp/campaigns/<campaignId> -H "authorization: Bearer $TOKEN"

# 7. Conversation
curl "$API/admin/whatsapp/messages/919876543210?page=1&pageSize=50" -H "authorization: Bearer $TOKEN"
```

## Adding a feature module

Create four files under `src/modules/<name>/` (`schema` · `service` · `controller` ·
`routes`) and register the routes in `src/routes.ts`. See `modules/category/` for the
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

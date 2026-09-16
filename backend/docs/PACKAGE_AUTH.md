# `package/auth` — Authentication Package

> Single source of truth for the auth sub-system at `backend/src/package/auth/`.
> Read this first when working on anything auth-related. Endpoint payloads:
> [`docs/API.md`](../../docs/API.md) · frontend integration:
> [`docs/FRONTEND_CONTEXT.md`](../../docs/FRONTEND_CONTEXT.md).

---

## 1. Status at a Glance

### ✅ Completed (working end-to-end, verified)

| Feature | Notes |
| ------- | ----- |
| **Email + password registration** (verify-first) | Form → **real code emailed via Resend** → code confirms → account created *already verified* + signed in. No account exists before verification. |
| **Email + password login** | bcrypt; generic 401 on any failure (no enumeration). |
| **Forgot / reset password** | Real emailed code; reset revokes **all** sessions; anti-enumeration (always 201). |
| **Change / set password** | Change needs the current one; Google-only accounts can set a first password. |
| **Phone OTP login** (login-only) | Signs in phones **already linked** to an account; never creates accounts. Unlinked phone → 404 with guidance. **Message Central integration built** — goes live the moment its credentials land in `.env` (console fallback until then). |
| **Phone/email linking** (`/me/link`) | Code-verified; identifier unique to one account (409 on conflict). Linking a phone is what enables OTP login. |
| **Google Sign-In flow logic** | Find-by-`(provider,sub)` → link-by-verified-email → create. *(Token verification itself is still mocked — see below.)* |
| **Admin login** (email + password) | Bootstrap/reset via `npm run create-admin` — no signup endpoint by design. |
| **Sessions** | Access JWT (15m) + opaque rotating refresh token (DB-backed). Reuse of a rotated token ⇒ theft ⇒ all sessions revoked — except within a 30 s grace window after the rotation (`REUSE_GRACE_MS`), when the late presenter is a sibling browser tab and is rotated forward from the successor session. Web = httpOnly cookies + double-submit CSRF (the access cookie carries the refresh cookie's `maxAge`, so an expired JWT still reaches the guard as a recoverable `401` rather than vanishing); mobile = bearer tokens. Refresh / logout / logout-all per surface. |
| **Email delivery** | **LIVE via Resend** — domain verified, sender `EMAIL_FROM`. Codes are never echoed in API responses; no dev bypass for email. Provider failure → clean `502`. |
| **Profile self-service** | `GET/PATCH /me`, `GET /me/orders`. |

### 🟡 Pending (needs credentials or a real provider)

| Item | Current state | What's needed |
| ---- | ------------- | ------------- |
| **SMS OTP — Message Central** | **Adapter fully built** (`sms/messageCentral.otp.provider.ts`): managed verification (they generate/deliver/validate the code; we store only the `verificationId` in `Otp.providerRef` — DB-backed, multi-instance safe). Auto-selected when credentials are set. Until then a console fallback issues local codes (`devCode` in dev responses); `OTP_BYPASS=true` would restore the fixed `123456`. | Just the credentials: `MESSAGE_CENTRAL_CUSTOMER_ID` + `MESSAGE_CENTRAL_AUTH_TOKEN` in `.env` (placeholders ready). `SMS_COUNTRY_CODE` defaults to `91`. |
| **Google token verification** | `google.mock.verifier.ts` decodes the token **without signature check** (accepts any JWT or raw JSON like `{"sub":"g-1","email":"a@b.com"}`). Frontend shows a "dev simulation" panel instead of the Google popup. | A `GOOGLE_CLIENT_ID` (Google Cloud Console → OAuth consent screen + Web client with the storefront origins). Then: `google-auth-library` adapter (snippet in §6) + swap the registry line + replace the frontend dev panel with the official GIS button (same `customerAuth.google()` call). |
| **Apple Sign-In** | Not started (enum value + verifier slot ready). | Apple Developer account, Services ID + key. Then: one verifier adapter + registry line + `signInWithApple` delegate + two routes. |

### 🔒 Production hardening still to do (no external input needed)

1. **Rate limiting** (`@fastify/rate-limit`) on login / register / code-request
   endpoints + resend cooldown — brute-force and SMS/email-cost protection.
2. `@fastify/helmet` security headers.
3. Formal **Prisma migrations** (currently `prisma db push`).
4. Production env review: strong `JWT_SECRET`, `CORS_ORIGIN` allowlist,
   `AUTH_COOKIE_SECURE=true`, `NODE_ENV=production`.
5. Frontend account section (change password / link phone UIs — endpoints and
   API-client methods exist, no UI yet).

### 📋 Required data checklist (owner-provided)

- [ ] Message Central credentials (`MESSAGE_CENTRAL_CUSTOMER_ID` + `MESSAGE_CENTRAL_AUTH_TOKEN`) — adapter ready, just fill `.env`
- [ ] `GOOGLE_CLIENT_ID` (Cloud Console OAuth client, origins configured)
- [ ] (later) Apple Developer Services ID + key
- [ ] Final production domains (drive cookies, CORS, OAuth origins)
- [x] Email: Resend key + verified domain sender — **done** (`noreply@zontechx.com`)

---

## 2. The Rules of the System (read before changing flows)

- **Accounts are created only with a verified email** — via verify-first
  registration or Google (provider-verified). This blocks pre-registration
  takeover: nobody can hold an account under an email they never proved.
- **Phone numbers never create accounts.** A phone becomes a sign-in method
  only after the customer links it from their profile (code-verified).
- **Each email and each phone belongs to exactly one account** (DB-unique;
  `409` on any collision, including link races).
- **Email codes exist only in the recipient's inbox** — never in API
  responses, never bypassable. SMS codes are provider-managed (Message
  Central); a dev fallback exists *only* while its credentials are absent.
- **The core never sees a credential.** Strategies verify passwords / codes /
  provider tokens and return a `principal`; the core mints sessions from
  principals. That separation is what makes providers swappable.

## 3. The Flows

```
REGISTER (email, verify-first)
  POST /register/request  {email, password, name?}     → 409 if email taken; real code emailed
  POST /{web,mobile}/register/verify  {…same + code}   → account created (verified) + session

LOGIN
  email:  POST /{web,mobile}/login   {email, password}
  google: POST /{web,mobile}/google  {idToken}          → sign-in / auto-link / create
  phone:  POST /otp/request {phone}  → 404 if unlinked  → POST /{web,mobile}/otp/verify

PASSWORD
  POST /password/forgot {email}      → always 201; code emailed only if account exists
  POST /password/reset  {email, code, newPassword}      → revokes ALL sessions
  POST /me/password 🔒  {currentPassword?, newPassword} → change (or set first)

LINK A PHONE (enables OTP login)
  POST /me/link/request 🔒 {phone}   → 409 if owned elsewhere; code sent
  POST /me/link/verify  🔒 {phone, code}                → phone set + verified

SESSIONS (per surface: /auth and /admin/auth)
  POST /{web,mobile}/refresh · /logout · /logout-all
  web refresh needs X-CSRF-Token = that surface's CSRF cookie (double-submit)
```

### Cookie surfaces — why names are per-principal

The storefront and the admin console are two apps on **one origin**, and a
browser keys cookies by `(name, domain, path)` — **the port is not part of that
key**. A single shared set of names meant the second login evicted the first:
the evicted app then sent the wrong principal's token (403), its refresh tried
to rotate a token of the wrong kind and failed, and `/web/logout` revoked
whichever session happened to own the cookie.

Each principal kind therefore owns a **cookie surface**
(`authConfig.cookieSurface(type)` → `COOKIE_SURFACES` in `authCore.config.ts`):

| Principal | Access | Refresh | CSRF | Token path |
| --------- | ------ | ------- | ---- | ---------- |
| customer  | `access_token` | `refresh_token` | `csrf_token` | `/` |
| admin     | `um_admin_access` | `um_admin_refresh` | `um_admin_csrf` | `/api/v1/admin` |

Three properties fall out of this:

- **Both sessions coexist**, which is the normal case for staff who also sell
  or shop on the platform.
- **Admin tokens are never transmitted with a storefront request** — the
  `tokenPath` keeps them off every path outside the admin subtree.
- **Logout is surface-local**: `clearAuthCookies(reply, type)` and
  `readRefreshCookie(request, type)` only ever touch their own namespace.

Every cookie function in `core/cookies.ts` **requires the principal type as an
argument**, so this is enforced by the compiler rather than by convention —
there is no way to read, write or clear an auth cookie without saying whose it
is. `requireCsrf(type)` is likewise a factory bound to one surface, so a page
holding some other surface's CSRF token cannot satisfy the check.

The CSRF cookie stays at path `/` for both surfaces: it must be readable by JS
(double-submit), and a document served from `/admin` cannot read a cookie
scoped to `/api/v1/admin`. Isolating it by **name** is enough — it is not a
credential, and its protection comes from an attacker being unable to read it
cross-origin.

Adding a third principal kind is one entry in `COOKIE_SURFACES`; nothing else
in the package needs to know it exists.

Every login strategy resolves to the same `CustomerAuthResult { principal,
customer, isNewUser }`; the controller then does `issueSession(principal)` and
delivers per client profile (web → httpOnly cookies, mobile → JSON tokens).

## 4. Architecture

```
package/auth/
├── index.ts                  # PUBLIC facade — the ONLY entry the app imports
├── guards.ts                 # requireAdmin / requireCustomer + optionalCustomerId
│                             #   (no-throw resolve for public routes w/ owner extras)
├── core/                     # generic engine — knows only "principal", never a credential
│   ├── config/env.ts         #   package-own env (JWT, cookies, codes, Resend, OAuth ids)
│   ├── config/prisma.ts      #   the single DB seam (re-exports the app's client)
│   ├── authCore.types.ts     #   Principal, IssuedTokens, SessionMeta
│   ├── authCore.config.ts    #   TTLs + COOKIE SURFACES (names/path per principal)
│   ├── token.util.ts         #   access JWT sign/verify + opaque refresh tokens
│   ├── session.service.ts    #   DB-backed rotating sessions + theft detection
│   ├── cookies.ts            #   web cookie delivery + double-submit CSRF
│   │                         #     (every fn takes the principal type)
│   ├── delivery.ts           #   web (cookies) vs mobile (JSON body) shaping
│   ├── guard.ts              #   bearer-or-cookie requirePrincipal()
│   └── session.routes.ts     #   generic refresh/logout/logout-all per surface
├── providers/                # ⭐ the pluggable layer
│   ├── provider.types.ts     #   PORTS: EmailSender, PhoneOtpProvider, OAuthVerifier, PasswordHasher
│   ├── index.ts              #   REGISTRY — the one file to edit when swapping providers
│   ├── email/resend.email.provider.ts    # ✅ LIVE (Resend REST; picked when RESEND_API_KEY set)
│   ├── email/console.email.provider.ts   # fallback when no key (fresh clones)
│   ├── sms/messageCentral.otp.provider.ts # ✅ BUILT (managed OTP; picked when MC creds set)
│   ├── sms/console.otp.provider.ts       # fallback when no creds (local code + devCode)
│   ├── oauth/google.mock.verifier.ts     # 🟡 mock (no signature check) — awaiting client id
│   └── password/bcrypt.hasher.ts         # ✅ real
├── verification/
│   └── verification.service.ts  # code engine: EMAIL = local hashed codes;
│                                 # SMS = provider-managed (providerRef); TTL,
│                                 # attempt limits; SMS-only dev bypass
├── customer/
│   ├── customer.schema.ts     # zod schemas for every customer auth input
│   ├── customer.shared.ts     # safe select, PublicCustomer, CustomerAuthResult
│   ├── strategies/            # one file per sign-in method (password/google/otp)
│   ├── customer.service.ts    # self-service: profile, orders, linking
│   ├── customer.controller.ts # thin: parse → strategy → issueSession → deliver
│   └── customer.routes.ts     # /api/v1/auth route tree
└── admin/                     # admin credential provider (password) + /me
    ├── admin.schema.ts · admin.service.ts · admin.controller.ts · admin.routes.ts
```

Request pipeline (identical for every strategy):

```
controller parses (zod) → strategy verifies credential ──uses──▶ provider port
                        → CustomerAuthResult → issueSession → deliverWeb/Mobile
```

## 5. Provider Ports & Registry

Ports in `providers/provider.types.ts`; active implementations chosen in
`providers/index.ts` — **the only file to touch when swapping a provider**.

| Port | Contract | Implementation today |
| ---- | -------- | -------------------- |
| `EmailSender`    | `sendCode({destination, code, purpose, expiresInMinutes})` — *we* generate the code, provider delivers it | ✅ **Resend** (auto-selected when `RESEND_API_KEY` set; console fallback otherwise) |
| `PhoneOtpProvider` | `start(phone) → {providerRef, expiresInMinutes}` · `check({phone, code, providerRef})` — *provider* generates + validates the code | ✅ **Message Central** (auto-selected when its credentials are set; console fallback issues a local code otherwise) |
| `OAuthVerifier`  | `verifyIdToken(idToken) → OAuthProfile { providerAccountId, email, emailVerified, name?, avatarUrl? }` | 🟡 mock Google — real verifier pending |
| `PasswordHasher` | `hash` / `verify` | ✅ bcrypt |

## 6. How to Finish the Pending Providers

**Real Google verifier** (once `GOOGLE_CLIENT_ID` exists):

```ts
// providers/oauth/google.verifier.ts   (npm i google-auth-library)
import { OAuth2Client } from "google-auth-library";
import { authEnv } from "../../core/config/env.js";
const client = new OAuth2Client(authEnv.GOOGLE_CLIENT_ID);

export const googleVerifier: OAuthVerifier = {
  provider: "GOOGLE",
  async verifyIdToken(idToken) {
    const ticket = await client.verifyIdToken({ idToken, audience: authEnv.GOOGLE_CLIENT_ID });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) throw HttpError.unauthorized("Invalid Google token");
    return { providerAccountId: p.sub, email: p.email.toLowerCase(),
             emailVerified: p.email_verified === true, name: p.name, avatarUrl: p.picture };
  },
};
```
Then in `providers/index.ts`: `GOOGLE: googleVerifier`. Frontend: replace the
dev-simulation panel in `storefront/pages/LoginPage.tsx` with the official
Google Identity Services button; pass its `credential` to the same
`customerAuth.google()`.

**SMS (Message Central)** — already built. To go live, fill in `.env`:
`MESSAGE_CENTRAL_CUSTOMER_ID` + `MESSAGE_CENTRAL_AUTH_TOKEN` (placeholders are
in the file; `SMS_COUNTRY_CODE` defaults to `91`) and restart. Once confirmed
working, optionally delete the dev-bypass block in `verification.service.ts`
(the `bypassed()` helper) so SMS matches email: real codes only. Note their
`506` response ("verification already in flight") maps to our `429`.

**Apple**: add `APPLE` verifier adapter (JWKS validation), registry line,
`signInWithApple` delegate in `google.strategy.ts` (rename to
`oauth.strategy.ts` then), and `/{web,mobile}/apple` routes.

## 7. Data Model (owned by this package)

| Model / field | Purpose |
| ------------- | ------- |
| `AuthSession` | Rotating refresh sessions (opaque principal, no FK — reusable across projects) |
| `Otp`         | Verification codes: `purpose` ∈ LOGIN · LINK · EMAIL_VERIFY · PASSWORD_RESET (+ ORDER_PLACEMENT, reserved). `codeHash` for locally-generated (email) codes; `providerRef` for provider-managed (Message Central `verificationId`) |
| `OAuthAccount`| `(provider, providerAccountId)`-unique link between a social identity and a `Customer` |
| `Customer.passwordHash` | Set for password accounts; null for social-only (`hasPassword` in API responses, hash never leaves the server) |
| `Customer.emailVerifiedAt / phoneVerifiedAt` | Set at registration-verify / OTP / linking |
| `Customer.avatarUrl` | Usually from the OAuth profile picture |

## 8. Environment (parsed by the package in `core/config/env.ts`)

| Var | Default | Notes |
| --- | ------- | ----- |
| `JWT_SECRET` | — | **Required**, ≥16 chars |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access-token TTL |
| `JWT_ADMIN_EXPIRES_IN` / `JWT_CUSTOMER_EXPIRES_IN` | `7d` / `30d` | Refresh TTLs |
| `AUTH_COOKIE_SECURE` / `AUTH_COOKIE_SAMESITE` / `AUTH_COOKIE_DOMAIN` | prod / `lax` / — | Web cookies |
| `OTP_LENGTH` / `OTP_TTL_MINUTES` / `OTP_MAX_ATTEMPTS` | `6` / `5` / `5` | Verification codes |
| `OTP_BYPASS` | on outside production | **SMS-only** dev bypass; email codes are always real |
| `OTP_DEV_CODE` | `123456` | The code the SMS bypass accepts |
| `RESEND_API_KEY` | — | Set → live Resend email; unset → console fallback |
| `EMAIL_FROM` | `connect@zontechx.com` | Must be on the Resend-verified domain |
| `MESSAGE_CENTRAL_CUSTOMER_ID` / `MESSAGE_CENTRAL_AUTH_TOKEN` | — | Both set → live Message Central SMS OTP; unset → console fallback |
| `MESSAGE_CENTRAL_SEND_URL` / `MESSAGE_CENTRAL_VERIFY_URL` | cpaas v3 endpoints | Override only if MC changes hosts |
| `SMS_COUNTRY_CODE` | `91` | Country code sent with every MC request |
| `GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` | — | For the real verifiers (mock ignores them) |

## 9. Endpoint Map (payload details in `docs/API.md`)

```
/api/v1/auth                                  /api/v1/admin/auth
├── POST /register/request                    ├── POST /{web,mobile}/login
├── POST /{web,mobile}/register/verify        ├── POST /{web,mobile}/refresh|logout|logout-all
├── POST /{web,mobile}/login                  └── GET  /me                    🔒
├── POST /{web,mobile}/google
├── POST /otp/request          (linked phones only)
├── POST /{web,mobile}/otp/verify
├── POST /password/forgot · /password/reset
├── POST /{web,mobile}/refresh|logout|logout-all
├── GET|PATCH /me · GET /me/orders            🔒
├── POST /me/password                         🔒
└── POST /me/link/request · /me/link/verify   🔒  (adds phone → enables OTP login)
```

## 10. Extraction Seams (for a future auth microservice)

1. `index.ts` — the only import surface the app uses.
2. `core/config/prisma.ts` — the only DB coupling (needs `AuthSession`, `Otp`,
   `OAuthAccount`, `Customer`, `Admin` in the target schema).
3. `utils/httpError.ts` + `utils/response.ts` — shared error/envelope helpers
   (copy or replace when extracting).

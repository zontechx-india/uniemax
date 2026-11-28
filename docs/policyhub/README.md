# PolicyHub — platform policies (first policy: Seller Payout, `PYO-001`)

> **Start here** for any policy work — this file is the single source of truth for PolicyHub.
> Seller money rules (fees, ledger, payouts) stay in
> [`docs/seller-finance/README.md`](../seller-finance/README.md); this file covers the **policy
> text** and how it is linked to payouts. It replaces the earlier `payout-management-review-plan.md`.

---

## 0. Where things stand (read first in a new chat)

**Status (28 Nov 2026):** Phases 1–4 **built, committed, pushed to `main` and deployed to dev**
(GitHub Actions "Deploy dev" succeeded; both migrations ran on dev). **Not on production.**
**Phase 5:** `PYO-001` v1 is **published on dev** (since 28 Nov 2026, by the admin screen); prod not yet.

| Phase | What | Commit | Dev | Prod |
|---|---|---|---|---|
| 1 | `policyhub` schema + backend package + API | `1a50f3c` | ☑ deployed | ☐ |
| 2 | Each payout saves its policy version | `45361a4` | ☑ deployed | ☐ |
| 3 | Admin **Platform → Policies** screens | `6b027d4` | ☑ deployed | ☐ |
| 4 | Seller **Earnings → Payout policy** | `436722e` | ☑ deployed | ☐ |
| 5 | Publish `PYO-001` v1 (by a SUPER_ADMIN in the admin screen) | — | ☑ published | ☐ |
| 6 | Admin policy page: **For developers** card (code, API URLs, live sample, snippet) | `3f26f3d` | ☑ deployed | ☐ |
| 7 | Public **Policies** pages `/policies` + `/policies/:code` (replace the seller's in-app page), `GET /api/v1/policies`, page shells + sitemap | commit "feat(policy): public Policies pages" | ☑ deployed (nginx ☐) | ☐ |

**Next steps, in order**
1. Test on dev (§15).
2. nginx: forward `/policies` and `/policies/` to the page shells on the storefront vhosts (dev, then
   prod) — §13 item 3. Until then the pages work; only crawlers get the default head.
3. Production: push a `v*` tag (deploys at once — see `docs/DEPLOYMENT.md`), then publish v1 the same
   way on the prod admin console. Prod's migrations run on deploy (`npm run db:deploy`).
4. Follow-ups, not built (§13): show the policy version on the **admin** order's Seller payout card,
   images on the Policies pages (design pending), telling sellers about a new version.

**URLs (dev):** admin `https://admin.dev.uniemax.zontechx.com/` · seller app
`https://dev.uniemax.zontechx.com/` · API `https://dev.uniemax.zontechx.com/api/v1/...`.

### File map

| Area | Files |
|---|---|
| Schema | `backend/prisma/schema/policy.prisma` (3 tables) · `core.prisma` (`"policyhub"` in `schemas`; `OrderPayout.policyVersionId`) |
| Migrations | `backend/prisma/migrations/20261128100000_policyhub/` · `20261128140000_payout_policy_version/` |
| Backend package | `backend/src/package/policy/` — `rules.ts` (pure logic) · `schema.ts` (Zod) · `service.ts` (only DB access) · `controller.ts` · `routes.ts` · `config.ts` · `index.ts` (public face: routes, `versionAt`, `versionsByIds`, `getPublicPolicy`, `listPublicPolicies`) |
| Backend wiring | `src/routes.ts` (public `/api/v1/policies`, admin `/api/v1/admin/policies`) · `src/config/env.ts` (`POLICY_PROJECT`) · `modules/payouts/payouts.service.ts` (`PAYOUT_POLICY_CODE`, `payoutPolicyVersionId`, `policyVersionsFor`) · `modules/finance/finance.service.ts › getSellerEarnings` · `modules/seo/pageShell.service.ts` (`policies` / `policy` page kinds, `POLICIES_HEAD`, `policyDescription`), `pageShell.routes.ts`, `pageShell.controller.ts`, `pageShell.schema.ts` (`version`), `sitemap.service.ts` |
| Backend tests | `backend/test/unit/policy.test.ts` (13) · `backend/scripts/policy-check.ts` (19 real-DB checks) · `backend/scripts/payout-policy-check.ts` (8 real-payout checks) · `backend/test/unit/policy-page-shell.test.ts` (3: head text identical on both sides, `?version=` parsing) |
| Admin UI | `frontend/src/admin/pages/policies/` — `PoliciesPage.tsx` · `PolicyPage.tsx` · `PolicyDeveloperCard.tsx` · `policyTemplates.ts` (approved v1 text + `AUDIENCES`) · `admin/features/adminApi.ts` (policy types + calls) · `admin/app/navigation.ts`, `router.tsx` · `admin/layout/icons.tsx` (`scroll`) |
| Public pages | `frontend/src/storefront/pages/policies/` — `PoliciesPage.tsx` (`/policies`) · `PolicyPage.tsx` (`/policies/:code`) · `policySeo.ts` (head text — twin of the page shell) · footer link "All policies" in `storefront/pages/HomePage.tsx` (`MarketFooter`) |
| Seller UI | `StoreEarningsPage.tsx` (links open `/policies/PYO-001` in a new tab) · `storefront/app/router.tsx` (`earnings/payout-policy` → redirect) · `storefront/features/stores/storesApi.ts` (`policyVersion` on earnings payouts) |
| Shared UI | `frontend/src/shared/policy/` — `PolicyText.tsx` (safe Markdown subset) · `policyWording.ts` (placeholder fill — browser twin of `rules.ts › renderBody`) · `PayoutTimes.tsx` (times in plain words) · `policyApi.ts` (public API, `PAYOUT_POLICY_CODE`, `policyPath`) |
| Other docs touched | `docs/API.md` (pointer + payout `policyVersion`), `docs/BACKEND_CONTEXT.md`, `docs/FRONTEND_CONTEXT.md`, `docs/seller-finance/README.md`, `docs/CONTEXT.md`, `backend/README.md` (env + scripts), `CLAUDE.md` (docs table row), `docs/SEO.md` (policy page shells, sitemap) |

---

## 1. What it is (in one minute)

A **policy** is a rule we publish for people to read. For example: "When do sellers get paid?"

PolicyHub is a small **notice board**:

- Each notice has a stable **code** (`PYO-001`), and it belongs to one **project** (`uniemax`, `zontechx`, …).
- A notice is changed by pinning a **new version**. A pinned (published) version is **never edited or deleted**.
- Each version has an **effective-from** time. The current version is the newest published one that has already started.
- Every action (create, edit, reset, publish) is written to an **audit trail**.

PolicyHub **does not move money**. Payout code decides payouts. PolicyHub only says what we promise,
and each payout remembers which promise applied to it.

---

## 2. Decisions (all confirmed 28 Nov 2026)

| # | Decision |
|---|---|
| P1 | **One policy per project.** UnieMax has its own `PYO-001`; Zontechx would have its own, with its own versions. Within a project one payout policy covers **all sellers** (no per-store / per-category versions). |
| P2 | **One** payout schedule for everyone in a project. |
| P3 | **`ADMIN` may edit drafts. Only `SUPER_ADMIN` may create a policy or publish.** One person publishes — no second-approval step. |
| P4 | Today payouts are **done by hand, 6 PM – 10 PM IST**. The policy describes that. |
| P5 | Later stages: **provider APIs with order verification**, then **automatic** payouts (§10). Nothing built for them yet. |
| P6 | Tables live in their **own schema `policyhub`** in the same database (like PaymentHub's `paymenthub`). Later they move to a **separate database** shared by many projects. |
| P7 | Every row carries a **`project`** name; the database makes a version and its events belong to their policy's project. |
| P8 | Timezone for every policy time: **`Asia/Kolkata` (IST)**. |
| P9 | Sellers do **not** have to accept the policy. Showing it is enough. |
| P10 | **Payouts run every day**, Sundays and bank holidays included — no holiday list. (UPI / IMPS work on holidays; a manual NEFT may be credited the next bank working day — the wording says credit time depends on the bank.) |
| P11 | **Every new payout saves `policyVersionId`** — the PolicyHub version in force for it, manual payouts included. |
| P12 | The wording **briefly mentions advance payouts** as UnieMax's own choice. |
| P13 | **Times in the wording come from `settings`** via placeholders, never typed by hand (§7). |
| P14 | The cutoff clock is **`orders.deliveredAt`** (when the order is marked DELIVERED), not the courier's `order_shipments.deliveredAt`. |
| P15 | The wording in §4 is **approved** (checklist #8). |

Not in scope: per-tenant or per-seller policies, multi-step approval, seller acceptance, any change
to payout amounts, the ledger or bank integration.

**Pre-implementation checklist** (all resolved): one policy per project (P1) · settings and wording
consistent (P13) · project isolation on versions (§6) · draft deletion vs audit → reset, never delete
(§6) · holidays (P10) · who publishes (P3) · `policyVersionId` on payouts (P11) · wording (P15).

---

## 3. How payouts work today (facts from the code)

| Step | What happens | Code / table |
|---|---|---|
| 1 | The order is marked **DELIVERED**; the time is saved. | `orders.deliveredAt` (`orders.service.ts`) · courier time: `order_shipments.deliveredAt` |
| 2 | On the DELIVERED event, or the **15-minute sweep**, the seller's earning goes to their ledger as **PAYABLE**. | `finance/finance.jobs.ts` → `ledger.service.ts › postLegs` |
| 3 | An **admin** opens *Seller payouts → To pay* and pays from the order page: **MANUAL** (bank transfer, admin types the UTR) or **GATEWAY** (PaymentHub → Cashfree). | `payouts/payouts.service.ts › listAwaitingPayout`, `recordManualPayout`, `triggerGatewayPayout` |
| 4 | Status moves PENDING → PROCESSING → SUCCEEDED (or FAILED / REVERSED / CANCELLED); every change is logged. | `order_payouts`, `order_payout_events` |
| 5 | The seller gets an email + WhatsApp and sees the payout on **Earnings** and **Transactions**. | `payouts/payouts.notifications.ts` |

No payout for COD orders and OFFLINE bills (the seller already holds the money; UnieMax collects its
fee). **Advance payouts** (before delivery) are a manual choice for trusted stores — seller-finance §9.

**Key fact:** no code waits for 6 PM. The 6–10 PM window is a **team routine**, not a timer — hence
the wording says "we start the transfer", not "money reaches your bank".

---

## 4. Policy `PYO-001`: version 1 (approved)

| Field | Value |
|---|---|
| Project | `uniemax` |
| Code | `PYO-001` |
| Name | Seller Payout Policy |
| Audience | `seller` |

**Settings (v1)**

```json
{ "cutoff": "18:00", "windowStart": "18:00", "windowEnd": "22:00", "timezone": "Asia/Kolkata" }
```

**Wording (v1)** — approved 28 Nov 2026. Publish it as typed below (placeholders included). The admin
editor's **Use the approved wording** button fills exactly this text and the settings above
(`frontend/src/admin/pages/policies/policyTemplates.ts` — **change both together**). Words in `{{ }}`
are filled from the settings when shown (§7); readers see "6:00 PM", "10:00 PM" and "IST".

> **When we pay you**
> - Orders marked **delivered before {{cutoff}} {{tz}}** are paid the **same day**. We start the bank transfer between **{{windowStart}} and {{windowEnd}} {{tz}}**.
> - Orders marked delivered **at {{cutoff}} {{tz}} or later** are paid the **next day** in the same window.
> - We pay **every day**, including Sundays and bank holidays.
> - "Paid" means we have **started the transfer**. The time money reaches your account depends on your bank. On bank holidays it can take until the next working day.
>
> **What is paid**
> - Online-paid orders, after delivery, minus the platform fee shown on your Earnings page.
> - Cash on delivery orders and bills you collected yourself are not paid out. You already hold that money. Any fees you owe are taken from a later payout.
> - In some cases UnieMax may choose to pay part of an order before delivery. This is at UnieMax's choice and is not guaranteed.
>
> **When a payout can be delayed**
> - Your payout bank account is missing or not verified.
> - The bank or payment provider is down. We retry in the next window.
> - The transfer fails or comes back. We tell you and retry after the problem is fixed.
> - The order is cancelled, refunded or under dispute.

(The `>` quote marks are only for this doc — the stored body has none.)

---

## 5. Architecture

```
 UnieMax frontend                           UnieMax backend (Fastify)
 ─────────────────                          ─────────────────────────────────────────
 Admin  → Platform → Policies    ──HTTP──▶ /api/v1/admin/policies/**  (requireAdmin + CSRF;
                                                                        create / publish = SUPER_ADMIN)
 Seller → Earnings → Payout policy ───────▶ /api/v1/policies/:code     (public, started versions only)
                                                     │
 payouts.service.ts ── versionAt() ───────▶ src/package/policy/   ← the ONLY code that touches policyhub
 finance.service.ts ── versionsByIds() ──▶  (rules · schema · service · controller · routes · config)
                                                     │ Prisma
                                                     ▼
          PostgreSQL (Supabase) ── schema "public"     (UnieMax tables; order_payouts.policyVersionId)
                                ── schema "paymenthub" (PaymentHub — separate app, never touched)
                                ── schema "policyhub"  (policies, policy_versions, policy_events)
```

**Later (split-out):** PolicyHub becomes its own small service with its own database, like
PaymentHub. Each project calls it with an **API key** that decides the `project`. UnieMax swaps
`package/policy/service.ts` for an HTTP client; routes, screens and `order_payouts.policyVersionId`
stay the same. `controller.ts` stays in UnieMax (it reads the acting admin's email from `admins`).

### Isolation rules (so the split is a copy, not a rewrite)

1. Every PolicyHub table and enum is `@@schema("policyhub")`.
2. **No foreign keys** between `policyhub` and any other schema, **no SQL joins** across schemas. `order_payouts.policyVersionId` is a plain string.
3. People are a **plain id + email copy** (`actorId`, `actorEmail`), never a link to `admins`.
4. Every query filters by **`project`**, which comes from config (`POLICY_PROJECT`, default `uniemax`), never from a request.
5. Only `src/package/policy/` reads or writes these tables; other code uses its `index.ts` exports.
6. PolicyHub keeps its **own audit table** (`policy_events`), never UnieMax's `admin_audit_logs`.

---

## 6. Data model (3 tables) — built

Schema `policyhub`, file `backend/prisma/schema/policy.prisma`.

| Model (table) | Key fields | Constraints |
|---|---|---|
| `Policy` (`policies`) | `project`, `code`, `name`, `audience` | unique `(project, code)` · unique `(id, project)` |
| `PolicyVersion` (`policy_versions`) | `project`, `policyId`, `version` (1, 2, 3…), `status` `DRAFT \| PUBLISHED`, `body` (Markdown with `{{placeholders}}`), `changeSummary` (shown to readers), `changeReason` (admin only), `settings` (JSON), `effectiveFrom`, `publishedAt`, `publishedById/Email`, `createdById/Email` | unique `(policyId, version)` · unique `(id, project)` · index `(project, policyId, status, effectiveFrom)` · link `(policyId, project)` → `policies(id, project)`, Restrict |
| `PolicyEvent` (`policy_events`) | `project`, `versionId`, `action` `CREATED \| EDITED \| RESET \| PUBLISHED`, `actorId/Email`, `note`, `before`, `after` (changed fields only) | link `(versionId, project)` → `policy_versions(id, project)`, Restrict · append-only |

**Project isolation.** The links use the pair `(id, project)`, so the database itself refuses a
version or event whose project differs from its policy (tested in `policy-check.ts`).

**Drafts are never deleted.** A deleted draft would break its own events (Restrict). So: at most one
draft per policy, reused for the next change; **"Discard changes"** resets it to a copy of the latest
published version (writes `RESET`). An unused draft is harmless — never shown publicly.

**No `project` table** (a config string is enough until the split-out service needs API keys).
**No `effectiveTo` / `RETIRED`** — a version ends when the next published one starts, so versions
can never overlap.

**UnieMax side:** `OrderPayout.policyVersionId String?` (`public.order_payouts`) — the PYO-001
version in force for that payout. Plain string, no FK, no index. Old rows stay null (= paid before
PolicyHub); nothing is backfilled.

---

## 7. Rules (all enforced in the backend)

| Rule | Where |
|---|---|
| **Current version** = newest `PUBLISHED` with `effectiveFrom ≤ now` | `rules.ts › versionInForce`; DB form `service.ts › versionAt` |
| A version's **period** = its `effectiveFrom` until the next started version's `effectiveFrom` (a scheduled one doesn't end it yet) | `rules.ts › startedHistory` |
| Published versions are **never edited or deleted** | service writes only touch the DRAFT row; edit with no draft → 409 |
| At most **one DRAFT** per policy, never deleted | inside a transaction with the policy row locked (`SELECT … FOR UPDATE`); a second "start draft" returns the same draft |
| A new draft **starts as a copy** of the latest published version | `service.ts › startDraft` |
| `effectiveFrom` is **now or later** (2-min clock grace) and **strictly later** than the latest published start | `rules.ts › effectiveFromProblem` |
| **Publish** = one transaction: lock → check every problem → set `PUBLISHED`, `effectiveFrom`, `publishedAt/By` → `PUBLISHED` event | `service.ts › publishDraft` |
| Version 2+ needs **changeSummary and changeReason** to publish | `service.ts › publishProblems` |
| **Settings shape** per code: `PYO-001` → `cutoff`, `windowStart`, `windowEnd` (`HH:mm`, 24h), `timezone` (IANA), `windowStart < windowEnd`, no extra keys. A code without rules must have no settings. | `rules.ts › payoutSettingsSchema`, `settingsProblem` |
| **Wording matches settings.** PYO-001's body must use `{{cutoff}}`, `{{windowStart}}`, `{{windowEnd}}`, `{{tz}}` and no unknown placeholder; the server fills them (`18:00` → "6:00 PM", `Asia/Kolkata` → "IST") | `rules.ts › bodyProblems`, `renderBody`; browser twin `shared/policy/policyWording.ts` (change both together) |
| **Cutoff:** delivered before `cutoff` (in the policy's timezone) → same day; at `cutoff` or later → next day; every calendar day counts | `rules.ts › payoutDay` — unit-tested; **not used by any payout code yet** (stage 3 of §10) |

---

## 8. API — built

`project` always comes from `POLICY_PROJECT`. `:code` is case-insensitive. Every write logs a `policy_events` row.

**Admin** — `/api/v1/admin/policies`, inside the admin subtree (`requireAdmin` + CSRF). Every write
answers with the full policy view.

| Method | Path | Role | Body | Does / errors |
|---|---|---|---|---|
| GET | `/` | ADMIN | — | `[{ code, name, audience, current, scheduled, draft, versionCount }]` |
| GET | `/:code` | ADMIN | — | Full view. `404` unknown code |
| POST | `/` → `201` | SUPER_ADMIN | `{ code, name (2–120), audience }` | Policy + empty draft v1. `409` exists · `403` not super admin |
| POST | `/:code/draft` | ADMIN | — | Start (or return) the draft |
| PATCH | `/:code/draft` | ADMIN | any of `{ body (≤50 000), changeSummary (≤500), changeReason (≤1000), settings }`; `null` clears | `400` bad settings · `409` no draft |
| POST | `/:code/draft/reset` | ADMIN | — | Discard changes. `409` no draft |
| POST | `/:code/draft/publish` | SUPER_ADMIN | `{ effectiveFrom? }` (ISO; omitted = now) | `400` every problem joined · `409` no draft · `403` not super admin |

**Full policy view:** `{ code, name, audience, hasSettings, current, versions[], events[] }`. Each
version: `id, version, status, state (DRAFT | SCHEDULED | CURRENT | PAST), body, renderedBody,
problems[]` (drafts only — what blocks publishing), `changeSummary, changeReason, settings,
effectiveFrom, effectiveTo, publishedAt, publishedByEmail, createdByEmail, createdAt, updatedAt`.
Events newest first (max 200): `id, version, action, actorEmail, note, before, after, createdAt`.

**Public** — `/api/v1/policies`, no login. Started published versions only, body filled in; **no**
ids, emails, `changeReason` or events.

| Method | Path | Returns |
|---|---|---|
| GET | `/` | `[{ code, name, audience, version, effectiveFrom, changeSummary }]` — every policy with a version in force, by code; none → `[]` |
| GET | `/:code` | `{ code, name, audience, version, effectiveFrom, effectiveTo, body, changeSummary, settings }` · `404` unknown or nothing published |
| GET | `/:code/versions` | `{ code, name, versions: [{ version, effectiveFrom, effectiveTo, changeSummary }] }`, newest first |
| GET | `/:code/versions?version=N` | that version in full · `404` unknown / not started |

**Payout responses:** the admin order payouts view and every payout a payout write returns carry
`policyVersionId` + `policyVersion: { version, effectiveFrom } | null`; the seller's
`GET /stores/:id/earnings` payouts carry `policyVersion` only. Shapes in `docs/API.md`.

### 8a. How a developer uses a policy in an app

The admin policy page ends with a **For developers** card that shows all of this for that policy
(code, URLs with copy buttons, a live sample from the public API, the snippet).

1. Take the policy's **code** (e.g. `RET-001`). It never changes.
2. Read the **version in force**: `GET /api/v1/policies/:code` (no login). In our frontend:
   `policyApi.current(code)` (`null` = nothing published yet) and draw `body` with `<PolicyText>` —
   the body comes with placeholders already filled.
3. Optional: list history with `policyApi.history(code)`, open one with `policyApi.version(code, n)`.
4. **Connect once.** The app always asks for the version in force, so a new version needs no code
   change.
5. If the app must remember **what a user agreed to** (like payouts do), save `version` (or the
   version id, via a backend `versionAt()` call) on that record.
6. A policy is only words. If it must change how the app behaves (cutoffs, limits), that is code —
   and a code with settings needs its own entry in `rules.ts › CODE_RULES`.

---

## 9. Screens — built

| Who | Where | What |
|---|---|---|
| Admin | **Platform → Policies** (`/policies`) | List with chips (version in force · scheduled · draft). Empty state: SUPER_ADMIN gets **Create the seller payout policy** (pre-filled PYO-001). |
| Admin | `/policies/:code` | **Draft editor**: payout time fields + timezone, wording textarea with **insert buttons** for each placeholder, "What changed" / "Why", **live preview**; under it the server's problems ("Before this can be published") or "Ready to publish"; **Save draft** · **Publish version N…** (SUPER_ADMIN; dialog: now or a date, "can never be edited" warning) · **Discard changes** (confirm). Empty PYO-001 draft → **Use the approved wording**. Then **What readers see now**, **Versions** (period, summary, who published, "Show wording"), **Activity** and **For developers** (§8a: code, the three public API URLs with copy buttons, a live sample of the public response — or "nothing published yet, the API answers 404" — and the frontend snippet). An ADMIN sees "Only a super admin can publish". |
| Seller | **Earnings** | "When we pay you" card (`PayoutTimes`: before cutoff → same day, at/after → next day, transfer window, every day) + **Read the payout policy** link; each payout shows **"Paid under payout policy vN"**. Both open the public page `/policies/PYO-001` (`?version=N` for a payout) **in a new tab**. Card hidden when nothing is published or the call fails. The old in-app page `/mystores/:slug/earnings/payout-policy` now redirects there, keeping `?version=N`. |
| Public | **Policies** `/policies` | Marketplace chrome; tabs **Sellers · Customers · Suppliers** (`SegmentedControl`; the tab is the URL hash `#sellers` / `#customers` / `#suppliers`, so no second indexable URL). Each tab lists the policies with a version in force for that audience (from `GET /api/v1/policies` — a newly published policy appears with no code change): name, "Version N · since date", what changed (v2+). The Customers tab also links the hand-written `/refund-policy` and `/shipping-policy` and says a store may add its own terms. Empty tab → "No policies for … yet". Footer: **Legal → All policies**. |
| Public | **One policy** `/policies/:code` | Breadcrumb UnieMax › Policies; name, "For sellers · Version N · in force since date"; `PayoutTimes` (payout policy only), "What changed" (v2+), the wording, code; **Earlier versions** (dates, summary, **Read** loads that version's wording + times). `?version=N` opens and scrolls to it. Code is case-insensitive. Unknown or unpublished → "This policy isn't published" + **See all policies**. Images: none yet — design pending (§13). |
| Admin | Order page → Seller payout card | **Not built** — the API already returns `policyVersion`; the card doesn't show it yet (§13). |

Policy wording is drawn by `shared/policy/PolicyText` — a tiny safe Markdown subset (a line that is
only `**bold**` or starts with `#` = heading; `- ` / `* ` = bullet; `**bold**` inline; blank line =
new paragraph), built as React elements, never HTML strings.

---

## 10. Payouts and traceability — built

`payouts.service.ts › payoutPolicyVersionId(orderId, log)` → `versionAt('PYO-001', at)`, called in
`recordManualPayout` and `triggerGatewayPayout`. Display: `policyVersionsFor` (payouts) and
`versionsByIds` inline in `finance.service › getSellerEarnings`.

| Payout | `at` = | Why |
|---|---|---|
| Normal (order delivered) | `orders.deliveredAt` | The promise was made at delivery; a newer version published before we paid doesn't change it |
| Advance (not delivered yet) | now (payout creation) | There is no delivery yet |

**Safety rule:** the lookup **never blocks or fails a payout** — no version or any error → saved
with `policyVersionId = null` and a warning logged. It runs **before** the payout transaction (no
extra lock, no cross-schema read inside the money transaction). Display lookups that fail show no
version rather than failing the page.

| Stage | Payout behaviour | Policy link |
|---|---|---|
| **1 — now** | Admin pays by hand, 6–10 PM IST | saved on every new payout (built) |
| **2 — provider APIs** | Transfers via provider APIs after the order is verified (delivered, paid, not disputed, bank verified) | same column; verification results go on the payout / its events, not PolicyHub |
| **3 — automatic** | A job reads the current PYO-001 settings and pays orders whose `payoutDay()` is today, in the window | same column; idempotency stays in payout code (one active payout per order + `idempotencyKey`) |

Rule for every stage: **the policy never starts a transfer.**

---

## 11. Security and audit

- Drafts: `ADMIN` / `SUPER_ADMIN`. Create + publish: `SUPER_ADMIN` (`requireSuperAdmin`). Every action writes a `PolicyEvent` (actor, time, before/after, note).
- Public endpoints never return drafts, not-started versions, emails, ids or audit data.
- Policy rows never hold bank or payment data. All input is Zod-checked on the server; publishing is one transaction with a row lock.

---

## 12. Build phases (detail)

| Phase | Changes | Tests |
|---|---|---|
| **1 ☑** `1a50f3c` | schema, migration `20261128100000_policyhub`, `src/package/policy/*`, routes, `POLICY_PROJECT` | `test/unit/policy.test.ts` (13: cutoff 17:59:59 / 18:00 / 23:59 IST, UTC input, month/year end, version in force, periods, start-time rules, settings, placeholders) · `scripts/policy-check.ts` (19: create, edit, publish now/later, reset, every refusal, public view, DB project isolation, parallel draft race) · HTTP: anonymous → 401, ADMIN create/publish → 403, ADMIN draft edit → 200, SUPER_ADMIN publish → 200 |
| **2 ☑** `45361a4` | migration `20261128140000_payout_policy_version`, payouts + finance services, package `versionAt` / `versionsByIds` | `scripts/payout-policy-check.ts` (8: nothing published → null · delivered under v1 → v1, also when paid after v2 started · v2 → v2 · advance → version at creation · repeated key → same payout · admin + seller views · lookup error → null + warning) · `advance-payouts-check.ts`, `policy-check.ts`, 297 unit tests unchanged |
| **3 ☑** `6b027d4` | admin `pages/policies/*`, `adminApi.ts`, nav, router, icon, `shared/policy/` | visual at 1280 / 390px with a fake API using the backend's own `rules.ts` (list, empty, editor + preview, save → ready, publish → v2 in force, ADMIN view, approved wording passes every check) · `tsc -b`, `check:ui`, `vite build` |
| **4 ☑** `436722e` | `StoreEarningsPage`, `StorePayoutPolicyPage`, route, `storesApi.ts`, `shared/policy/policyApi.ts`, `PayoutTimes.tsx` | visual at 390 / 1280px (Earnings card + links, policy page, `?version=1`, not published) · `tsc -b`, `check:ui`, `vite build` |
| **5 ◐** | publish v1 in the admin screen — dev ☑, prod ☐ (no hard-coded seed) | §15 |
| **6 ☑** `3f26f3d` | admin `PolicyDeveloperCard.tsx` on the policy page | `tsc -b`, `check:ui` |
| **7 ☑** | public `GET /api/v1/policies`, storefront `pages/policies/*`, page shells (`policies` / `policy` kinds, `?version=` → noindex), sitemap entries, Earnings links → new tab, old seller page removed (route redirects) | `test/unit/policy-page-shell.test.ts` (3) · 300 unit tests · read-only check against dev DB (list, both heads, `?version=1` noindex, unknown → 404) · visual at 390 / 1280px through a read-only GET proxy to the dev API (hub, Customers tab, policy page; no overflow, no console errors) · `tsc -b`, `check:ui` |

No phase changed payout amounts, fees, the ledger, PaymentHub or bank code.

**How to re-run the checks** (in `backend/`, against the current mode's DB — dev locally; they refuse
production and use throwaway project names, cleaning up after): `npm run test:unit` ·
`npx tsx scripts/policy-check.ts` · `npx tsx scripts/payout-policy-check.ts` ·
`npx tsx scripts/advance-payouts-check.ts`. Frontend (in `frontend/`): `npx tsc -b`,
`npm run check:ui`, `npx vite build`.

---

## 13. Open items and follow-ups

1. **Phase 5** — publish v1 on dev, then prod (§0, §15).
2. **Admin order page**: show "Paid under payout policy vN" on the Seller payout card (`admin/pages/orders/OrderPayoutCard.tsx`); the data is already in the response.
3. **nginx for the policy page shells** — add `/policies` (exact) and `/policies/` (prefix) to the
   page-shell snippet of the **storefront** vhosts (`docs/DEPLOYMENT.md` → Page shells), dev then prod,
   after a release that has them. Never on the admin hosts: the admin console has its own `/policies`.
4. **Images on the Policies pages** — the owner is designing them; keep images in the page design
   (e.g. one per audience), not in the policy data.
5. **Tell sellers about a new version** (WhatsApp / email / push)? Not decided.
6. Stage 2 / 3 of §10 (provider APIs, automatic payouts) — separate high-risk money projects.

---

## 14. What changed from the original plan (and why)

| Original idea | Now | Why |
|---|---|---|
| Statuses draft / active / retired | DRAFT / PUBLISHED | "Retired" is worked out from the next version |
| Versions 1.0 / 1.1 / 2.0 | 1, 2, 3 | No need to argue minor vs major |
| `effectiveTo` column + overlap checks | Worked out from the next version | Overlap becomes impossible |
| A separate operational-config table | `settings` JSON on the version + placeholders in the wording | Text and numbers can't drift apart |
| Deleting drafts | Reset, never delete | Keeps the audit trail whole |
| "Seller App → Wallet" | Earnings → Payout policy | UnieMax has no Wallet |
| Tables inside UnieMax's `public` | Own schema `policyhub` + `project` on every table | One policy per project; moves to its own DB later |
| `policyVersionId` only with automatic payouts | Saved from now, manual payouts too | Each payout explains itself |

---

## 15. Testing on dev (and later prod)

**Warning:** a published version can never be edited or deleted — on dev too. Publish v1 with the
real approved wording; publish a test v2 only if it may stay in dev's history forever.

1. **Create + publish v1** (SUPER_ADMIN): Platform → Policies → **Create the seller payout policy** →
   **Use the approved wording** → **Save draft** ("Ready to publish") → **Publish version 1…** → Now.
   Check `https://dev.uniemax.zontechx.com/api/v1/policies/PYO-001` returns version 1 with
   "6:00 PM IST" and no emails.
2. **Refusals:** **Start version 2** (copy of v1) → set cutoff 5:00 PM → Save → preview says 5 PM while
   "What readers see now" still says 6 PM; problems ask for change summary + reason. Replace
   `{{cutoff}}` with "6 PM" → "The wording must use {{cutoff}}". **Discard changes** → back to v1's copy
   (Activity: "Changes discarded"). An unpublished draft is safe to leave.
3. **ADMIN role:** can edit and save; no Publish button ("Only a super admin can publish"); no New policy.
4. **Seller:** Payments & delivery → **Earnings** → "When we pay you" card (6:00 PM rules) →
   **Read the payout policy** → a **new tab** opens `/policies/PYO-001`: version 1, the times card and
   the wording. Check on a phone: no sideways scrolling.
4b. **Public Policies:** open `/policies` signed out → Sellers tab lists the payout policy; Customers
   tab shows Refund & Returns and Shipping; Suppliers says "No policies for suppliers yet". Footer →
   Legal → **All policies**. The old link `/mystores/<slug>/earnings/payout-policy?version=1`
   redirects to `/policies/PYO-001?version=1`. After the nginx step (§13), `curl -s <host>/policies/PYO-001 | grep '<title>'`
   shows "Seller Payout Policy · Policies · UnieMax".
5. **Payout link:** on a **test** online order delivered after v1 was published, record a manual
   payout (it moves the test store's balance) → seller Earnings → Payouts shows "Paid under payout
   policy v1". Older payouts show no line (paid before PolicyHub).
6. **Optional scheduled change:** publish v2 (5 PM, summary + reason) for ~5 minutes ahead → sellers
   still see v1 → after the start, the policy page shows v2, "What changed", and **Earlier versions**
   v1 with its 6 PM text; the Test-5 payout still says v1.

Production: after the `v*` tag deploy, repeat step 1 on the prod admin console and check
`https://uniemax.com/api/v1/policies/PYO-001`.

---

## 16. Working notes (gotchas met while building)

- **Migrations:** local `npm run db:migrate` wants to reset the dev DB (history drift). Instead:
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema --script` → review →
  save as a new `prisma/migrations/<timestamp>_<name>/migration.sql` → `npm run db:deploy`. Both
  PolicyHub migrations were made this way. The dev DB is shared by local and the dev server.
- **Windows file names:** `PolicyText.tsx` and a `policyText.ts` can't coexist (case-insensitive
  filesystem) — hence `policyWording.ts`.
- **Circular imports:** payouts imports the policy package, so the policy controller must not import
  from payouts (it reads the admin's email itself). Finance imports the package directly
  (payouts already imports finance).
- **Frontend visual checks without a backend:** a temporary `frontend/zz-preview.html` + `src/zz-preview.tsx`
  (skipped by `check:ui`) rendering the real pages with `adminApi` / `policyApi` / `storeFinanceApi`
  methods replaced by an in-memory fake (`Object.assign`), importing `backend/src/package/policy/rules.ts`
  for real publish problems; headless Chrome over CDP for 390px shots. Delete both files after.
  Starting the local backend would also start its jobs (WhatsApp automations, finance sweeps) against
  the shared dev DB — avoid.
- **`check:ui` budget:** a raw `<button>` counts against `rawButtons` — use the shared `Button`.
- **Shared docs with the user's uncommitted edits:** stage only your own hunks with a normal-context
  patch (`git diff <file>` → drop their hunk → `git apply --cached`). A `-U0` patch can land in the
  wrong place when their edits shift line numbers (it once put the Policies row under the wrong table).
- **Deploy:** push `main` = dev deploy at once; tag `v*` = prod deploy at once (no approval step).

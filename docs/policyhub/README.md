# PolicyHub — platform policies (first policy: Seller Payout, `PYO-001`)

> **Start here** for any policy work. Status: **Phase 1 built** (schema + backend, 28 Nov 2026);
> Phases 2–5 not started — see §12.
> This file replaces the earlier `payout-management-review-plan.md`.
> Seller money rules (fees, ledger, payouts) stay in
> [`docs/seller-finance/README.md`](../seller-finance/README.md). This file only covers
> the **policy text** and how it is linked to payouts.

---

## 0. Pre-implementation checklist

| # | Item | Status | Where |
|---|---|---|---|
| 1 | One policy per project, not one policy shared by all products | ☑ Decided | P1, §6 (`@@unique([project, code])`) |
| 2 | Structured settings and the policy wording stay consistent | ☑ Designed: the wording uses placeholders filled from `settings` | §4, §7 |
| 3 | Project isolation on `PolicyVersion` | ☑ Designed: `project` column + database link on `(id, project)` | §6 |
| 4 | Conflict between deleting a draft and keeping its audit | ☑ Resolved: drafts are never deleted, only reset | §6, §7 |
| 5 | Holiday and weekend rules | ☑ Decided: pay **every day**, holidays too | P10 |
| 6 | Who may publish | ☑ Decided: **ADMIN drafts, SUPER_ADMIN publishes** | P3 |
| 7 | Save `policyVersionId` on payout records | ☑ Decided: **yes, from now** (manual payouts too) | P11, §10 |
| 8 | Final seller-facing wording | ☑ Approved 28 Nov 2026 | §4 |

---

## 1. What it is (in one minute)

A **policy** is a rule we publish for people to read. For example: "When do sellers get paid?"

PolicyHub is a small **notice board**:

- Each notice has a stable **code** (`PYO-001`), and it belongs to one **project** (`uniemax`, `zontechx`, …).
- A notice is changed by pinning a **new version**. A pinned (published) version is **never edited or deleted**.
- Each version has an **effective-from** time. The current version is the newest published one that has already started.
- Every action (create, edit, publish) is written to an **audit trail**.

PolicyHub **does not move money**. Payout code decides payouts. PolicyHub only says what we promise.
Each payout remembers which promise applied to it.

---

## 2. Decisions

| # | Decision |
|---|---|
| P1 | **One policy per project.** UnieMax has its own `PYO-001`. Zontechx would have its own, with its own versions. Within a project, one payout policy covers **all sellers** (no per-store or per-category versions). |
| P2 | **One** payout schedule for everyone in a project. |
| P3 | **`ADMIN` may create and edit drafts. Only `SUPER_ADMIN` may publish.** One person publishes, so there is no second-approval step. |
| P4 | Today payouts are **done by hand, 6 PM – 10 PM IST**. The policy describes that. |
| P5 | Later stages: **provider APIs with order verification**, then **automatic** payouts (§10). Nothing is built for them now. |
| P6 | The tables live in their **own schema `policyhub`** in the same database, like PaymentHub's `paymenthub`. Later they move to a **separate database** shared by many projects. |
| P7 | Every row carries a **`project`** name. The database makes sure a version and its events belong to the same project as their policy. |
| P8 | Timezone for every policy time: **`Asia/Kolkata` (IST)**. |
| P9 | Sellers do **not** have to accept the policy. Showing it is enough. |
| P10 | **Payouts run every day**, Sundays and bank holidays included. There is no holiday list. (UPI / IMPS work on holidays. A manual NEFT may be credited the next bank working day. The wording says the credit time depends on the bank.) |
| P11 | **Every new payout saves `policyVersionId`**, the PolicyHub version in force for it. This starts with manual payouts. |
| P12 | The wording **briefly mentions advance payouts** as UnieMax's own choice. |
| P13 | **Times in the wording come from `settings`**, never typed by hand (§7). |

Not in scope: per-tenant or per-seller policies, multi-step approval, seller acceptance, any
change to payout amounts, the ledger or bank integration.

---

## 3. How payouts work today (facts from the code)

| Step | What happens | Code / table |
|---|---|---|
| 1 | The order is marked **DELIVERED**, and the time is saved. | `orders.deliveredAt` (`orders.service.ts`) · courier time: `order_shipments.deliveredAt` |
| 2 | On the DELIVERED event, or the **15-minute sweep**, the seller's earning goes to their ledger as **PAYABLE** (ready to pay). | `finance/finance.jobs.ts` → `ledger.service.ts › postLegs` |
| 3 | An **admin** opens *Awaiting payout* and pays. The payout is either **MANUAL** (bank transfer, admin types the UTR) or **GATEWAY** (PaymentHub → Cashfree). | `payouts/payouts.service.ts › listAwaitingPayout`, `recordManualPayout`, `triggerGatewayPayout` |
| 4 | Status moves PENDING → PROCESSING → SUCCEEDED (or FAILED / REVERSED / CANCELLED). Every change is logged. | `order_payouts`, `order_payout_events` |
| 5 | The seller gets an email and a WhatsApp message, and sees the payout on **Earnings** and **Transactions**. | `payouts/payouts.notifications.ts` |

Orders with **no payout**: COD orders and OFFLINE bills. The seller already holds that money, and UnieMax only collects its fee.
**Advance payouts** (paid before delivery) are a manual choice for trusted stores. See the seller-finance README §9.

**Key fact:** no code waits for 6 PM. The 6–10 PM window is a **team routine**, not a timer. That is
why the wording says "we start the transfer", not "money reaches your bank".

---

## 4. Policy `PYO-001`: version 1

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

**Wording (v1)**. Status: **approved 28 Nov 2026**. Publish it as typed below (placeholders included).
Words in `{{ }}` are filled from the settings when the policy is shown (§7). On the page, sellers see
"6:00 PM", "10:00 PM" and "IST".

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

---

## 5. Architecture

```
 UnieMax frontend                         UnieMax backend (Fastify)
 ─────────────────                        ─────────────────────────────────────────
 Admin  → Settings → Policies   ──HTTP──▶ /api/v1/admin/policies/**   (requireAdmin; publish = SUPER_ADMIN)
 Seller → Earnings → Payout policy ─────▶ /api/v1/policies/:code      (public, published only)
 Public → /payout-policy (optional) ────▶          │
                                                   ▼
 payouts.service.ts ── versionInForce() ─▶ src/package/policy/   ← the ONLY code that touches policyhub
 (saves policyVersionId on each payout)   (schema · service · controller · routes · rules)
                                                   │ Prisma
                                                   ▼
          PostgreSQL (Supabase) ── schema "public"     (UnieMax tables)
                                ── schema "paymenthub" (PaymentHub)
                                ── schema "policyhub"  ← NEW: policies, policy_versions, policy_events
```

**Later (split-out)**
PolicyHub becomes its own small service with its own database, like PaymentHub. Each project
calls it with an **API key**, and the key decides the `project`. UnieMax swaps
`package/policy/service.ts` for an HTTP client. Routes, screens and `order_payouts.policyVersionId`
stay the same.

### Isolation rules (so the split is a copy, not a rewrite)

1. Every PolicyHub table and enum is `@@schema("policyhub")`.
2. **No foreign keys** between `policyhub` and any other schema, and **no SQL joins** across schemas. `order_payouts.policyVersionId` is a plain string.
3. People are saved as a **plain id + email copy** (`actorId`, `actorEmail`). There is never a link to `admins`.
4. Every query filters by **`project`**. In UnieMax the value comes from config (`POLICY_PROJECT=uniemax`), never from the request.
5. Only `src/package/policy/` may read or write these tables. Other UnieMax code (payouts) calls its exported functions.
6. PolicyHub keeps its **own audit table**. It never uses UnieMax's `admin_audit_logs`.

---

## 6. Data model (3 tables)

Schema `policyhub`. File: `backend/prisma/schema/policy.prisma`. Also add `"policyhub"` to `schemas`
in `core.prisma`'s `datasource`.

```prisma
enum PolicyVersionStatus {
  DRAFT       // editable, never shown publicly
  PUBLISHED   // frozen forever; shown once effectiveFrom has passed
  @@schema("policyhub")
}

/// One policy of one project. Its code never changes.
model Policy {
  id        String   @id @default(cuid())
  /// Which product owns it: "uniemax", "zontechx", ...
  project   String
  /// Stable code shown to readers, e.g. "PYO-001". Unique per project.
  code      String
  name      String
  /// Who it is for: "seller", "customer", "supplier", ...
  audience  String
  versions  PolicyVersion[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([project, code])
  @@unique([id, project])          // target of the project-safe links below
  @@map("policies")
  @@schema("policyhub")
}

/// One version of a policy. DRAFT may change; PUBLISHED never does.
model PolicyVersion {
  id            String              @id @default(cuid())
  /// Same as the policy's project. The link below makes the database refuse a mismatch.
  project       String
  policyId      String
  policy        Policy              @relation(fields: [policyId, project], references: [id, project], onDelete: Restrict)
  /// 1, 2, 3 ... per policy.
  version       Int
  status        PolicyVersionStatus @default(DRAFT)
  /// Full wording (Markdown) with {{placeholders}} filled from settings.
  body          String
  /// One or two lines: what changed vs the previous version (shown to sellers).
  changeSummary String?
  /// Why it changed (internal, admin only).
  changeReason  String?
  /// Machine-readable values, checked per policy code (PYO-001: cutoff, window, timezone).
  settings      Json?
  /// When it starts to apply. Set on publish; never in the past.
  effectiveFrom DateTime?
  publishedAt      DateTime?
  publishedById    String?
  publishedByEmail String?
  createdById      String
  createdByEmail   String
  events        PolicyEvent[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([policyId, version])
  @@unique([id, project])
  @@index([project, policyId, status, effectiveFrom])
  @@map("policy_versions")
  @@schema("policyhub")
}

/// Append-only audit trail. Rows are never edited or deleted.
model PolicyEvent {
  id         String        @id @default(cuid())
  project    String
  versionId  String
  version    PolicyVersion @relation(fields: [versionId, project], references: [id, project], onDelete: Restrict)
  /// CREATED | EDITED | RESET | PUBLISHED
  action     String
  actorId    String
  actorEmail String
  note       String?
  /// Changed fields only, before and after.
  before     Json?
  after      Json?
  createdAt  DateTime @default(now())

  @@index([versionId, createdAt])
  @@index([project, createdAt])
  @@map("policy_events")
  @@schema("policyhub")
}
```

**Project isolation (checklist #3).** `project` sits on every table. The links use the pair
`(id, project)`, so the database itself refuses a version or event whose project differs from
its policy. Every service query also filters by `project`.

**Drafts are never deleted (checklist #4).** A deleted draft would break its own audit events
(`onDelete: Restrict`). So there is **no delete**. Instead:
- Each policy has at most one draft, and it is reused for the next change.
- **"Discard changes"** resets the draft's content to a copy of the latest published version and writes a `RESET` event.
- An unused draft is harmless. It is never shown publicly.

**Why no `project` table?** The name is a short string that config controls. Add a table only when
projects need their own settings (the split-out service will need one for API keys).

**Why no `effectiveTo` or `RETIRED`?** A version ends when the next published one starts.
Working it out from the next version means two versions can never overlap.

### Change to UnieMax's `order_payouts` (checklist #7)

```prisma
model OrderPayout {
  // ...existing fields unchanged...
  /// PolicyHub version (policy_versions.id) of PYO-001 in force for this payout.
  /// Plain string, no FK (other schema, future other DB). Null = before PolicyHub,
  /// or no version was published yet.
  policyVersionId String?
}
```

No index is needed (we never search by it). Old rows stay null. Nothing is backfilled: null means
"paid before PolicyHub".

---

## 7. Rules

| Rule | How it is enforced |
|---|---|
| **Current version** = newest `PUBLISHED` version with `effectiveFrom ≤ now` | `rules.ts › versionInForce(versions, at)`, unit-tested |
| A version's **period** = its `effectiveFrom` until the next published version's `effectiveFrom` | worked out, not stored |
| Published versions are **never edited or deleted** | the service rejects it (409). There is no update/delete path for PUBLISHED. |
| At most **one DRAFT** per policy, never deleted (reset instead) | checked inside the transaction, with the policy row locked (`SELECT … FOR UPDATE`) |
| A new draft **starts as a copy** of the latest published version | the service does it |
| `effectiveFrom` is **now or later**. It must also be **later than** the latest published `effectiveFrom`. | Zod + service check. History can't be rewritten. |
| **Publish** = one transaction: lock the policy → check rules → set status, `effectiveFrom`, `publishedAt`/`By` → write a `PUBLISHED` event | `service.ts › publish()` |
| **Who** | Create, edit or reset a draft: `ADMIN` or `SUPER_ADMIN`. Publish: `SUPER_ADMIN` only. |
| **Settings shape** per code (`PYO-001` → `cutoff`, `windowStart`, `windowEnd` as `HH:mm`; `timezone` an IANA zone; `windowStart < windowEnd`) | Zod schema per code in `rules.ts`. An unknown code must have `settings` empty. |
| **Wording matches settings (checklist #2).** Times in the body are **placeholders**: `{{cutoff}}`, `{{windowStart}}`, `{{windowEnd}}`, `{{tz}}`. The server fills them from the same version's `settings` (`18:00` → "6:00 PM", `Asia/Kolkata` → "IST"). | `rules.ts › renderBody()`. Publishing **fails** if a placeholder the code needs is missing, or an unknown one is used. The public API returns the filled-in body. The admin editor shows a live preview. |
| **Cutoff**: delivered before `cutoff` (IST) → same day. At `cutoff` or later → next day. Every calendar day counts (P10). | `rules.ts › payoutDay(deliveredAt, settings)`, unit-tested at 17:59:59, 18:00:00 and 23:59 IST, plus UTC input |

`payoutDay()` is shown to sellers in stage 1, and it is not used to schedule anything.
The automatic job uses it in §10 stage 3.

---

## 8. API

Built (Phase 1). Code: `backend/src/package/policy/` — `rules.ts` (pure, unit-tested) ·
`schema.ts` (Zod) · `service.ts` (the only DB access) · `controller.ts` · `routes.ts` · `config.ts`.
Mounted in `src/routes.ts`. `project` always comes from `POLICY_PROJECT` (default `uniemax`).
`:code` is case-insensitive (`pyo-001` = `PYO-001`). Every write is logged to `policy_events`.

**Admin** — `/api/v1/admin/policies`, inside the admin subtree (`requireAdmin` + CSRF for cookie clients).
Every admin route answers with the full policy view (below), except the list.

| Method | Path | Role | Body | Does / errors |
|---|---|---|---|---|
| GET | `/` | ADMIN | — | List: `[{ code, name, audience, current, scheduled, draft, versionCount }]` — `current` / `scheduled` = `{ version, effectiveFrom } \| null`, `draft` = `{ version, updatedAt } \| null` |
| GET | `/:code` | ADMIN | — | Full view. `404` unknown code |
| POST | `/` → `201` | SUPER_ADMIN | `{ code, name (2–120), audience }` — code `A-Z 0-9 -`, 2–20; audience lowercase | Policy + empty draft v1. `409` code exists in this project · `403` not super admin |
| POST | `/:code/draft` | ADMIN | — | Start the draft (copy of the latest published version, next number). Returns the existing draft if there is one. |
| PATCH | `/:code/draft` | ADMIN | any of `{ body (≤50 000), changeSummary (≤500), changeReason (≤1000), settings }`; `null` clears | Edit the draft; logs only changed fields. `400` bad settings shape · `409` no draft |
| POST | `/:code/draft/reset` | ADMIN | — | Discard changes: draft = copy of the latest published version (empty if none), summary / reason cleared. `409` no draft |
| POST | `/:code/draft/publish` | SUPER_ADMIN | `{ effectiveFrom? }` (ISO; omitted = now) | Freeze the draft. `400` with every problem joined: empty wording, missing / unknown placeholder, settings missing or invalid, v2+ without changeSummary or changeReason, start in the past (2-min grace) or not after the previous version's start · `409` no draft · `403` not super admin |

**Full policy view** (admin): `{ code, name, audience, hasSettings, current, versions[], events[] }`.
Each version: `id, version, status, state (DRAFT | SCHEDULED | CURRENT | PAST), body, renderedBody,
problems[]` (draft only — what blocks publishing, for the editor), `changeSummary, changeReason, settings,
effectiveFrom, effectiveTo, publishedAt, publishedByEmail, createdByEmail, createdAt, updatedAt`.
Each event (newest first, up to 200): `id, version, action, actorEmail, note, before, after, createdAt`.

**Public** — `/api/v1/policies`, no login. Only published versions that have started; body filled in;
**no** ids, emails, `changeReason` or events.

| Method | Path | Returns |
|---|---|---|
| GET | `/:code` | Current: `{ code, name, audience, version, effectiveFrom, effectiveTo (null), body, changeSummary, settings }`. `404` unknown code or nothing published yet |
| GET | `/:code/versions` | `{ code, name, versions: [{ version, effectiveFrom, effectiveTo, changeSummary }] }`, newest first. A scheduled version is hidden and doesn't end the current one. |
| GET | `/:code/versions?version=N` | That version in full (same shape as `/:code`). `404` unknown / not started |

**Payout responses.** Admin and seller payout responses gain `policyVersion: { version, effectiveFrom } | null`,
so the payout screen can say "Paid under Payout Policy v1".

---

## 9. Screens

| Who | Where | What |
|---|---|---|
| Admin | **Settings → Policies** (new) | A list of policies. Open one to see its versions and history. Edit the draft with a text editor, the settings fields (cutoff, window) and a live preview. **Publish** (now or at a date) appears for `SUPER_ADMIN` only. `ADMIN` sees "Ask a super admin to publish". |
| Seller | **Earnings → "Payout policy"** link (new page) | Current version: name, code, version, "in force since", the wording, cutoff and window as a small card. Below it, a list of older versions with their periods and change summaries. |
| Seller / Admin | Payout detail (existing) | One small line: "Payout policy v1". It links to that version. |
| Public | `/payout-policy` (optional) | The same view as the seller page, next to the `refund-policy` and `shipping-policy` pages. |

Follow `docs/DESIGN_GUIDELINES.md`. Buttons come from `shared/ui/Button.tsx`.

---

## 10. Payouts roadmap and traceability

**Which version a payout gets** (`policy.versionInForce('PYO-001', at)`):

| Payout | `at` = | Why |
|---|---|---|
| Normal (order delivered) | `orders.deliveredAt` | The promise was made when the order was delivered (the cutoff). A newer version published before we paid must not change that promise. |
| Advance (not delivered yet) | payout creation time | There is no delivery yet |

**Safety rule:** the lookup must **never block or fail a payout**. If PolicyHub has no version,
or the lookup throws, the payout is saved with `policyVersionId = null` and a warning is logged.
The lookup runs **before** the payout transaction, so it adds no lock and no cross-schema query
inside the money transaction.

| Stage | Payout behaviour | Policy link |
|---|---|---|
| **1 — now** | Admin pays by hand, 6–10 PM IST | `policyVersionId` is saved by `recordManualPayout` and `triggerGatewayPayout`. Nothing else in payout code changes. |
| **2 — provider APIs** | Transfers through provider APIs, after the order is verified (delivered, paid, not disputed, bank account verified) | Same as stage 1. The verification result goes on the payout or its events, not in PolicyHub. |
| **3 — automatic** | A job reads the current `PYO-001` settings and pays the orders whose `payoutDay()` is today, in the window | Same column. Idempotency (no double payment) stays in payout code: there is one active payout per order, plus `idempotencyKey`. |

Rule for every stage: **the policy never starts a transfer.** Payout code checks its own money rules.

---

## 11. Security and audit

- Drafts: `ADMIN` / `SUPER_ADMIN`. Publish: `SUPER_ADMIN` only. Every action writes a `PolicyEvent` with actor, time, before/after and a note.
- Public endpoints never return drafts, versions that haven't started yet, emails, ids or audit data.
- Policy rows never hold bank or payment data.
- All input is checked by Zod on the server. Publishing is one transaction with a row lock.

---

## 12. Build phases

| Phase | Changes | Tests | Done when |
|---|---|---|---|
| **1. Schema + backend** ☑ 28 Nov 2026 | `prisma/schema/policy.prisma`, `core.prisma` (`schemas` list), migration `20261128100000_policyhub` (applied on dev), `src/package/policy/*`, `src/routes.ts`, `POLICY_PROJECT` in `config/env.ts` | `test/unit/policy.test.ts` (13 tests: cutoff 17:59:59 / 18:00 / 23:59 IST + UTC input + month/year end, version in force, history periods, start-time checks, settings shape, placeholders) · `scripts/policy-check.ts` (19 checks on the real DB, see backend/README) · HTTP guards checked: anonymous → 401, ADMIN create / publish → 403, ADMIN draft edit → 200, SUPER_ADMIN publish → 200 | ☑ All pass; the full unit suite (297) still passes. |
| **2. Link payouts** | `order_payouts.policyVersionId` migration · `payouts.service.ts` (`recordManualPayout`, `triggerGatewayPayout`) · payout response shape | Payout saves the version in force at `deliveredAt`. Advance → creation time. No version → null and the payout still succeeds. PolicyHub error → null and the payout still succeeds. **Every existing payout and finance test passes unchanged.** | New payouts carry the version. Amounts, ledger and hub calls are unchanged. |
| **3. Admin screen** | Settings → Policies page + endpoints file | Manual check on desktop and phone width, as ADMIN and as SUPER_ADMIN | An ADMIN drafts `PYO-001` v1 and a SUPER_ADMIN publishes it. The public endpoint shows it only from `effectiveFrom`. |
| **4. Seller screen** | Earnings link + Payout policy page + "Payout policy vN" line on payouts (+ optional public page) | Manual check | A seller sees the current version, its history and the version on each new payout. No admin fields appear in the response. |
| **5. Go live** | Publish `PYO-001` v1 through the admin screen on dev, then prod (no hard-coded seed) | — | The live wording is the signed-off §4 text. |
| Docs, each phase | This file, `docs/API.md`, `docs/BACKEND_CONTEXT.md` (data model), `docs/seller-finance/README.md` (payout column), `docs/FRONTEND_CONTEXT.md`, `backend/README.md` (env) | — | Docs match the code |

Note for the migration: local `npm run db:migrate` asks to reset the dev DB. Hand-write the SQL
(`CREATE SCHEMA IF NOT EXISTS policyhub; …`), then run `migrate deploy`.

No phase changes payout amounts, fees, the ledger, PaymentHub or bank code.

---

## 13. Open questions

1. Cutoff clock: the plan uses **`orders.deliveredAt`** (when the status is set to DELIVERED), not the courier's `order_shipments.deliveredAt`. Confirm before Phase 2.
2. Should sellers be **told** when a new version is published (WhatsApp / email / push)? Not in the plan yet.

---

## 14. What changed from the original plan (and why)

| Original idea | Now | Why |
|---|---|---|
| Statuses draft / active / retired | DRAFT / PUBLISHED | "Retired" is worked out from the next version |
| Versions 1.0 / 1.1 / 2.0 | 1, 2, 3 | No need to argue about minor vs major |
| `effectiveTo` column + overlap checks | Worked out from the next version | Overlap becomes impossible |
| A separate operational-config table | `settings` JSON on the version + placeholders in the wording | One place, so the text and the numbers can't drift apart |
| Deleting drafts | Reset, never delete | Keeps the audit trail whole |
| "Seller App → Wallet" | Earnings → Payout policy | UnieMax has no Wallet |
| Tables inside UnieMax's `public` | Own schema `policyhub` + `project` on every table | One policy per project; moves to its own DB later |

# UnieMax — Project Instructions

White-label e-commerce platform. Backend: Fastify + Prisma 7 + PostgreSQL (Supabase).
Frontend: React + Tailwind.

## Documentation Maintenance (IMPORTANT)

**Every code change must keep the docs in sync.** After making a change, update the
respective `.md` file in the same task — do not leave it for later. One fact lives in
one file (no duplication).

| If you change…                                   | Update this doc                     |
| ------------------------------------------------ | ----------------------------------- |
| An API endpoint (add/remove/params/response)     | [`docs/API.md`](./docs/API.md)      |
| Architecture, module pattern, conventions, stack | [`docs/BACKEND_CONTEXT.md`](./docs/BACKEND_CONTEXT.md) |
| Backend setup, scripts, or env vars              | [`backend/README.md`](./backend/README.md) |
| Env switching commands (dev ↔ production)        | [`backend/ENV.md`](./backend/ENV.md) |
| Product scope / features / requirements          | [`docs/CONTEXT.md`](./docs/CONTEXT.md) |
| High-level project overview or features list     | [`README.md`](./README.md)          |
| Prisma schema models/enums                       | [`docs/BACKEND_CONTEXT.md`](./docs/BACKEND_CONTEXT.md) (Data Model section) |
| Frontend structure, shared UI, theme tokens, per-store theming | [`docs/FRONTEND_CONTEXT.md`](./docs/FRONTEND_CONTEXT.md) |
| Affiliate system (programmes, invitations, links, attribution, commission, payouts) | [`docs/AFFILIATE.md`](./docs/AFFILIATE.md) |
| UI/UX rules (spacing, type, colour, components, states) | [`docs/DESIGN_GUIDELINES.md`](./docs/DESIGN_GUIDELINES.md) — **read before any UI work; it wins over older plans** |
| Design-system clean-up phases and status | [`docs/DESIGN_SYSTEM_PLAN.md`](./docs/DESIGN_SYSTEM_PLAN.md) |
| Anything SEO — head tags, structured data, `robots.txt`, sitemaps, page shells, indexing rules, `/c/` landing pages' SEO, the SEO roadmap | [`docs/SEO.md`](./docs/SEO.md) (rules tables, status, roadmap **and** change log) |

Rules:
- If a change spans several concerns, update **each** relevant doc.
- Never add new `.md` files for things the set above already covers.
- Keep doc edits minimal and factual — reflect what the code does now, nothing aspirational.
- When a planned feature lands, move it out of the "planned"/"not yet" notes in `API.md`
  and `BACKEND_CONTEXT.md`.

## Backend Conventions (summary — full detail in BACKEND_CONTEXT.md)

- **Module pattern:** each feature = `schema.ts` · `service.ts` · `controller.ts` ·
  `routes.ts` under `src/modules/<name>/`, registered in `src/routes.ts`.
- **Validation:** parse request input with Zod inside controllers; services never see
  unvalidated data.
- **Errors:** throw `HttpError.*` from services; the central handler maps Zod/Prisma/
  HttpError to the standard JSON envelope.
- **Responses:** always `ok()` / `list()` from `utils/response.ts`.
- **Public vs admin:** public queries force active-only; `/api/v1/admin/**` is a
  separate subtree guarded by `requireAdmin`.
- **Auth:** Bearer JWT with two token kinds (admin = email/password; customer = OTP to
  **email or phone**, each unique to one account, with post-login linking of the second
  identifier). Guards in `middleware/auth.ts` (`requireAdmin` / `requireCustomer`);
  wrong-kind token → 403, missing/invalid → 401. New protected routes must use the right
  guard.
- **Env files are layered, never edited to switch environments.** `config/loadEnv.ts`
  loads `.env.<mode>` then `.env`, where `mode = APP_ENV ?? NODE_ENV ?? "development"`.
  Locally that means dev; pm2 sets `APP_ENV=production` on the server. One-off local
  run against prod: `$env:APP_ENV="production"; npm run dev`. A key lives in either
  `.env` or a per-mode file, never both. New entrypoints must `import "./config/loadEnv.js"`
  **first**.
- After editing `prisma/schema.prisma`: run `npm run db:migrate` (creates + applies a
  migration locally) and **commit `prisma/migrations/`** — that committed folder is how
  the change reaches production, which runs `npm run db:deploy`. Never `prisma db push`:
  it mutates the local DB without producing a migration, so production never learns of it.

## Frontend Conventions (summary — full detail in FRONTEND_CONTEXT.md)

- **Follow `docs/DESIGN_GUIDELINES.md`** for every UI change, and check it with
  `npm run check:ui` (frontend) — the budget may only go down.
- **Never hand-size a button.** Every button comes from `shared/ui/Button.tsx` —
  `<Button variant size>` for `<button>`, `buttonClass({…})` for a `<Link>`. Height,
  radius, padding and weight live there; a call site picks only variant + size
  (`sm` 36px / `md` 44px / `lg` 48px) and may add layout classes (`flex-1`, margins).
- **Pick the variant by importance:** `primary` = the main action (one per
  screen) · `secondary` = supporting (Add to Cart beside Buy Now) · `ghost` = low
  priority · `danger` = destructive. All flat — no gradients or glows; the primary
  fill is `--cta`, re-pointed to the **store owner's** colour by `storeVars()`.
- **Type and shape come from the scale:** text `caption 13 · label 14 · body 16 ·
  subtitle 18 · section 22 · title 28 · display 40` (Tailwind's names map onto it),
  never `text-[Npx]`; corners 8 / 12 / 16 / full. Interface font is Plus Jakarta Sans;
  Fraunces (`font-display`, `font-accent`) only for storefront shop/product names;
  prices use `font-figure`.
- **Never a bare `<img>` for a stored image.** Product photos, logos and banners are drawn
  with `shared/media/MediaImg.tsx` — `<MediaImg src sizes>`, where `sizes` says how wide
  it is drawn (`"48px"`, `"(min-width: 1024px) 25vw, 50vw"`). It offers the server's
  sized copies so phones never download the 1920 px original. Bare `<img>` only for
  local `blob:` previews and static assets.

## SEO Conventions (summary — full detail in docs/SEO.md)

- **`docs/SEO.md` is the single source of truth for SEO.** Read it before touching
  SEO-related code; update it in the same task after any change (rules tables, status,
  roadmap, change log). Its §12 lists which files count as SEO-related.
- **Every head rule exists twice.** A page's `useSeo` call (browser) has a server twin in
  `backend/src/modules/seo/pageShell.service.ts` (page shells for `/store/**`, `/c/**`);
  `backend/src/modules/seo/structuredData.ts` and `productText.ts` are ports of the
  frontend's `structuredData.ts` and `productDescription.ts`. Change both sides together.
- **Keep the `<!-- seo:start -->` / `<!-- seo:end -->` markers** in `frontend/index.html`
  and each tag's attribute order — the backend replaces that region per request.
- **Structured data never invents a fact** (no ratings until real reviews exist) and omits
  empty fields rather than emitting blanks.
- Search/filter/paginated views are `noindex, follow` with a canonical to the bare page;
  per-customer pages are `noindex` **and** disallowed in `robots.txt`.

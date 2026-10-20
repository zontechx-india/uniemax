# Phase 2: Suppliers, invite and join ◐

> Built 20 Oct 2026 (migration `20261020180000_dropship_suppliers`). Left:
> the API test run (`test/dropship-suppliers.test.mjs`, needs the `QA_*`
> accounts) and the dev check with `DROPSHIP_ENABLED=true` on the dev server.

## Goal

A seller invites their supplier with a link (WhatsApp, email or copy). The
supplier joins, using a new supply-only store or an existing one, and offers
products with prices for sellers. The seller sets the link's terms: COD, and who
pays the returned-parcel fee. Every term change is logged and shown to both
sides.

## Read

- [suppliers/context.md](../suppliers/context.md): all of it
- [terms/context.md](../terms/context.md): the terms, changing a term, T-7, T-11
- [architecture/context.md](../architecture/context.md): package layout,
  rules, host, config
- [data-model/suppliers/context.md](../data-model/suppliers/context.md)
- [admin/context.md](../admin/context.md): the Suppliers screen
- [glossary.md](../glossary.md)

## Before you start

Phase 1 done. D-3, D-5, D-7, D-17, D-18 and D-19 are decided. Check how a store is created
today (`CreateStorePage.tsx`, `stores.service.ts`), so `createSupplyStore` uses
the same rules.

## Build: backend

- ☑ The package skeleton: `index.ts`, `deps.ts`, `config.ts`, `types.ts`,
  `hosts/inProcess.ts`. Registered in `app.ts` only when `DROPSHIP_ENABLED=true`.
- ☑ `dropship.prisma`, Phase 2 models (+ migration).
- ☑ Invites: create (stores only the token's hash), resend, revoke, public
  preview, accept (with an existing store or a new supply-only store), and
  expiry. The invite email goes through the host's `sendMail`.
- ☑ Links: change COD and who pays the returned-parcel fee. Each change is
  logged in `TermsChange`, and the supplier is told it applies to orders placed
  from now on. Pause and end from **either side** (D-19).
- ☑ Supplier profile: shipping fee, ship within, returns. Each change is logged,
  and its sellers are told.
- ☑ Supply: offer or withdraw, prices for sellers, bulk "shop price − N %";
  only the store's own products (the "is a copy" check comes with Phase 3,
  D-31). Price changes are logged.
- ☑ The terms endpoints for both sides: current terms + change log.
- ☑ The `requireSupplier` guard and admin Suppliers (list, suspend, restore)
  at `/api/v1/admin/dropship` (D-29).
- ☑ A pointer section in `API.md` ("Dropshipping — `/api/v1/dropship`: see
  `docs/dropshipping/`"), and `DROPSHIP_ENABLED` in `backend/README.md`.

## Build: frontend

- ☑ The `frontend/src/packages/dropship` skeleton, the same shape as `packages/affiliate`.
- ☑ Seller **Suppliers** page:
  - the invite sheet (the COD and returned-parcel-fee questions, with no
    answer pre-selected, and the store's COD switch in place);
  - Share on WhatsApp and Copy link;
  - invited and active lists with resend and revoke, and each supplier's
    **Terms** panel (edit the two terms, see the change log), pause and end.
- ☑ The join page for invite links: sign in, then the join sheet (existing
  store or short form; fee, ship within, returns).
- ☑ The supplier's **Products for sellers** (+ bulk), its settings, and its
  **Sellers** page (each link's terms and change log, pause / end).
- ☑ Admin **Suppliers**.

## Tests

SU-1…SU-18 (SU-18 only checks that nothing is blocked), T-7 and T-11 (the
change log). Access scoping on every route. The token works once and expires.
Both term answers are required.

### Verified (20 Oct 2026)

- `npm run typecheck` and `npm run test:unit` (79 pass; `test/unit/dropship-domain.test.ts`
  covers tokens, expiry, bulk pricing, link moves, term diffs, wording, SU-14
  phone matching and the request rules).
- An `app.inject` run on the dev database with throwaway accounts (deleted
  after): 30 checks — SU-1, 2, 3, 9, 10, 11 (own products), 12, 13 (parallel
  double accept → one store), 14, 15, 16, D-19 both sides, ENDED final, D-27
  resend, expiry, T-7 / T-11 log on both sides, admin suspend / restore, and
  customers refused on admin routes.
- Frontend: `tsc -b`, `vite build`, `check:ui` (no budget rises); the
  screens checked at 390 px with mocked data (no overflow, no console errors).
- **Not run yet:** `npm run test:api` (`test/dropship-suppliers.test.mjs`) —
  the `QA_*` accounts aren't set up on this machine.

## Done when

On dev, with the flag on, a seller invites a supplier over WhatsApp. The
supplier joins, with a new store or an existing one, and offers products with
prices. The seller sees the supplier, can change COD, and can pause or end it.

## Docs to update

- `API.md` (pointer section) and `backend/README.md` (env var), core.
- Here: flip markers in [suppliers](../suppliers/context.md),
  [data-model](../data-model/context.md), [admin](../admin/context.md),
  [architecture](../architecture/context.md), [phases](context.md) and the
  README status. Replace any planned detail that changed during the build with
  what the code does.

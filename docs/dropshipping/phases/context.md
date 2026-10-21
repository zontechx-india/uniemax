# Phases

> **Read when:** planning, starting or continuing a phase. **Update when:** a
> phase starts (◐) or finishes (☑): change the row here, the README status,
> and the phase file.

| Phase | Goal | Ships to | Needs first | Status |
| --- | --- | --- | --- | --- |
| [0](phase-0-shipments.md) | Parcel tracking for every order (core) | **production on its own** | — | ◐ built — API tests pass on dev; dev walkthrough pending |
| [1](phase-1-core-seams.md) | Core seams for packages (no visible change) | dev → production with the next release | 0 | ☑ built, API tests pass on dev |
| [2](phase-2-suppliers.md) | Suppliers: invite and join; link terms | dev (`DROPSHIP_ENABLED`) | 1 | ◐ built — API tests pass on dev (flag on); dev walkthrough pending |
| [3](phase-3-supplier-products.md) | Supplier products in the seller's store | dev (flag) | 2 | ◐ built — API tests pass on dev (flag on); dev walkthrough pending |
| [4](phase-4-orders.md) | Orders and shipping, prepaid and COD, terms snapshot | dev (flag) | 3 | ◐ built — API tests pass on dev; dev walkthrough pending |
| [5](phase-5-money-and-jobs.md) | Statement (direct settlement), reminders, self-healing. **MVP complete** | **production, flag on** | 4 | ◐ built — API tests pass on dev; dev walkthrough pending; **Release** steps are the owner's |
| [6](phase-6-split-payouts.md) | Easy Split pays suppliers for prepaid orders | production (`DROPSHIP_SPLIT`) | 5 + payments track (Easy Split live) | ☐ |
| [7](phase-7-later.md) | Later | — | MVP feedback | — |

## Release plan

- Every phase merges to `main`, which deploys to dev (`docs/DEPLOYMENT.md`).
- **Phase 0** is a normal seller feature: tracking for every parcel. Once
  tested on dev it can go to production straight away. It is the first thing
  the client can use.
- **Phases 2–5** stay behind `DROPSHIP_ENABLED`, which is off in production
  (D-15). After Phase 5, switch it on in production and onboard the first
  seller and their supplier together. Money settles directly, using the
  statement.
- **Phase 6** starts when Cashfree has enabled Easy Split and PaymentHub
  supports it. Orders placed before it stay direct; orders after are split
  (T-9).

## How Claude Code runs a phase

1. **Read** [README](../README.md) → this file → the phase file → only the
   files the phase file lists under "Read". Nothing else unless a task needs it.
2. **Plan first** (plan mode). List the files to change, migrations and tests.
   Stop and ask if a decision the phase needs is still open in
   [decisions](../decisions.md).
3. **Build in small steps**, following the root `CLAUDE.md` conventions:
   - module pattern, Zod in controllers, `HttpError`, `ok()` / `list()`;
   - after editing a schema, `npm run db:migrate`, and commit `prisma/migrations/`;
   - the UI uses `Button`, `MediaImg` and the type scale, and follows
     `docs/DESIGN_GUIDELINES.md`.
4. **Verify:**
   - backend: `npm run typecheck`, `npm run test:unit`, and `npm run test:api`
     (needs a running dev server and the `QA_*` env vars in `test/helpers.mjs`);
   - frontend: `npm run build` (`tsc -b && vite build`) and `npm run check:ui`
     (its budget may only go down). Do not rely on `eslint`; it crashes in
     this repo.
5. **Update the knowledge base** in the same task: tick tasks in the phase
   file, flip the ☐/◐/☑ markers in every file touched, log new decisions, and
   write core changes to the main docs (README rule 4).
6. **Commit only your own files**, then push `main` to deploy to dev.

## Phase file layout

Every phase file has: **Goal · Read · Before you start · Build (backend /
frontend) · Tests · Done when · Docs to update**. Each Build line is a ☐ task;
tick it when it is built and verified.

# Dropshipping — knowledge base

> **Single source of truth for the dropshipping feature**: what is decided,
> what is planned and what is built. Start here, then read **only** the files
> the reading map lists for your task.

**What it is.** A seller brings their own suppliers onto UnieMax. A supplier
offers products at a *price for sellers*. The seller adds them to their store
at their own price and markets them through their own channels. When a
customer orders, the supplier ships straight to the customer, and the customer
gets the courier's tracking number the moment the parcel ships. The seller
earns the difference.

## Status

| Phase | What | Status |
| --- | --- | --- |
| 0 | Parcel tracking for every order (core) | ◐ built 20 Oct 2026 — API tests pass on dev; dev walkthrough pending |
| 1 | Core seams for packages | ☑ built 20 Oct 2026, API tests pass on dev |
| 2 | Suppliers: invite and join | ◐ built 20 Oct 2026 — API tests pass on dev (flag on); dev walkthrough pending |
| 3 | Supplier products in the seller's store | ◐ built 20 Oct 2026 — API tests pass on dev (flag on); dev walkthrough pending |
| 4 | Orders and shipping | ◐ built 21 Oct 2026 — API tests pass on dev; dev walkthrough pending |
| 5 | Money statement and background jobs. **MVP complete** | ◐ built 21 Oct 2026 — API tests pass on dev; dev walkthrough pending; production release steps are the owner's |
| 6 | Easy Split pays suppliers for prepaid orders | ◐ built 21 Oct 2026 in **sandbox mode** (no money moves) — API tests pending; the real PaymentHub integration is the owner's |
| 7 | Later | — |

Details and release plan: [phases/context.md](phases/context.md).

## Reading map

| Task | Read |
| --- | --- |
| Any dropshipping work | this file, then the phase file |
| Starting or continuing a phase | [phases/context.md](phases/context.md) + `phases/phase-N-*.md` |
| Why something is the way it is; open questions | [decisions.md](decisions.md) |
| Words for screens, emails and messages | [glossary.md](glossary.md) |
| Package layout, host, hooks, events, config, jobs | [architecture/context.md](architecture/context.md) |
| Tables and fields | [data-model/context.md](data-model/context.md) |
| Tracking numbers, proof of delivery, parcels (core) | [shipments/context.md](shipments/context.md) |
| Inviting suppliers, joining, COD setting, offering products | [suppliers/context.md](suppliers/context.md) |
| Catalogue, adding products, pricing, sync | [supplier-products/context.md](supplier-products/context.md) |
| Checkout rules, supplier orders, shipping, cancellations | [orders/context.md](orders/context.md) |
| Terms (fees, COD, returned-parcel fee) and what an order keeps from booking | [terms/context.md](terms/context.md) |
| Who owes whom, statement, recording payments, Easy Split payouts | [money/context.md](money/context.md) |
| Admin screens | [admin/context.md](admin/context.md) |

## Rules for this knowledge base

1. **One fact, one file.** Link instead of repeating.
2. **Update in the same task.** A change to dropshipping code updates the file
   that describes it before the task ends: tick the phase task, flip the status
   marker, correct the facts.
3. **Status markers** on every section and task: ☐ planned · ◐ in progress ·
   ☑ built. A ☑ section describes what the code does **now**; a ☐ section is
   the plan.
4. **Package facts live here; core facts live in the main docs.** Everything
   inside `backend/src/package/dropship` and `frontend/src/packages/dropship`
   (endpoints, schema, rules, screens) is documented only here. `docs/API.md`
   holds just a pointer section. A change to core code (`modules/**`,
   `prisma/schema/core.prisma`, shared frontend) is also written to the main
   doc the root `CLAUDE.md` names for it, and the file here links to it.
5. **Keep files small.** When a file passes ~300 lines, split it into a
   sub-folder with its own `context.md`.
6. **Verify before stating.** A fact about existing code names the file it
   comes from. Re-check it when you touch that code.
7. **Log decisions** in [decisions.md](decisions.md) with the date and the
   reason. Open questions stay there until answered.

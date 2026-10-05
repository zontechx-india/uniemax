# Design System Clean-up — Plan

Brings the whole frontend in line with
[`DESIGN_GUIDELINES.md`](./DESIGN_GUIDELINES.md). **UI/UX only — no
functionality changes.** Each phase is checked at 360 / 768 / 1280 px in light
and dark, then shipped to dev and production before the next starts. Token
and component facts live in [`FRONTEND_CONTEXT.md`](./FRONTEND_CONTEXT.md);
this file tracks the work.

Status: ☐ planned · ◐ in progress · ☑ done

## Decisions (October 2026, product owner)
1. **Glassmorphism is removed** (§6, §10) — flat surfaces, borders over shadows.
2. **The storefront hero banner (A4 dots + arcs) stays** — the one decorative
   element, for shop identity. No other gradients.
3. **Fonts:** Plus Jakarta Sans for all app interface; Fraunces only for
   storefront shop/product names (`font-display`) and the italic accent;
   prices and counts in `font-figure`.
4. The guidelines live in `docs/` and are linked from `CLAUDE.md`.

## Audit at the start (counted by `npm run check:ui`)
| Pattern | Count | Guideline |
| ------- | ----- | --------- |
| Stray `text-[Npx]` sizes (20 distinct) | 345 | §4 |
| …of which under 13px | 123 | §4, §17 |
| Gradients | 36 | §6 |
| Glass utilities / canvas | 160 | §6, §10 |
| Ad-hoc shadows, metal effects, blur | 35 | §10 |
| Hand-made `<button>` | 295 | §7, §9 |

Also: 9 separate dialog implementations, 3 card styles, 13 corner radii,
8 screens with a bare "Loading…".

## Phase 0 — Design system ☑
- Type scale: 7 sizes (caption 13 … display 40), Tailwind names remapped onto
  it; 4 weights (`font-extrabold`/`black` removed).
- Corners 8 / 12 / 16 / full; two shadows (floating, lifted).
- Buttons rebuilt as flat **primary / secondary / ghost / danger** with all
  states; every `rise`/`sheen`/`ring` call site migrated; storefront `SKIN`
  `cta` / `ctaSecondary`.
- Interface font = Plus Jakarta Sans; Fraunces moved to `font-display` on
  storefront names; gradient `metal-text` brand names removed.
- `npm run check:ui` + `frontend/scripts/ui-budget.json`, run in CI.
- Guidelines moved to `docs/`, linked from `CLAUDE.md`.
- (Carried over from the font work: self-hosted fonts, 16px root, ₹ verified,
  `font-figure` for prices.)

## Phase 1 — Shared components ☐
- Inputs / select / textarea / labels / helper / error on the scale
  (`shared/ui/form.tsx`), all states.
- One `Card`; one `Badge` (merge StatusPill, chips, admin badges); `Alert`;
  `Toast`; `Tabs`.
- ONE dialog/sheet base replacing the 9 implementations.
- Shared empty, skeleton and error states; remove bare "Loading…".

## Phase 2 — My Shops (sellers) ☐
- Remove glass (`glass*`, `seller-canvas`, tinted hero) → flat surfaces.
- One card style, no nested cards, one page-header pattern.
- Replace hand-made buttons with `Button`; forms per §8 / §16.

## Phase 3 — Storefront (customers) ☐
- Product card, product page, hero, category page, cart, checkout on the
  scale; remove `metal-lift` / `metal-chip`; keep only the A4 banner.

## Phase 4 — Marketplace, Sell page, auth, account ☐

## Phase 5 — Admin ☐
- Tables (column hierarchy, phone layout, row actions), forms, stat tiles.

## Phase 6 — Quality pass ☐
- §18 checklist on every page; delete dead CSS; budget for gradients, glass,
  ad-hoc effects and tiny text at 0.

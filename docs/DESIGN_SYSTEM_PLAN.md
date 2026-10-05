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

## Phase 1 — Shared components ☑
- `shared/ui/field.ts`: one style for every input / select / textarea
  (48px/16px, dense 44px/14px), label at full ink, hint/error lines; used by
  `TextField`, `Select`, admin inputs and the photo/filter fields.
- `Card`, `Badge` (seller `StatusPill` and admin `Chip` wrap it), `Alert`
  (the old Error/Info/Success notes), shared `Toast`.
- **`ModalShell`** — one modal base; `Dialog`, `ConfirmDialog`, the photo
  editor, describe and review sheets, storefront filters and menu drawer,
  admin menu drawer and the login dialog all use it (9 → 1). Overlays are
  flat (no blur) and trap focus; all close on Escape except the photo editor
  and the photo review sheet, which only close by their own buttons so a
  stray key never discards work.
- `Skeleton` / `PageSkeleton` / `EmptyState` / `ErrorState` shared; the
  bare "Loading…" screens replaced (route fallbacks, designer, affiliate
  pages, category picker, notification bells).
- The admin console's duplicate kit now delegates to `shared/ui`.
- Budget after Phase 1: stray sizes 331, tiny text 119, gradients 33,
  glass 154, ad-hoc effects 33, hand-made buttons 272.
- Not changed: underline tab rows stay page-local until their pages are
  reworked in Phases 2–5 (`SegmentedTabs` is the shared segmented control).

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

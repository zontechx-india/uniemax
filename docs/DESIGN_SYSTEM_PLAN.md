# Design System Clean-up — Plan

Brings the whole frontend in line with
[`DESIGN_GUIDELINES.md`](./DESIGN_GUIDELINES.md). **UI/UX only — no
functionality changes.** Each phase is checked at 360 / 768 / 1280 px in light
and dark, then shipped to dev and production before the next starts. Token
and component facts live in [`FRONTEND_CONTEXT.md`](./FRONTEND_CONTEXT.md);
this file tracks the work.

Status: ☐ planned · ◐ in progress · ☑ done

## Decisions (October 2026, product owner)
1. ~~Glassmorphism is removed~~ — **reversed by the product owner (October
   2026): the My Shops glass and blur STAY** as a deliberate part of the seller
   workspace's identity (§6 allows effects that "fit the product identity").
   The `glass` budget in `check:ui` is therefore frozen, not driven to 0: the
   existing glass may stay, new glass outside My Shops may not be added.
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

## Phase 2 — My Shops (sellers) ☑ (glass kept)
- All 222 stray text sizes in `pages/stores` and `features/stores` moved onto
  the scale (9–13px → caption 13, 14 → label, 15–17 → body 16, 18 → subtitle,
  22–24 → section, 26 → title); nothing under 13px remains there.
- Hand-made buttons that copied the standard looks moved to `Button`:
  secondary (Replace video, Use camera, Add location, Cancel, Undo, Take
  offline, Earlier/Later), ghost (Back, Finish later, Skip, wizard steps),
  danger (Retry upload). The remaining raw buttons are deliberate patterns
  — dashed "add" tiles, brand text links, "Remove" text buttons, list rows,
  chips and icon buttons.
- Checked: 18 seller pages at 360px — no sideways scroll, no input under
  16px.
- Budget after Phase 2: stray sizes 109, tiny text 74, raw buttons 257.

## Phase 3 — Storefront (customers) ☑
- All 41 stray text sizes in the shop pages, product card/page, listings,
  cart, checkout, banners and login moved onto the scale.
- "Metal" effects removed: `metal-lift` → flat `card-hover` (border darkens +
  one hover shadow, no lift or coloured halo); the login dialog's store mark
  is a flat brand tile; `--brand-metal` / `--metal-glow` tokens deleted. The
  A4 hero banner is the one decorative element left.
- Sticky buy bar (product page) and checkout header: solid, no blur.
- Hand-made buttons copying standard looks moved to `Button`: Filter, Load
  more, Check (delivery), Sign in, New request / help actions, Share link,
  Add a new address. Remaining raw buttons are icon buttons, steppers,
  swatches, option chips, list rows and text links.
- Delivery-check field uses `fieldClass`; product breadcrumb shows the
  display name.
- Checked: shop home, product page, shop listing and cart at 390px (no
  sideways scroll) and the shop home at 1280px.
- Budget after Phase 3: stray sizes 68, tiny text 46, ad-hoc effects 23,
  raw buttons 248.

## Phase 4 — Marketplace, Sell page, auth, account ☑
- 33 stray text sizes moved onto the scale (marketplace home, category
  browse, profile, orders, addresses, support, Sell page forms, header
  notifications, chip input, wizard, category picker).
- Flat instead of gradient/blur: marketplace header (no blur), Sign in,
  promo panel, image placeholder, avatars, Sell-page step numbers.
- Kept on purpose: the dark fade over the login hero photo (text
  legibility), the Sell page's floating phone/notification mock-ups and their
  shadows (marketing illustrations, incl. their miniature text), the
  `Wizard` progress gradient (My Shops glass identity).
- Marketplace section errors use the shared `ErrorState`; Retry, Add new
  address and profile actions use `Button`.
- Budget after Phase 4: stray sizes 35, tiny text 29, gradients 28, ad-hoc
  effects 21.

## Phase 5 — Admin ☑
- Fixed: `DataTable` passed the old `hint` prop to the shared `EmptyState`,
  so empty-table hints had been dropped since Phase 1 — now `description`.
- `DataTable` phone cards are keyboard-operable like the desktop rows
  (focusable, Enter opens); card labels 13px sentence case.
- Header solid (no blur); nav captions, badges, banner overlays and the
  notification count on the scale (count badge 20px).
- Category tree expand button 20px → 32px.
- Theme-template previews draw the CTA flat, matching the real shops.
- Already in place from Phase 1: buttons, fields, cards, badges, states.

### What is left after Phase 5 (all deliberate)
- **My Shops glass** — kept by decision (glass budget frozen).
- **Sell page illustrations** (`StorePhone`, `sellVisuals`, `ThemeShowcase`,
  claim/chat cards): miniature UI with tiny text and soft shadows.
- **Storefront A4 hero banner** — the one decorative element.
- **Theme-template miniatures** (admin) — 9px text inside a thumbnail.
- **Login hero photo fade** — text legibility over a photo.
- `shared/theme/colors.ts`, `shadows.ts`, `AuthDialog` comments mention the
  patterns (counted by the guard, not rendered).

## Phase 6 — Quality pass ☐
- §18 checklist on every page; delete dead CSS; budget for gradients, glass,
  ad-hoc effects and tiny text at 0.

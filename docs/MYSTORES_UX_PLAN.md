# `/mystores` Seller Workspace — UI/UX Redesign Plan

The roadmap for redesigning the seller area (`/mystores/**`): the store list, Create
Store, and every store-management section. It covers what is wrong today, the design
rules the redesign follows, the glass design spec, and the phases, each with a status.

**Who this is for:** many sellers have little formal education and work on low-cost
Android phones. Every decision below is judged at **360–400 px width**, first.

**Decisions taken (2026-10-04):** full glassmorphism · bottom tab bar on mobile ·
English only for now, in plain words (i18n later).

---

## 1. Status

| Phase | Scope | Status |
| ----- | ----- | ------ |
| 0 | Glass tokens + shared seller UI kit + form/dialog upgrades | ✅ Done (2026-10-04) |
| 1 | Shell & navigation (bottom tabs, More sheet, Share sheet) | ✅ Done (2026-10-04) |
| 2 | My Stores list + Create Store wizard | ✅ Done (2026-10-04) |
| 3 | Dashboard, setup checklist, publish card | ✅ Done (2026-10-04) |
| 4 | Products, product wizard, categories, media | ⬜ Not started |
| 5 | Orders list + order detail | ⬜ Not started |
| 6 | Settings pages (Business, Bank, Payments, Checkout, Shipping, Details, Footer, Banners) | ⬜ Not started |
| 7 | Store Builder mobile pass | ⬜ Not started |
| 8 | Support pages, skeletons, final polish | ⬜ Not started |

Legend: ⬜ not started · 🟨 in progress · ✅ done. A phase is done only after the
verification in §8 passes and `docs/FRONTEND_CONTEXT.md` is updated.

---

## 2. What is wrong today

All paths are under `frontend/src/storefront/pages/stores/` unless stated. Line numbers
are from the audit of 2026-10-04 and will drift.

### 2.1 Root causes (all screens)

| Problem | Evidence | Effect on a seller |
| ------- | -------- | ------------------ |
| Everything renders 10 % smaller | `html { font-size: 90% }` in `src/index.css` → `text-sm` = 12.6 px, `text-xs` = 10.8 px, `h-11` = 39.6 px | Small text is hard to read; small targets are hard to tap |
| Inputs below 16 px | `shared/ui/form.tsx:142,182`, `products/wizard/shared.tsx:22`, `VariantMatrix.tsx:81`, `shared/ui/ChipInput.tsx:176`, `StoreOrdersPage.tsx:150` | iOS zooms the page on every field focus |
| Tap targets 18–33 px | `ActiveSwitch.tsx:27` (20×36), icon buttons ≈ 29 px, chips ≈ 25 px, `SegmentedTabs` 32 px | Mis-taps, especially next to Delete |
| 30+ uses of `text-[10px]` / `text-[11px]` | e.g. `SetupStatus.tsx:326,332`, `StorePublishCard.tsx:140,146,217` | Hints and status unreadable |
| Icon-only action clusters | `StoreProductsPage.tsx:540-580`, `StoreCategoriesPage.tsx:641-682`, `StoreBankPage.tsx:333-350`, `StoreFooterPage.tsx:330-347` | Seller must guess what an icon does; Delete sits beside the on/off switch |
| Four different save models | Instant (builder/banner switches), on-blur (`StoreBannersPage.tsx:598`), confirm-then-save (`StorePaymentsPage.tsx:121`), Save button (`StoreCheckoutPage.tsx:90,146`) | No pattern to learn; edits lost |
| Save buttons not sticky; per-card Save | Footer has 7 cards each with its own Save (`StoreFooterPage.tsx:72-80,150-156`); only Business guards unsaved edits (`StoreBusinessPage.tsx:111`) | Seller scrolls away and loses work silently |
| Drag- and hover-only controls | HTML5 drag in `StoreBannersPage.tsx:532`, `builder/BuilderSectionList.tsx:105-143`; hover-only "Replace image" `StoreBannersPage.tsx:515` | Cannot reorder or replace on a phone |
| Jargon | See glossary §5 | Seller does not know what to type |
| Flat, inconsistent visuals | 4–6 px radii, near-invisible `shadow-floating`; ~12 copied page headers; 3 card styles; 2 different `SaveButton`s; `ConfirmDialog` is a card while `Dialog` is a sheet | Looks dated; every page feels different |

### 2.2 Shell & navigation — `StoreManageLayout.tsx`, `StoreSectionNav.tsx`

- Mobile nav is a single dropdown (`StoreSectionNav.tsx:526-555`); daily sections
  (Orders, Products) are two taps away and the menu is a floating panel, not a sheet.
- The publish/share card is desktop-only (`StorePublishCard.tsx:149`) — phones lose
  **Share on WhatsApp**, the most important action for these sellers.
- Group captions are 10–11 px uppercase (`StoreSectionNav.tsx:380,535`).

### 2.3 My Stores & Create Store — `StoresPage.tsx`, `CreateStorePage.tsx`

- Store cards show `/store/{slug}` and a created date — neither helps the seller act.
  No setup progress, no Share.
- Create Store is a long form on mobile with no sticky Continue.

### 2.4 Dashboard — `StoreDashboardPage.tsx`, `SetupChecklist.tsx`, `SetupStatus.tsx`

- Plain bordered tiles; pipeline of six equal tiles; "View all orders →" is 10.8 px text.
- Unpublish has no confirmation (`StorePublishCard.tsx:116-124`).

### 2.5 Products & categories

- **Product rows** (`StoreProductsPage.tsx`): four small controls in a row — edit icon
  (29 px), switch (18×32), trash (29 px), "Placement" chip (25 px) (`:540-580`); a meta
  line of up to 7 facts in 10.8 px (`:497-510`); "next step" nudge is 11 px text (`:519-530`).
- **Product wizard** (`products/wizard/ProductWizard.tsx`): inline, not full-screen
  (`:81`); 6-step rail wraps to 2–3 rows on a phone (`:102-155`); "Finish later" and "Skip"
  are bare text links (`:92-98`, `wizard/shared.tsx:113`); buttons not sticky
  (`wizard/shared.tsx:94-118`); `autoFocus` on the name triggers iOS zoom (`BasicsStep.tsx:93`).
- **Pricing step** (`PricingStep.tsx:426-500`): presets, options editor, combinations
  matrix and bulk tools on one long page.
- **Options editor** (`OptionTypesEditor.tsx:444-480`): "Values are: Typed here / Other
  products" is abstract; unlabelled trash per card (`:497-504`); add buttons ≈ 29 px.
- **Variant matrix** (`VariantMatrix.tsx`): mobile cards are crowded (`:334-363`); photo
  picker is a fixed 240 px popover that can clip off-screen (`:543`); 8–9 px overlay labels.
- **Media** (`media/MediaBoard.tsx`): Retry/Discard ≈ 20 px of 10 px text (`:649-662`);
  "Add more" label 10 px (`:360,367`). `media/PhotoSheet.tsx` has no focus trap / Escape.
- **Categories** (`StoreCategoriesPage.tsx`): 28 px indent per level (`:407`) eats ~130 px
  on deep trees; star/edit/switch/trash under 30 px (`:651-682`); "Sort order", "Image URL".

### 2.6 Orders — `StoreOrdersPage.tsx`, `StoreOrderDetailPage.tsx`, `orderMeta.tsx`

- Status tabs scroll sideways with no hint; ≈ 26 px tall (`StoreOrdersPage.tsx:127-133`).
- On the detail page the action panel is not sticky (`StoreOrderDetailPage.tsx:187`), so
  "Confirm / Ship" is far from the items on a phone. Status chips 11 px (`orderMeta.tsx:27`).

### 2.7 Settings pages

- **Bank** (`StoreBankPage.tsx`): "IFSC" and "UPI ID" unexplained (`:470,494`); errors as
  one message at the bottom (`:406-425,508`); row actions cramp the text to ~150 px (`:322`).
- **Business** (`StoreBusinessPage.tsx:655-724`): bare PAN / GSTIN; "TDS", "CIN, LLPIN, Udyam".
- **Footer** (`StoreFooterPage.tsx`): 7 Save buttons; link rows never stack (`:931-959`);
  asks for GST again (`:719`); "URL", "https://", "externally hosted document".
- **Payments vs Checkout**: identical-looking switches, different save behaviour and
  labels ("Yes/No" vs "Collected/Hidden").
- **Shipping / delivery rules** (`DeliveryRuleEditor.tsx:248,258`): pincode field opens a
  numeric keypad but asks the seller to press Enter or comma, which many keypads lack;
  "Clear all" has no confirmation (`:198`).
- **Banners** (`StoreBannersPage.tsx`): drag-only reorder (`:207,532`), hover-only replace
  (`:515`), tiny ←/→ arrows (`:555-572`), hardcoded `bg-black/55`, `/70` overlays.

### 2.8 Store Builder — `builder/*`

- Save status hidden below 640 px (`BuilderHeader.tsx:225,233,242`) — failed saves are
  invisible on phones.
- The button labelled "Published" is actually the unpublish toggle, no confirmation
  (`BuilderHeader.tsx:160-169`).
- Up/down arrows ≈ 20 px (`BuilderSectionList.tsx:327`); sticky bar overflows by 4 px
  (`BuilderDesignPanel.tsx:169` `-mx-4` inside a `p-3` panel); its copy "The preview is
  showing them" is wrong on mobile, where the preview is in the other tab.

---

## 3. Design principles

1. **One primary action per screen.** On phones it lives in a sticky bottom bar,
   full width, 48 px: `<Button variant="rise" size="lg">`. `sheen` only for the one
   committing moment (Publish). Per the CLAUDE.md button rules, no hand-sized buttons.
2. **Icon + word, always.** No action is an icon alone. Destructive and rare actions
   live in a "⋯ More" sheet and are never adjacent to a switch.
3. **Big enough in real pixels.** Tap targets ≥ 44 px, inputs ≥ 48 px tall with
   16 px text, body text ≥ 14 px, hints ≥ 13 px. Set in **px tokens**, not rem, so the
   90 % root cannot shrink them.
4. **Plain words, with a hint line.** Every technical field gets a plain label and a
   one-line "where do I find this" hint (glossary §5).
5. **Steps, not walls.** Long forms become short steps or collapsible cards with a
   visible progress indicator.
6. **One save model.**
   - *Switches* save instantly and confirm with a "Saved ✓" toast (with a confirm sheet
     first only when they affect live checkout).
   - *Forms* get a sticky **SaveBar** that appears when something changed, offers
     **Save changes** / **Discard**, and warns before leaving with unsaved edits.
7. **Nothing hidden on touch.** No hover-only controls. Every drag handle has ↑ / ↓
   buttons beside it.
8. **Always show the next step.** Dashboard, product list and empty states each name
   the single most useful thing to do next.

---

## 4. Glass design spec

Scope: `/mystores/**` and `/mystores/new` only. The public storefront (`/store/**`)
and its per-store `storeVars()` theming are not touched; neither is the admin console,
except where it shares `form.tsx` / `Dialog.tsx` upgrades.

### 4.1 Backdrop

`.seller-canvas` on the workspace root paints one **fixed**, `pointer-events: none`
layer behind everything: 2–3 large blurred blobs (brand purple `--brand`, accent blue
`--accent`, a soft pink) over `--bg`. One fixed layer means the browser blurs the
backdrop once, not per card.

### 4.2 Tokens (`src/index.css`, light in `:root`, dark in `[data-theme='dark']`)

| Token | Light | Dark | Use |
| ----- | ----- | ---- | --- |
| `--glass-bg` | `rgba(255,255,255,.70)` | `rgba(30,28,40,.62)` | Cards |
| `--glass-strong` | `rgba(255,255,255,.86)` | `rgba(24,22,32,.82)` | Top bar, bottom tabs, sticky bars, sheets |
| `--glass-inset` | `rgba(255,255,255,.90)` | `rgba(255,255,255,.06)` | Inputs and wells inside glass |
| `--glass-border` | `rgba(255,255,255,.60)` | `rgba(255,255,255,.09)` | 1 px card edge |
| `--glass-fg-muted` | `#5c5c66` | `#a4a4ae` | Secondary text inside glass (5.5:1 / 6.2:1) |
| `--glass-success` / `--glass-danger` / `--glass-pending` | `#007000` / `#c8281f` / `#b03a0a` | `#3fbf6a` / `#ff6b63` / `#f08c4b` | Status text inside glass |
| `--canvas-1/2/3` | purple .40 · blue .30 · rose .26 | purple .24 · blue .22 · rose .16 | Colour field (raised in Phase 1 so the glass reads) |
| `--overlay-soft` | `rgba(17,12,46,.40)` | `rgba(0,0,0,.55)` | Sheet / dialog backdrop (no blur — see §4.4) |
| `--glass-highlight` | inset `0 1px 0 rgba(255,255,255,.7)` | inset `0 1px 0 rgba(255,255,255,.06)` | Top light edge |
| `--glass-shadow` | `0 8px 32px -6px rgba(30,18,80,.14)` | `0 10px 36px -8px rgba(0,0,0,.55)` | Elevation |
| `--glass-blur` / `--glass-blur-strong` | `16px` / `22px` | same | Cards / chrome |
| `--spacing-tap` (`h-tap`, `size-tap`) | `44px` | — | Minimum hit area |
| `--spacing-field` (`h-field`) | `48px` | — | Input / large button height |
| `--text-field` / `--text-hint` | `16px` / `13px` | — | Input text / helper copy floor |
| `--radius-glass` / `--radius-sheet` | `16px` / `22px` | — | Workspace cards / sheets |

Values above are the shipped Phase 0 values, tuned against the contrast checks in §8.
The glass utilities re-point `--fg-muted`, `--success` and `--danger` to the glass-safe
steps, so text inside glass passes AA without call sites changing anything.

### 4.3 Utilities (Tailwind v4 `@utility`)

- `glass` — cards: `--glass-bg`, blur, border, highlight, shadow, `rounded-xl`.
- `glass-strong` — chrome and sheets: `--glass-strong`, 20 px blur.
- `glass-inset` — fields and wells inside glass, more opaque for legibility.

### 4.4 Guards

- **Legibility:** text on glass uses `--fg` / `--fg-muted` only, over ≥ .6 opacity;
  WCAG AA (4.5:1) checked in both schemes.
- **No support:** `@supports not (backdrop-filter: blur(1px))` → solid `--surface`.
- **User preference:** `@media (prefers-reduced-transparency: reduce)` → solid.
- **Performance:** in long lists (products, orders, categories) only the **container**
  is glass; rows are plain. Never nest blurred layers — a child's `backdrop-filter`
  only sees up to the nearest blurred ancestor, so sheet overlays are a plain tint.
- **Motion:** sheets, tabs, toasts animate 150–220 ms ease-out; the existing
  reduced-motion rule neutralises it.

---

## 5. Plain-word glossary

| Today | New label | Hint line |
| ----- | --------- | --------- |
| SKU / Item code | Product code (optional) | Your own code to find this item. Skip if you don't use one. |
| Variant / Combination | Choice (e.g. "Red · M") | One version of the product a buyer can pick. |
| Option type | Choice type (Size, Colour…) | — |
| Typed here / Other products | Just list the choices / Link to other products I sell (advanced) | — |
| Family | Linked products | Products shown together as choices of each other. |
| MRP | Printed price (MRP) | The price printed on the pack. Your selling price can be lower. |
| Slug | Shop web address | Shown as a live preview: `uniemax.com/store/your-shop` |
| Draft / Published | Not live yet / Live | Only live shops can be seen by buyers. |
| Placement | Show on home page | — |
| Sort order | Move up / Move down buttons | — |
| Image URL | Photo | Pick from your phone. |
| Shelf / Platform category | Section of your shop / UnieMax category | — |
| COD | Cash on delivery | — |
| IFSC | Bank branch code (IFSC) | 11 letters and numbers, printed on your cheque book or passbook. |
| UPI ID | UPI ID (e.g. name@okbank) | Find it in your GPay / PhonePe / Paytm profile. |
| PAN | PAN card number | 10 letters and numbers on your PAN card. Optional for cash-on-delivery shops. |
| GSTIN | GST number (if registered) | Only if your business is GST registered. |
| TDS | (removed from copy) | — |
| CIN / LLPIN / Udyam | Business registration number (optional) | If your business is registered as a company, LLP or MSME. |
| URL / https:// | Link | Paste a web link. |

---

## 6. Shared seller UI kit (Phase 0)

New folder `src/storefront/pages/stores/ui/` (relative imports, no aliases):

| Component | Replaces | Notes |
| --------- | -------- | ----- |
| `GlassCard` | Business `Card`, Footer `SectionCard`, Shipping border-top sections, repeated `rounded-lg border border-line p-4` | Title, optional status pill, body |
| `PageHeader` | ~12 copied `h2` + `p` blocks | Icon chip, title, one plain help line, optional action |
| `SaveBar` | Two different `SaveButton`s, per-card Saves | Sticky, `glass-strong`, safe-area padding, unsaved-changes guard generalised from `StoreBusinessPage.tsx:111` |
| `ActionRow` + `RowMenu` | Bank `AccountRow`, Footer location row, product/category icon clusters | One labelled primary action; the rest in a "⋯" bottom sheet |
| `BigSwitch` | `ActiveSwitch.tsx` | 52×32 visual, 44 px hit area, label + On/Off text; same props |
| `StatusPill` | Duplicated `rounded-pill … text-[11px]` pills | 12 px minimum |
| `EmptyState` | Per-page empty blocks | Illustration, one sentence, one action |
| `Toast` | — | "Saved ✓" after instant saves |
| `HelpHint` | — | ⓘ that opens a plain-words sheet |

In-place upgrades (admin benefits too):

- `shared/ui/form.tsx` — 48 px / 16 px inputs (px units), larger labels, 13 px hints,
  inline per-field errors.
- `shared/ui/Dialog.tsx` — glass sheet, 44 px close, `env(safe-area-inset-bottom)`.
- `shared/ui/ConfirmDialog.tsx` — bottom sheet on mobile, like `Dialog`.
- `media/PhotoSheet.tsx` — rebuilt on `Dialog` (focus trap + Escape).
- Hardcoded `bg-black/55|60|70` → `--overlay`; `bg-[#25D366]` → new `--whatsapp` token.

---

## 7. Phases

Each phase ships on its own and is approved before the next one starts.

### Phase 0 — Foundation

- [x] Glass, tap and radius tokens in `src/index.css` (light + dark); mirror in `shared/theme/colors.ts`
- [x] `glass`, `glass-strong`, `glass-inset` utilities with `@supports` and reduced-transparency fallbacks
- [x] `.seller-canvas` backdrop
- [x] Seller UI kit (§6)
- [x] `form.tsx`, `Dialog.tsx`, `ConfirmDialog.tsx`, `PhotoSheet.tsx` upgrades
- [x] Hardcoded overlay / WhatsApp colours → tokens
- [x] Extra (found while verifying): shared `Button` heights moved to px (36 / 44 / 48) — the 90 % root had them at 32 / 40 / 43 px; phones get a 16 px input floor app-wide (`pointer: coarse`)

> By design, no page uses the kit yet and `seller-canvas` is not applied anywhere — the
> visible redesign starts in Phase 1. The only visible changes in Phase 0 are the glass
> dialogs / confirm sheets / photo sheet, 48 px text fields, px button heights, the
> 16 px phone input floor and the 44 px `ActiveSwitch` hit area.

### Phase 1 — Shell & navigation

- [x] `.seller-canvas` on the workspace; AppLayout top bar `glass-strong` on `/mystores/**`
- [x] Mobile: glass top strip — logo, store name, Live / Not live pill, **Share** button
- [x] Share sheet (WhatsApp / Copy link / View shop) reusing `shareOrCopy` and `whatsAppShareUrl`
- [x] Mobile: bottom tab bar — Home · Orders (badge) · Products · Design (Store Builder) · More
- [x] "More" sheet (`SectionSheetList`, flat 52 px rows + "Switch to another shop"); mobile dropdown removed
- [x] Content bottom padding clears the tab bar; SaveBar stacks above it
- [x] Desktop: glass sidebar + rail, pill active rows; glass content panel; glass admin warning band
- [x] Pulled forward from Phase 3: "Take shop offline" now asks first (`ConfirmDialog`), and publish / offline show a toast
- [x] Desktop sidebar is sticky and scrolls itself; Copy / View buttons compact in the 264 px column

> Not yet restyled (later phases): the page bodies themselves — the dashboard tiles, lists and forms
> still use their old markup inside the new glass panels. Header icons from the shared app bar
> (notifications 32 px, theme toggle 32 px) are below 44 px; they are shared with the storefront
> and are left for Phase 8.

### Phase 2 — My Stores & Create Store

- [x] Glass store cards: big logo, Live / Not live, setup progress ring, **Manage** + **Share** (Publish until live — same sheet as the store strip)
- [x] Floating "+ New shop" button on mobile
- [x] Empty state with 3 steps: Name → Add products → Share
- [x] Create wizard: one question per screen (Name your shop → Add your logo → About you), segmented progress bar, sticky glass Continue bar, "Your shop link" live preview
- [x] Resume panel, loading skeletons, plain labels and hints ("Your name", "How we reach you", "Verified")
- [x] Shared `Wizard` shell upgraded in place (glass panel, 44 px rail targets, sticky mobile actions)

### Phase 3 — Dashboard

- [x] Hero: greeting, Today / Waiting / Total sales, and ONE next step (missing step → publish → waiting orders → WhatsApp share). Revised on review: a tinted glass card (`glass-tint`) with frosted stat tiles instead of a solid purple block
- [x] Setup checklist as a numbered vertical stepper (current step highlighted, one filled button), progress ring
- [x] Order pipeline as scrollable glass chips with a fade-edge hint (grid from `sm`)
- [x] Latest orders as tappable cards (`SellerOrderRow`: customer + total first, "25 min ago")
- [x] `glass-card` utility: cards inside the glass panel no longer stack a second blur
- [x] `setupSteps.ts` shared by hero, checklist and My shops cards; `ProgressRing` moved into the kit
- [x] Confirmation sheet before taking the shop offline (done in Phase 1)

### Phase 4 — Products & categories

- [ ] Product rows: photo, name, price, one status pill, **Edit**; `BigSwitch` separate; Delete / Placement in "⋯"
- [ ] Search + filter sheet; floating "+ Add product"
- [ ] Wizard full-screen on mobile; "Step 2 of 6 · Price" header with thin progress bar
- [ ] Sticky Back / Continue; Skip and Finish later as real buttons; no autofocus zoom
- [ ] Pricing split: "Sizes or colours?" Yes/No → pick choices → price & stock per choice → photos per colour
- [ ] Options editor reworded (§5); advanced linking collapsed by default
- [ ] Bulk tools in a sheet; variant photo picker as a bottom sheet
- [ ] Media: 44 px Retry / Discard / Add more; readable labels
- [ ] Categories: capped indent + breadcrumb chip; actions in "⋯"; Move up/down instead of Sort order; photo picker instead of Image URL

### Phase 5 — Orders

- [ ] Status filter: 40 px+ glass chips with counts and a scroll fade
- [ ] Order cards: customer, amount, status pill, age ("2 h ago")
- [ ] Detail: sticky next-action bar (Confirm order / Mark packed / Mark shipped)
- [ ] Big **Call** and **WhatsApp customer** buttons
- [ ] Timeline as a vertical stepper; Cancel in "⋯" with a reason sheet (16 px textarea)

### Phase 6 — Settings pages

- [ ] Every page on `PageHeader` + `GlassCard` + one `SaveBar`
- [ ] Payments and Checkout switches share one model (instant + toast; confirm when live checkout is affected) and the same On/Off wording
- [ ] Bank: plain IFSC / UPI hints, inline errors, `ActionRow`. IFSC → bank/branch autofill **only if approved** (would need an endpoint; see §9)
- [ ] Business: plain PAN / GSTIN hints, "optional" tags, TDS removed from copy
- [ ] Footer: one SaveBar; link rows stack on mobile; GST read from Business instead of asked again
- [ ] Shipping / delivery rules: pincode "Add" button; confirm before "Clear all"
- [ ] Banners: visible "Change photo"; ↑ / ↓ buttons beside drag; overlay tokens

### Phase 7 — Store Builder (mobile)

- [ ] Save status chip always visible on mobile
- [ ] "Published" toggle → "Take shop offline", behind a confirmation
- [ ] 44 px ↑ / ↓ beside the drag handle
- [ ] Fix sticky-bar overflow and the mobile preview copy
- [ ] Glass panels

### Phase 8 — Support pages & polish

- [ ] Customer Support and UnieMax Support pages on the kit
- [ ] Skeleton loaders replace "Loading…"
- [ ] Final dark-mode, contrast, reduced-transparency and reduced-motion pass
- [ ] Remove dead styles and the old `ActiveSwitch`

---

## 8. Verification (every phase)

- `cd frontend && npx tsc -b && npx vite build` (ESLint crashes in this repo).
- Screens checked at **360×740** and **390×844** with CDP device emulation (not
  `--window-size`), plus **1280 px** desktop, in **light and dark**.
- On every touched screen: no horizontal scroll; inputs ≥ 16 px computed; tappables
  ≥ 44 px; text-on-glass contrast ≥ 4.5:1; solid fallback with `backdrop-filter` off.
- End-to-end on mobile: create store → add category → add product with sizes/colours →
  publish → share on WhatsApp → place a test order → confirm and ship it.
- Admin view of a store (same layout) still shows its warning band and hides the
  sections it does not serve.

## 9. Out of scope / open questions

- **Languages:** English only for now; copy is written so it can be extracted to an
  i18n layer later.
- **IFSC lookup:** needs a backend endpoint or an approved third-party lookup. If added,
  it is documented in `docs/API.md` and `docs/BACKEND_CONTEXT.md`.
- No other backend or API changes are expected.

# Admin Panel UI Theme — Migration Spec

> **For the AI or developer reading this:** this file describes one admin panel theme completely.
> Your job is to make the target application look and behave **exactly** like it.
> The full source stylesheet is in **Appendix A** at the end of this file. It is the single source
> of truth. If anything in the text above it disagrees with the CSS, **the CSS wins**.

---

## 0. How to migrate (step by step)

1. **Copy the stylesheet.** Put the whole CSS from Appendix A into the target app as one global file
   (for example `src/styles.css`) and import it once at the app root. Do not rewrite it in Tailwind,
   CSS-in-JS or a UI kit. Plain CSS with CSS variables is the whole system.
2. **Load the fonts.** Inter (400/500/600/700) from Google Fonts in `index.html` (see §3).
   Optional: JetBrains Mono for `.mono` (falls back to system monospace).
3. **Add the theme switch.** `data-theme="light" | "dark"` on `<html>` (see §9). Every screen must
   work in both themes.
4. **Rebuild the app shell** with the exact markup in §6 (sidebar + top bar + page).
5. **Rebuild each screen** with the component markup in §7 — same element structure, same class
   names. The CSS targets these class names, so the markup must match.
6. **Remove the old styles** (old theme files, UI-library themes, inline colours) once a screen is moved.
7. **Replace the brand.** The lockup "Servi**DEX** Admin" is the source app's logo. Put the target
   app's name in the same `.brand` markup (§6.1). Keep or drop the Audiowide brand font and the
   orange `--logo` colour as the target brand needs.
8. **Check** every screen in light mode, dark mode, at 1440 px, 1100 px, 900 px and 375 px wide.

### Hard rules

- **Never write a hex colour in a component.** Use the CSS variables (`var(--muted)`,
  `var(--secondary)`, …). The only hex values live in the `:root` blocks of the stylesheet.
- **Never invent new spacing, radius or font sizes** when an existing class or token fits.
- **Colours for states always come from the 6 tones** (`neutral`, `info`, `warn`, `success`,
  `danger`, `muted`) — see §5.
- **Every data page has 3 states:** loading (skeleton), empty, and error with Retry (§7.14).
- **Icons:** 24×24 stroke icons, `stroke-width: 2`, round caps/joins, `currentColor` (§8).
- Keep the look **quiet and dense**: small 13 px base text, thin 1 px borders, very light
  shadows, one teal accent. Do not add gradients, big shadows, or bright colour blocks.

---

## 1. Design character

- **Dense, calm, professional** — a data tool, not a marketing site. Base font size is **13 px**.
- **Neutral greys + one teal accent** (`--secondary: #0D9488`). Teal marks the active nav item,
  focus rings, selected tabs, charts, primary buttons and switches.
- **Cards on a light grey page** (`--bg`), white cards (`--card`), 1 px borders (`--border`),
  10 px corner radius, almost-invisible shadow (`--sh-1`).
- **Soft tinted badges**: a status colour mixed ~11% into the card colour, with a 6 px dot.
- **Derived colours** are built with `color-mix()` from a few base tokens, so dark mode only needs
  the base tokens changed.
- **Small, quick motion**: 120–180 ms fades and 3–6 px slides. Turned off for
  `prefers-reduced-motion`.

---

## 2. Colour tokens

### 2.1 Base tokens (the only hex values)

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--primary` | `#101828` | `#E5E7EB` | Darkest ink; toast & tooltip background (light), admin avatar |
| `--secondary` | `#0D9488` | `#14B8A6` | **Brand accent (teal)**: active states, focus, charts |
| `--accent` | `#FF9F43` | — | Rare highlight ("Sample" tag) |
| `--bg` | `#F6F7F9` | `#0B0F17` | Page background |
| `--card` | `#FFFFFF` | `#121826` | Cards, top bar, inputs, modals |
| `--side` | `#FBFBFC` | `#0E1320` | Sidebar background |
| `--text` | `#111827` | `#E6E8EC` | Main text |
| `--muted` | `#64748B` | `#94A3B8` | Secondary text, labels, icons |
| `--border` | `#E4E7EC` | `#232B3B` | All borders |
| `--success` | `#16A34A` | `#22C55E` | Success tone |
| `--error` | `#DC2626` | `#F87171` | Danger tone |
| `--info` | `#2563EB` | `#60A5FA` | Info tone |
| `--warn` | `#D97706` | `#FBBF24` | Warning tone |
| `--star` | `#F59E0B` | — | Rating stars |
| `--on-dark` | `#FFFFFF` | — | Text on dark/solid fills |
| `--ink-mix` | `black` | `white` | Mixed into tints to make readable text in each theme |
| `--tint` | `9%` | `16%` | Strength of the "selected" teal tint |
| `--logo` | `#FF7A00` | same | Brand lockup only |

### 2.2 Derived tokens (built with `color-mix`, same formula in both themes)

| Token | Formula | Meaning |
|---|---|---|
| `--action` | secondary 86% + black (dark: 70%) | Primary button fill, checked switch |
| `--link` | secondary 72% + ink-mix | Link text |
| `--text-2` | text 78% + muted | Slightly softer body text (nav items, labels) |
| `--muted-2` | muted 60% + card | Very faint text/icons |
| `--line` | border 60% + card | Inner dividers (table rows, card header line) |
| `--surface-2` | border 45% + bg | Grey chip/pill/skeleton fill |
| `--hover` | border 30% + card | Hover background for rows, nav, ghost buttons |
| `--sel` | secondary `--tint` + card | Selected background (active nav, selected card) |
| `--sel-ink` | secondary 55% + ink-mix | Text/icon on `--sel` |
| `--focus` | secondary 55% transparent | Focus outline |
| `--sh-1` | `0 1px 2px rgb(16 24 40 / .05)` | Card / button shadow |
| `--sh-2` | `0 8px 24px …/.12, 0 2px 6px …/.06` (dark: `0 10px 30px rgb(0 0 0/.5)`) | Popovers, modals, toast |
| `--overlay` | `rgb(10 14 22 / .45)` (dark: `rgb(0 0 0 / .6)`) | Modal backdrop |

### 2.3 Tinted-colour recipe (use this for any new coloured element)

```css
background: color-mix(in srgb, var(--TONE) 11%, var(--card));      /* soft fill */
color:      color-mix(in srgb, var(--TONE) 62%, var(--ink-mix));    /* readable text */
border:     1px solid color-mix(in srgb, var(--TONE) 24%, var(--border)); /* if bordered */
```

---

## 3. Typography

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

- Body: `400 13px/1.45 Inter, system-ui, …`, antialiased, `font-feature-settings: 'cv11', 'ss01'`.
- Numbers in stats/tables: `font-variant-numeric: tabular-nums`.
- Uses in-between weights **550** and **650** (Inter variable renders them).

| Role | Size | Weight | Extra |
|---|---|---|---|
| Page title `.ph h1` | 20px (18px on phone) | 650 | letter-spacing −.02em |
| Stat value `.stat-v` | 20px | 650 | tabular-nums |
| Modal title `.m-h h2` | 15px | 650 | |
| Card title `.card-h h2` | 13.5px | 600 | |
| Body / buttons / table | 13px | 400 / 550 buttons | |
| Labels, small text `.sm` | 12.5px | 550 for labels | |
| Table header, badge, hints | 12px | 500 / 550 | muted colour |
| Tiny `.xs`, nav section | 11–11.5px | 600 for section | |
| Mono `.mono` | 12px | — | JetBrains Mono → ui-monospace |
| Brand `.brand-name` | 19px (login 22px) | 400 | Audiowide (optional) |

---

## 4. Spacing, radius, sizes

- Spacing steps used: **4, 6, 8, 10, 12, 14, 16, 20, 24 px**. Utility classes: `.gap8 .gap12 .gap16`,
  `.mt8 .mt12 .mt16 .mb8 .mb12`, `.pad` (16px).
- Radius: `--r: 8px` (buttons, inputs), `--r-lg: 10px` (cards, popovers), 12px (modals, savebar),
  14px (login card), 6px (nav items, icon buttons, menu items), 11px pill radius on badges.
- Heights: button 32px (`.btn-sm` 28px), icon button 30×30, input 32px, top bar 52px,
  nav item 30px, badge 22px, tab 36px.
- Sidebar width 232px (mobile drawer 260px). Page padding `20px 24px 40px`, max width 1640px.

---

## 5. Status tones (the 6 states)

Every status, badge, callout, stat highlight and icon tile uses one of these. The class sets
`--tc` (tone colour) and the component uses `--tc`.

| Tone | Class | Colour | Meaning examples |
|---|---|---|---|
| neutral | `st-neutral` / `t-neutral` | muted | Draft, default |
| info | `st-info` / `t-info` | `--info` | In progress, scheduled |
| warn | `st-warn` / `t-warn` | `--warn` | Pending, needs review |
| success | `st-success` / `t-success` | `--success` | Active, done, live |
| danger | `st-danger` / `t-danger` | `--error` | Blocked, failed, cancelled |
| muted | `st-muted` / `t-muted` | `--muted-2` | Disabled, archived (hollow dot) |

```html
<span class="st st-success" title="Visible to customers"><i aria-hidden="true"></i>Active</span>
```

---

## 6. App shell

```
┌──────────────┬──────────────────────────────────────────────┐
│ .brand       │ .top  [☰ only-sm] [ .gsearch ......... / ]  [☾]│  52px
│ .nav         ├──────────────────────────────────────────────┤
│  (sections)  │ .main (scrolls)                              │
│              │   .page (max 1640px, padding 20/24/40)       │
│ .side-foot   │                                              │
└──────────────┴──────────────────────────────────────────────┘
  232px            1fr
```

```html
<div class="shell">
  <aside class="side" aria-label="Main navigation">
    <!-- 6.1 Brand -->
    <div class="brand"><span class="brand-name">Servi<span>DEX</span></span><b>Admin</b></div>

    <!-- 6.2 Navigation: optional section headings, links with icon + label -->
    <nav class="nav">
      <div><a href="/" class="on"><svg class="ic" …/><span>Dashboard</span></a></div>
      <div>
        <div class="nav-sec">Operations</div>
        <a href="/bookings"><svg class="ic" …/><span>Bookings</span><span class="nb">3</span></a>
      </div>
    </nav>

    <!-- 6.3 Signed-in user -->
    <div class="side-foot">
      <span class="av" style="--av: var(--primary); width:28px; height:28px; font-size:11px">AP</span>
      <div><b>Admin Name</b><span>Super admin</span></div>
      <button class="ibtn" aria-label="Sign out" title="Sign out"><svg class="ic" …/></button>
    </div>
  </aside>
  <div class="side-back"></div>  <!-- mobile drawer backdrop; click → remove body.nav-open -->

  <div class="body">
    <header class="top">
      <button class="ibtn only-sm" aria-label="Open navigation">☰</button> <!-- toggles body.nav-open -->
      <form class="gsearch" role="search">
        <label><svg class="ic" …/><span class="sr">Search</span>
          <input type="search" placeholder="Search…" /><kbd>/</kbd></label>
      </form>
      <div class="top-r">
        <button class="ibtn" aria-label="Dark theme" title="Dark theme"><!-- moon / sun icon --></button>
      </div>
    </header>
    <main class="main" tabindex="-1">
      <div class="page"><!-- page content; re-key on route change so the 180ms fade-in plays --></div>
    </main>
  </div>
</div>
```

Behaviour:
- Active nav link gets class `on` (teal tint background, teal ink, weight 600).
- `/` or Ctrl/⌘+K focuses the search; Escape closes the mobile drawer.
- On route change: update `document.title` to `"<Page label> · <App name>"`, remove
  `body.nav-open`, scroll `.main` to top.
- Below **900px** the sidebar becomes a slide-in drawer (`body.nav-open`), `.only-sm` buttons show.

---

## 7. Components (markup → class names)

### 7.1 Page header
```html
<header class="ph">
  <a class="ph-back" href="/services"><svg class="ic" …/>Services</a>   <!-- detail pages only -->
  <div class="ph-row">
    <div class="ph-t"><h1>Users <span class="st st-success"><i></i>Live</span></h1>
      <p>One short sentence explaining the page.</p></div>
    <div class="ph-a"><button class="btn btn-secondary">Export</button>
      <button class="btn btn-primary"><svg class="ic" …/><span>Add user</span></button></div>
  </div>
</header>
```

### 7.2 Buttons
| Class | Look |
|---|---|
| `btn btn-primary` | Teal (`--action`) fill, white text — **one per area** |
| `btn btn-secondary` | Card fill, border, light shadow |
| `btn btn-ghost` | No fill; hover background only |
| `btn btn-danger` | Card fill, red border + red text (solid red inside modal footers `.m-f`) |
| `btn-sm` | 28px high |
| `btn-block` | Full width |
| `loading` | Hides text and shows a spinner |
| `ibtn` | 30×30 icon-only button, muted icon; **always** give `aria-label` + `title` |
| `lnk` | Teal text link, underline on hover |

Buttons press down 1px on `:active`; disabled = 50% opacity.

### 7.3 Cards and stats
```html
<section class="card">
  <header class="card-h"><h2>Recent bookings <span class="cnt">12</span></h2><a class="lnk sm">View all</a></header>
  <div class="card-b">…</div>            <!-- omit .card-b for edge-to-edge lists/tables -->
</section>

<div class="stats">                       <!-- auto-fit grid, min 170px -->
  <a class="stat" href="/users"><span class="stat-l">Users</span><span class="stat-v">1,204</span><span class="stat-s">+12 this week</span></a>
  <div class="stat t-warn">…</div>        <!-- t-warn / t-danger colours border + value -->
</div>
```
Grids: `.grid-2`, `.grid-3`, `.grid-main` (content + 340px sticky `<aside>`), `.grid-2.dash` (5fr/7fr).

### 7.4 Tables
```html
<div class="card tcard">
  <div class="tscroll">
    <table class="tbl">
      <thead><tr><th>User</th><th class="num">Bookings</th><th class="hide-sm">Last login</th><th>Status</th><th></th></tr></thead>
      <tbody>
        <tr class="link" tabindex="0">
          <td data-label="User"><div class="cellx"><span class="av">…</span><span><b>Name</b><span class="sub">+91 98…</span></span></div></td>
          <td class="num" data-label="Bookings">14</td>
          <td class="hide-sm" data-label="Last login">2 h ago</td>
          <td data-label="Status"><span class="st st-success"><i></i>Active</span></td>
          <td class="act"><button class="ibtn" aria-label="More">⋯</button></td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="tfoot"><span>1–20 of 240</span><div class="pager"><button class="ibtn">‹</button><button class="ibtn">›</button></div></div>
</div>
```
- Header row: 12px muted, light grey fill. Rows: 9px/12px padding, `--line` divider, hover `--hover`.
- `num` = right aligned, tabular. `act` = right aligned actions. `.tbl.dense` = tighter.
- Sortable header: `<th aria-sort="ascending"><button class="th-s">Name <svg/></button></th>`.
- **Every `<td>` needs `data-label`.** Below 720px tables turn into stacked cards and show the label
  on the left of each value. First cell becomes the card title.
- Hide less important columns: `hide-md` (<1280px), `hide-sm` (<720px).

### 7.5 Filters and tabs
```html
<div class="tabs"><button class="on">All <span class="cnt">240</span></button><button>Pending <span class="cnt alert">3</span></button></div>

<div class="fbar">
  <label class="fsearch"><svg class="ic" …/><input type="search" placeholder="Search by name or phone" /></label>
  <label class="fsel"><select><option>All cities</option></select></label>
  <div class="fbar-r"><button class="btn btn-secondary btn-sm">Reset</button></div>
</div>
```
Segmented control: `<div class="segc"><label class="on"><input type="radio">Day</label><label>…</label></div>`.

### 7.6 Badges and small labels
- `.st .st-<tone>` — status badge with dot (§5).
- `.pill` — grey tag; `.pill.ok`, `.pill.warn`.
- `.cnt` — count bubble (`.cnt.alert` = warn tint). `.nb` — count in the sidebar.
- `.chip`, `.chips` — small grey tags; `.chip.tog` / `.chip.tog.on` — toggle chips.
- `.role-tag.customer` / `.role-tag.provider`, `.yes` / `.no`, `.rating`, `.sample`, `.sub` (second line under a name).
- Avatar: `<span class="av" style="--av: var(--secondary); width:28px; height:28px; font-size:11px">AB</span>`
  (font size ≈ 0.38 × size; initials, or a user icon when there is no name).

### 7.7 Key–value list
```html
<dl class="kv"><dt>Phone</dt><dd>+91 98765 43210</dd><dt>Joined</dt><dd>12 Nov 2026</dd></dl>
```

### 7.8 Callouts
```html
<div class="callout c-warn"><svg class="ic" …/><div><b>Heads up.</b> This change goes live immediately.</div></div>
```
Variants: `c-info`, `c-warn`, `c-danger`, `c-success`.

### 7.9 Forms
```html
<label class="fld"><span>Name <span class="req">*</span></span><input type="text" /></label>
<label class="fld"><span>Notes <i>(optional)</i></span><textarea></textarea></label>
<div class="frow">…two or more .fld side by side…</div>
<p class="ferr"><svg class="ic" …/>Name is required.</p>        <!-- hidden when empty -->
<label class="switch-row"><span>Enabled<em>Shown in the app</em></span><input type="checkbox" role="switch" /></label>
<div class="prefix"><i>+91</i><input /></div>
```
- Inputs: 1px border, 8px radius, card fill; focus = teal border + 3px soft teal ring.
- Invalid: `aria-invalid="true"` → red border. Disabled: grey fill, muted text.
- Checkbox/radio: native, `accent-color: var(--action)`, 15px.
- Option cards: `.opt-cards > label.opt-card(.on)` with radio + title + `<em>` description.
- Sticky save bar for long forms: `<div class="savebar"><span>Unsaved changes</span><button class="btn btn-ghost">Discard</button><button class="btn btn-primary">Save</button></div>`.

### 7.10 Modal
```html
<div class="modal open">
  <div class="m-back"></div>                                   <!-- click closes -->
  <div class="m-box" role="dialog" aria-modal="true" aria-labelledby="m-title">  <!-- add .wide for 860px -->
    <header class="m-h"><h2 id="m-title">Suspend user</h2><button class="ibtn" aria-label="Close">✕</button></header>
    <div class="m-b"><p class="m-msg">Explain the effect in one sentence.</p>…fields…</div>
    <footer class="m-f"><button class="btn btn-secondary">Cancel</button><button class="btn btn-danger">Suspend</button></footer>
  </div>
</div>
```
Escape and backdrop close it. On open, focus `[data-autofocus]` or the first field; on close, return
focus. Render it into `document.body` (portal). On phones it sits at the bottom of the screen.

### 7.11 Dropdown menu (native `<details>`)
```html
<details class="menu right">
  <summary class="ibtn" aria-label="More actions">⋯</summary>
  <div class="menu-pop">
    <button><svg class="ic" …/><span>Edit</span><em>E</em></button>
    <hr />
    <button class="danger"><svg class="ic" …/><span>Delete</span></button>
  </div>
</details>
```

### 7.12 Toast
One fixed element at bottom centre, dark fill (`--primary`; light fill in dark mode).
```html
<div class="toast show ok" role="status" aria-live="polite"><svg class="ic" …/><span>Saved</span></div>
```
Tones: `ok` (check icon), `err` (alert icon), `info`. Remove `show` after ~3 s.

### 7.13 Dashboard pieces
- **Attention list** `.att` — rows with a tinted icon tile `.att-ic` (`t-<tone>`), a big number
  `.att-n`, title + `<em>` sub-line, chevron at the end.
- **Bar chart** `.chart` — SVG, height 170px, 3 grid lines (`.grid`), muted axis text (`.axis`),
  teal rounded bars (`.mark`, 4px top radius), hover darkens bar; tooltip `.tip` follows the pointer
  over `[data-tip]`. Include a hidden `.sr` table with the same data.
- **Horizontal bars** `.hbars` — label / 8px track `.hb-t > i` (teal, width = %) / value.
- **Mini list** `.mini-list` — compact rows inside a card.
- **Timeline** `.tl` — dots `.tl-dot` coloured by `--tc`, a 1.5px line between them.

### 7.14 Loading, empty and error states (required on every data page)
```html
<!-- Loading: skeleton bones shaped like the real page (header, stats row, table rows) -->
<div class="skel" style="width:220px; height:22px"></div>

<!-- Empty -->
<div class="empty"><svg class="ic" width="28" height="28" …/><h3>No users yet</h3><p>Users appear here after they sign up.</p></div>

<!-- Error -->
<div class="empty err"><svg class="ic" width="28" height="28" …/><h3>Couldn't load this page</h3><p>Network error.</p>
  <button class="btn btn-primary"><svg class="ic" …/><span>Retry</span></button></div>
```

### 7.15 Login screen
```html
<div class="login">
  <form class="login-card">
    <div class="brand"><span class="brand-name">…</span><b>Admin</b></div>
    <h1>Sign in</h1><p class="muted">Use your admin account.</p>
    <label class="fld"><span>Phone</span><input /></label>
    <button class="btn btn-primary btn-block">Continue</button>
  </form>
  <p class="login-foot">Small print.</p>
</div>
```

### 7.16 Utility classes
`.muted .xs .sm .b .nowrap .mono .center .row .col .between .wrap .gap8/12/16 .mt8/12/16 .mb8/12 .pad
.hide .sr (screen-reader only) .hide-md .hide-sm .only-sm .clip (2-line clamp) .clip1 (1-line)`.

---

## 8. Icons

- Inline SVG, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`,
  `stroke-linecap="round"`, `stroke-linejoin="round"`, `aria-hidden="true"`, class `ic`.
- Sizes: **16** in nav, top bar, icon buttons; **15** inside buttons and search; **14** small links;
  **28** in empty/error states.
- The style matches **Lucide / Feather** icons. Using `lucide-react` (or copying Lucide paths) gives
  the same look. Icons used: alert, arrowDown/Up/Right, back, ban, bars, book, briefcase, calendar,
  check, chevron, clock, edit, grid, help, home, image, info, layers, lock, logout, menu, mobile,
  moon, more, pause, pin, play, plus, refresh, search, shield, shieldCheck, sliders, sparkles, star,
  sun, trash, upload, user, users, wallet, x, zap.

```tsx
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  )
}
```

---

## 9. Light / dark theme

- `data-theme` on `<html>` switches the tokens. First visit follows the OS; the top-bar button
  toggles and is saved in `localStorage`.
- Also update `<meta name="theme-color">` to the current `--bg` (light `#F6F7F9`).

```ts
export type Theme = 'light' | 'dark'
const KEY = 'app-admin-theme'

export function initialTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark') return v
  } catch { /* private mode */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try { localStorage.setItem(KEY, theme) } catch { /* private mode */ }
}
```

Run `applyTheme(initialTheme())` before the first render to avoid a flash.

---

## 10. Responsive breakpoints

| Width | What changes |
|---|---|
| ≤ 1280px | `.hide-md` hidden; side column of `.grid-main` 300px |
| ≤ 1100px | `.grid-main`, `.grid-3`, `.grid-2.dash` become one column; option cards stack |
| ≤ 900px | Sidebar becomes a drawer (`body.nav-open`), menu button shows, page padding 16px, all 2-column grids/forms become one column |
| ≤ 720px | `.hide-sm` hidden; stats 2 per row; **tables become cards** (uses `data-label`); key–value lists stack; modals sit at the bottom |

Also: `prefers-reduced-motion` turns animations off, and a `@media print` block prints A4 in the
light theme without navigation or buttons.

---

## 11. Motion

| Name | Duration | Effect |
|---|---|---|
| `pageIn` | 180ms ease-out | page fades in, rises 3px |
| `pop` | 120ms | menu pops down 3px |
| `mIn` | 160ms | modal rises 6px, scale .99 → 1 |
| `fade` | 150ms | modal backdrop |
| `sk` | 1.2s loop | skeleton shimmer |
| `spin` | 0.7s loop | button loading spinner |
| hover/focus | 120ms | background, border, shadow transitions |
| toast | 180ms | fade + slide up 20px |

---

## 12. Which CSS sections are app-specific

Appendix A contains everything from the source panel. The **core** sections every app needs:
tokens, base, Shell, Global search, Page header, Buttons, Dropdown menus, Status badges, Cards/stats/grids,
Key–value, Callouts, Tabs + filters, Tables, Empty/error/loading, Dashboard, Forms/modal/toast,
Settings, Login, Responsive, Print.

These sections belong to the source app's own screens. **Keep them** (they cost nothing and show
patterns), or delete them if the target app has no such screens: Verification (`.docs`, `.idcard`),
Moderation (`.flags`), Support inbox (`.inbox`, `.msgs`, `.bubble`), Catalogue + content
(`.sortable`, `.banners`, `.bnr`, `.phone-prev`), Banner editor, City editor (`.geo-*`, `.area-grid`),
App updates (`.ota-*`), Onboarding (`.onb-*`).

Note: the `@font-face` for Audiowide points to `fonts/audiowide-400.woff2`. Either add that file
(free font, SIL Open Font License, from Google Fonts) or remove the `@font-face` line and the brand
falls back to Inter.

---

## Appendix A — Full stylesheet (copy exactly)

```css
/* ServiDEX Admin — a copy of admin-prototype/assets/styles.css, so the panel looks exactly like the prototype.
 * Change the prototype first, then copy it here (admin/docs/architecture.md → Styles). */

/* Audiowide — the logo's lettering (SIL Open Font License, docs/brand.md). Only the brand lockup uses it. */
@font-face { font-family: 'Audiowide'; font-style: normal; font-weight: 400; font-display: swap; src: url('fonts/audiowide-400.woff2') format('woff2'); }

:root {
  --primary: #101828; --secondary: #0D9488; --accent: #FF9F43;
  --bg: #F6F7F9; --card: #FFFFFF; --side: #FBFBFC; --text: #111827; --muted: #64748B; --border: #E4E7EC;
  --success: #16A34A; --error: #DC2626; --info: #2563EB; --warn: #D97706; --star: #F59E0B; --on-dark: #FFFFFF;
  --ink-mix: black; --tint: 9%;
  /* Logo only: the mobile app's brand colours (prototype/assets/styles.css), the same in both themes. */
  --logo: #FF7A00; --font-brand: 'Audiowide', Inter, system-ui, sans-serif;
  color-scheme: light;
}
:root[data-theme="dark"] {
  --primary: #E5E7EB; --bg: #0B0F17; --card: #121826; --side: #0E1320; --text: #E6E8EC; --muted: #94A3B8; --border: #232B3B;
  --secondary: #14B8A6; --success: #22C55E; --error: #F87171; --info: #60A5FA; --warn: #FBBF24; --ink-mix: white; --tint: 16%;
  color-scheme: dark;
}
:root {
  --action: color-mix(in srgb, var(--secondary) 86%, black);
  --link: color-mix(in srgb, var(--secondary) 72%, var(--ink-mix));
  --text-2: color-mix(in srgb, var(--text) 78%, var(--muted));
  --muted-2: color-mix(in srgb, var(--muted) 60%, var(--card));
  --line: color-mix(in srgb, var(--border) 60%, var(--card));
  --surface-2: color-mix(in srgb, var(--border) 45%, var(--bg));
  --hover: color-mix(in srgb, var(--border) 30%, var(--card));
  --sel: color-mix(in srgb, var(--secondary) var(--tint), var(--card));
  --sel-ink: color-mix(in srgb, var(--secondary) 55%, var(--ink-mix));
  --focus: color-mix(in srgb, var(--secondary) 55%, transparent);
  --sh-1: 0 1px 2px rgb(16 24 40 / .05);
  --sh-2: 0 8px 24px rgb(16 24 40 / .12), 0 2px 6px rgb(16 24 40 / .06);
  --overlay: rgb(10 14 22 / .45);
  --r: 8px; --r-lg: 10px;
  --fs: 13px;
}
:root[data-theme="dark"] { --action: color-mix(in srgb, var(--secondary) 70%, black); --sh-2: 0 10px 30px rgb(0 0 0 / .5); --overlay: rgb(0 0 0 / .6); }
/* Six standard status tones (js/status.js). */
:root {
  --neutral: var(--muted); --muted-t: var(--muted-2);
}
.t-neutral, .st-neutral { --tc: var(--muted); }
.t-info, .st-info { --tc: var(--info); }
.t-warn, .st-warn { --tc: var(--warn); }
.t-success, .st-success { --tc: var(--success); }
.t-danger, .st-danger { --tc: var(--error); }
.t-muted, .st-muted { --tc: var(--muted-2); }

* { box-sizing: border-box; margin: 0; }
html, body { height: 100%; }
body { font: 400 var(--fs)/1.45 Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: var(--text); background: var(--bg); -webkit-font-smoothing: antialiased; font-feature-settings: 'cv11', 'ss01'; }
button, input, select, textarea { font: inherit; color: inherit; }
button { background: none; border: 0; cursor: pointer; }
a { color: inherit; text-decoration: none; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }
.ic { flex: none; }
.ic.fill { fill: currentColor; stroke-width: 1.4; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.muted { color: var(--muted); } .xs { font-size: 11.5px; } .sm { font-size: 12.5px; } .b { font-weight: 600; } .nowrap { white-space: nowrap; }
.mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12px; letter-spacing: -.01em; }
.center { text-align: center; } .pad { padding: 16px; } .pad-x { padding: 10px 16px 0; }
.mt8 { margin-top: 8px; } .mt12 { margin-top: 12px; } .mt16 { margin-top: 16px; } .mb8 { margin-bottom: 8px; } .mb12 { margin-bottom: 12px; }
.row { display: flex; align-items: center; } .between { justify-content: space-between; } .wrap { flex-wrap: wrap; }
.gap8 { gap: 8px; } .gap12 { gap: 12px; } .gap16 { gap: 16px; }
.col { display: flex; flex-direction: column; min-width: 0; }
.hide { display: none; }
kbd { font: 500 11px/1 inherit; padding: 3px 5px; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); background: var(--card); }
mark { background: color-mix(in srgb, var(--warn) 28%, transparent); color: inherit; border-radius: 3px; padding: 0 2px; }
code { font-family: ui-monospace, Consolas, monospace; font-size: 11.5px; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }
s { color: var(--muted-2); }

/* ---------- Shell ---------- */
.shell { display: grid; grid-template-columns: 232px 1fr; height: 100vh; }
.side { background: var(--side); border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
.brand { display: flex; align-items: baseline; gap: 8px; padding: 14px 16px 10px; font-size: 14.5px; font-weight: 600; letter-spacing: -.01em; }
.brand b { font-weight: 600; color: var(--muted); }
.brand-name { font-family: var(--font-brand); font-size: 19px; font-weight: 400; letter-spacing: 0; line-height: 1; color: var(--text); }
.brand-name span { color: var(--logo); }
.nav { flex: 1; overflow-y: auto; padding: 4px 8px 12px; scrollbar-width: thin; }
.nav-sec { font-size: 11px; font-weight: 600; color: var(--muted); letter-spacing: .02em; padding: 14px 10px 4px; }
.nav a { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 10px; border-radius: 6px; color: var(--text-2); font-weight: 500; }
.nav a .ic { color: var(--muted); }
.nav a:hover { background: var(--hover); color: var(--text); }
.nav a.on { background: var(--sel); color: var(--sel-ink); font-weight: 600; }
.nav a.on .ic { color: var(--sel-ink); }
.nav a span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nb { font-size: 11px; font-weight: 600; min-width: 20px; height: 18px; padding: 0 6px; border-radius: 9px; display: grid; place-items: center; background: color-mix(in srgb, var(--warn) 16%, var(--card)); color: color-mix(in srgb, var(--warn) 60%, var(--ink-mix)); }
.side-foot { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-top: 1px solid var(--border); }
.side-foot div { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.side-foot b { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.side-foot span { font-size: 11.5px; color: var(--muted); }
.side-back { display: none; }
.body { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.top { height: 52px; flex: none; display: flex; align-items: center; gap: 12px; padding: 0 20px; border-bottom: 1px solid var(--border); background: var(--card); }
.top-r { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.main { flex: 1; overflow-y: auto; min-height: 0; outline: 0; }
.page { padding: 20px 24px 40px; max-width: 1640px; margin: 0 auto; animation: pageIn .18s ease-out; }
@keyframes pageIn { from { opacity: 0; transform: translateY(3px); } }
.only-sm { display: none; }

/* Global search */
.gsearch { position: relative; flex: 1; max-width: 520px; }
.gsearch label { display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--r); background: var(--bg); color: var(--muted); }
.gsearch label:focus-within { border-color: var(--secondary); background: var(--card); box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 15%, transparent); }
.gsearch input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--text); }
.gres { position: absolute; top: 40px; left: 0; right: 0; background: var(--card); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: var(--sh-2); max-height: 70vh; overflow-y: auto; z-index: 30; padding: 6px; }
.gr-g { font-size: 11px; font-weight: 600; color: var(--muted); padding: 8px 8px 4px; }
.gres a { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 8px; border-radius: 6px; }
.gres a span { display: flex; flex-direction: column; min-width: 0; }
.gres a b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gres a em { font-style: normal; font-size: 12px; color: var(--muted); }
.gres a.on, .gres a:hover { background: var(--hover); }
.gr-empty { padding: 14px; color: var(--muted); }

/* ---------- Page header ---------- */
.ph { margin-bottom: 16px; }
.ph-back { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: 12.5px; margin-bottom: 6px; }
.ph-back:hover { color: var(--text); }
.ph-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ph-t { min-width: 0; flex: 1 1 360px; }
.ph h1 { font-size: 20px; font-weight: 650; letter-spacing: -.02em; line-height: 1.3; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ph p { color: var(--muted); margin-top: 3px; max-width: 860px; }
.ph-a { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ph-a .fbar { margin: 0; }

/* ---------- Buttons ---------- */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: var(--r); font-weight: 550; font-size: 13px; white-space: nowrap; border: 1px solid transparent; transition: background .12s, border-color .12s, box-shadow .12s, transform .06s; position: relative; }
.btn:active:not(:disabled) { transform: translateY(1px); }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-primary { background: var(--action); color: #fff; box-shadow: var(--sh-1); }
.btn-primary:hover:not(:disabled) { background: color-mix(in srgb, var(--action) 88%, black); }
.btn-secondary { background: var(--card); border-color: var(--border); box-shadow: var(--sh-1); }
.btn-secondary:hover:not(:disabled) { background: var(--hover); }
.btn-ghost { color: var(--text-2); }
.btn-ghost:hover:not(:disabled) { background: var(--hover); color: var(--text); }
.btn-danger { background: var(--card); border-color: color-mix(in srgb, var(--error) 35%, var(--border)); color: color-mix(in srgb, var(--error) 85%, var(--ink-mix)); }
.btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--error) 8%, var(--card)); }
.m-f .btn-danger, .ph-a .btn-danger.solid { background: var(--error); color: #fff; border-color: transparent; }
.btn-sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.btn-block { width: 100%; }
.btn.loading { color: transparent !important; pointer-events: none; }
.btn.loading::after { content: ''; position: absolute; width: 14px; height: 14px; border: 2px solid rgb(255 255 255 / .5); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.ibtn { width: 30px; height: 30px; display: inline-grid; place-items: center; border-radius: 6px; color: var(--muted); flex: none; }
.ibtn:hover:not(:disabled) { background: var(--hover); color: var(--text); }
.ibtn:disabled { opacity: .35; cursor: default; }
.lnk { color: var(--link); font-weight: 500; }
.lnk:hover { text-decoration: underline; text-underline-offset: 2px; }
.lnk.sm { font-size: 12px; }

/* Dropdown menus (<details>) */
.menu { position: relative; display: inline-block; }
.menu > summary { list-style: none; cursor: pointer; }
.menu > summary::-webkit-details-marker { display: none; }
.menu[open] > summary { background: var(--hover); }
.menu-pop { position: absolute; top: calc(100% + 4px); left: 0; min-width: 220px; background: var(--card); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: var(--sh-2); padding: 5px; z-index: 40; animation: pop .12s ease-out; }
.menu.right .menu-pop { left: auto; right: 0; }
@keyframes pop { from { opacity: 0; transform: translateY(-3px); } }
.menu-pop button { display: flex; align-items: center; gap: 9px; width: 100%; padding: 7px 9px; border-radius: 6px; text-align: left; font-size: 13px; }
.menu-pop button .ic { color: var(--muted); }
.menu-pop button span { flex: 1; }
.menu-pop button em { font-style: normal; font-size: 11.5px; color: var(--muted); }
.menu-pop button:hover:not(:disabled) { background: var(--hover); }
.menu-pop button:disabled { cursor: default; color: var(--muted); font-size: 12px; }
.menu-pop button.danger { color: color-mix(in srgb, var(--error) 85%, var(--ink-mix)); }
.menu-pop button.danger .ic { color: inherit; }
.menu-pop hr { border: 0; border-top: 1px solid var(--line); margin: 5px 0; }

/* ---------- Status badges + small labels ---------- */
.st { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; border-radius: 11px; font-size: 12px; font-weight: 550; white-space: nowrap; background: color-mix(in srgb, var(--tc) 11%, var(--card)); color: color-mix(in srgb, var(--tc) 62%, var(--ink-mix)); vertical-align: middle; }
.st i { width: 6px; height: 6px; border-radius: 50%; background: var(--tc); flex: none; }
.st em { font-style: normal; font-weight: 400; opacity: .8; }
.st-muted { background: var(--surface-2); color: var(--muted); }
.st-muted i { background: transparent; box-shadow: inset 0 0 0 1.5px var(--muted-2); }
.st-neutral { background: var(--surface-2); color: var(--text-2); }
.ph h1 .st { font-size: 12px; }
.ph h1 .mono { font-size: inherit; letter-spacing: -.02em; }
.pill { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: 5px; font-size: 11.5px; font-weight: 500; background: var(--surface-2); color: var(--text-2); white-space: nowrap; margin-left: 4px; vertical-align: middle; }
.pill.ok { background: color-mix(in srgb, var(--success) 12%, var(--card)); color: color-mix(in srgb, var(--success) 70%, var(--ink-mix)); height: 26px; padding: 0 9px; }
.pill.ok .ic { margin-right: 2px; }
.pill.warn { background: color-mix(in srgb, var(--warn) 14%, var(--card)); color: color-mix(in srgb, var(--warn) 60%, var(--ink-mix)); }
.cnt { display: inline-grid; place-items: center; min-width: 20px; height: 18px; padding: 0 6px; border-radius: 9px; background: var(--surface-2); color: var(--muted); font-size: 11px; font-weight: 600; margin-left: 6px; }
.cnt.alert { background: color-mix(in srgb, var(--warn) 16%, var(--card)); color: color-mix(in srgb, var(--warn) 60%, var(--ink-mix)); }
.age { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 12px; color: color-mix(in srgb, var(--tc) 70%, var(--ink-mix)); }
.prio { display: inline-flex; align-items: center; gap: 2px; font-size: 11.5px; font-weight: 600; }
.prio.p-danger { color: var(--error); } .prio.p-warn { color: var(--warn); } .prio.p-neutral, .prio.p-muted { color: var(--muted); font-weight: 500; }
.role-tag { display: inline-block; font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: 4px; margin-right: 4px; }
.role-tag.customer { background: color-mix(in srgb, var(--info) 10%, var(--card)); color: color-mix(in srgb, var(--info) 65%, var(--ink-mix)); }
.role-tag.provider { background: var(--sel); color: var(--sel-ink); }
.vtag { display: inline-flex; align-items: center; gap: 3px; font-size: 11.5px; font-weight: 600; color: color-mix(in srgb, var(--info) 75%, var(--ink-mix)); vertical-align: middle; }
.rating { display: inline-flex; align-items: center; gap: 3px; font-weight: 600; white-space: nowrap; }
.rating .ic { color: var(--star); }
.stars { color: var(--star); letter-spacing: 1px; white-space: nowrap; }
.stars i { font-style: normal; color: var(--border); }
.yes, .no { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; font-size: 12.5px; }
.yes { color: color-mix(in srgb, var(--success) 75%, var(--ink-mix)); } .no { color: var(--muted); }
.yes.lg, .no.lg { font-size: 13px; }
.warn-t { color: color-mix(in srgb, var(--warn) 75%, var(--ink-mix)) !important; }
.sample { display: inline-block; font-size: 11px; font-weight: 600; color: color-mix(in srgb, var(--accent) 55%, var(--ink-mix)); background: color-mix(in srgb, var(--accent) 14%, var(--card)); padding: 1px 6px; border-radius: 4px; vertical-align: 1px; }
.chips { display: inline-flex; flex-wrap: wrap; gap: 4px; }
.chip { font-size: 11.5px; padding: 1px 7px; border-radius: 4px; background: var(--surface-2); color: var(--text-2); }
.flag-dot { color: var(--warn); margin-left: 6px; vertical-align: -2px; }
.sub { display: block; font-size: 12px; color: var(--muted); margin-top: 1px; font-weight: 400; }
.av { display: inline-grid; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--av) 16%, var(--card)); color: color-mix(in srgb, var(--av) 75%, var(--ink-mix)); font-weight: 650; flex: none; letter-spacing: 0; }
.cat-ic { display: inline-grid; place-items: center; border-radius: 7px; flex: none; }
:root[data-theme="dark"] .cat-ic { filter: saturate(.85) brightness(.9); }
.cellx { display: flex; align-items: center; gap: 10px; min-width: 0; }
.cellx > span { min-width: 0; }

/* ---------- Cards, stats, grids ---------- */
.card { background: var(--card); border: 1px solid var(--border); border-radius: var(--r-lg); box-shadow: var(--sh-1); min-width: 0; }
.card-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 11px 16px; border-bottom: 1px solid var(--line); min-height: 44px; }
.card-h h2 { font-size: 13.5px; font-weight: 600; display: flex; align-items: center; }
.card-b { padding: 14px 16px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 16px; }
.stats.sm { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.stat { background: var(--card); border: 1px solid var(--border); border-radius: var(--r-lg); padding: 11px 14px; display: flex; flex-direction: column; gap: 2px; box-shadow: var(--sh-1); min-width: 0; }
a.stat:hover { border-color: color-mix(in srgb, var(--secondary) 40%, var(--border)); }
.stat-l { font-size: 12px; color: var(--muted); font-weight: 500; }
.stat-v { font-size: 20px; font-weight: 650; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.stat-s { font-size: 11.5px; color: var(--muted); }
.stat.t-warn { border-color: color-mix(in srgb, var(--warn) 35%, var(--border)); }
.stat.t-danger { border-color: color-mix(in srgb, var(--error) 35%, var(--border)); }
.stat.t-warn .stat-v { color: color-mix(in srgb, var(--warn) 75%, var(--ink-mix)); }
.stat.t-danger .stat-v { color: color-mix(in srgb, var(--error) 80%, var(--ink-mix)); }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.grid-main { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; align-items: start; }
.grid-main > aside { position: sticky; top: 0; }
.grid-2.dash { grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); }
.grid-2.eq { margin: 0; }
.page > .card, .page > .tcard { margin-bottom: 16px; }
.page > .card:last-child { margin-bottom: 0; }

/* Key–value lists */
.kv { display: grid; grid-template-columns: minmax(96px, 34%) 1fr; gap: 7px 12px; }
.kv dt { color: var(--muted); font-size: 12.5px; }
.kv dd { min-width: 0; overflow-wrap: anywhere; }
.pre { white-space: pre-wrap; }

/* Callouts */
.callout { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; border-radius: var(--r-lg); margin-bottom: 14px; font-size: 13px; background: color-mix(in srgb, var(--tc) 8%, var(--card)); border: 1px solid color-mix(in srgb, var(--tc) 24%, var(--border)); }
.callout > .ic { color: var(--tc); margin-top: 1px; }
.c-warn { --tc: var(--warn); } .c-danger { --tc: var(--error); } .c-info { --tc: var(--info); } .c-success { --tc: var(--success); }
.golive { display: flex; align-items: center; gap: 10px; padding: 9px 14px; margin-bottom: 12px; border-radius: var(--r-lg); background: var(--sel); color: var(--text-2); font-size: 12.5px; }
.golive .ic { color: var(--sel-ink); } .golive b { color: var(--text); } .golive span { flex: 1; }

/* ---------- Tabs + filters ---------- */
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 12px; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs button { display: inline-flex; align-items: center; height: 36px; padding: 0 10px; font-weight: 500; color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; }
.tabs button:hover { color: var(--text); }
.tabs button.on { color: var(--text); border-bottom-color: var(--secondary); font-weight: 600; }
.fbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.fbar.slim { margin: 8px 10px; }
.fbar-r { margin-left: auto; }
.fsearch { display: flex; align-items: center; gap: 7px; height: 32px; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--r); background: var(--card); color: var(--muted); flex: 0 1 300px; min-width: 180px; }
.fsearch:focus-within, .fsel select:focus { border-color: var(--secondary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 14%, transparent); }
.fsearch input { flex: 1; min-width: 0; border: 0; outline: 0; background: none; color: var(--text); }
.fsel select { height: 32px; padding: 0 28px 0 10px; border: 1px solid var(--border); border-radius: var(--r); background: var(--card) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2.4'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 9px center; appearance: none; outline: 0; max-width: 220px; }

/* ---------- Tables ---------- */
.tcard { overflow: hidden; }
.tscroll { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
.tbl th { text-align: left; font-weight: 500; font-size: 12px; color: var(--muted); padding: 9px 12px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--bg) 55%, var(--card)); white-space: nowrap; }
.th-s { display: inline-flex; align-items: center; gap: 4px; color: inherit; font-weight: inherit; }
.th-s .ic { opacity: .5; } th[aria-sort] .th-s { color: var(--text); } th[aria-sort] .th-s .ic { opacity: 1; }
.tbl td { padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.tbl tr:last-child td { border-bottom: 0; }
.tbl tr.link { cursor: pointer; }
.tbl tbody tr:hover td { background: var(--hover); }
.tbl tr.link:focus-visible { outline-offset: -2px; }
.tbl .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.tbl th.num { text-align: right; } .tbl .c { text-align: center; }
.tbl td.act { text-align: right; white-space: nowrap; } .tbl td.act > * + * { margin-left: 6px; }
.tbl.dense td { padding: 7px 12px; }
.tbl.dense td:first-child { width: 1%; }
.clip { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-width: 380px; }
.rv-t { max-width: 460px; }
.tfoot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; min-height: 42px; }
.pager { display: flex; align-items: center; gap: 4px; }
.matrix td, .matrix th { padding: 7px 10px; }
.perm { display: inline-grid; place-items: center; font-size: 11.5px; font-weight: 600; }
.perm.w { width: 22px; height: 22px; border-radius: 50%; background: var(--sel); color: var(--sel-ink); }
.perm.r { color: var(--text-2); } .perm.n { color: var(--muted-2); }

/* ---------- Empty, error, loading ---------- */
.empty { padding: 36px 20px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--muted); }
.empty > .ic { color: var(--muted-2); margin-bottom: 4px; }
.empty h3 { color: var(--text); font-size: 14px; font-weight: 600; }
.empty p { max-width: 380px; }
.empty .btn { margin-top: 8px; }
.empty.err > .ic { color: var(--error); }
.skel { border-radius: 6px; background: linear-gradient(90deg, var(--surface-2) 0%, var(--hover) 50%, var(--surface-2) 100%); background-size: 200% 100%; animation: sk 1.2s ease-in-out infinite; }
@keyframes sk { from { background-position: 200% 0; } to { background-position: -200% 0; } }

/* ---------- Dashboard ---------- */
.att { list-style: none; padding: 0; }
.att a { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--line); }
.att li:last-child a { border-bottom: 0; }
.att a:hover { background: var(--hover); }
.att-ic { width: 30px; height: 30px; border-radius: 7px; display: grid; place-items: center; background: color-mix(in srgb, var(--tc) 11%, var(--card)); color: var(--tc); flex: none; }
.att-n { font-size: 18px; font-weight: 650; min-width: 26px; font-variant-numeric: tabular-nums; }
.att-t { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.att-t b { font-weight: 500; }
.att-t em { font-style: normal; font-size: 12px; color: var(--muted); }
.att a > .ic:last-child { color: var(--muted-2); }
.chart { margin: 0; }
.chart svg { width: 100%; height: 170px; display: block; overflow: visible; }
.chart .grid { stroke: var(--line); stroke-width: 1; }
.chart .axis { fill: var(--muted); font-size: 10.5px; }
.chart .mark { fill: var(--secondary); }
.chart .hit { fill: transparent; }
.chart .bar:hover .mark { fill: color-mix(in srgb, var(--secondary) 75%, var(--ink-mix)); }
.chart .bar:hover .hit { fill: color-mix(in srgb, var(--secondary) 6%, transparent); }
.tip { position: fixed; z-index: 90; pointer-events: none; background: var(--primary); color: var(--card); font-size: 12px; font-weight: 500; padding: 5px 8px; border-radius: 6px; opacity: 0; transition: opacity .1s; white-space: nowrap; }
.tip.show { opacity: 1; }
.hbars { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.hbars li { display: grid; grid-template-columns: minmax(90px, 38%) 1fr auto; gap: 10px; align-items: center; font-size: 12.5px; }
.hb-l { color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hb-l em { font-style: normal; color: var(--muted); margin-left: 4px; }
.hb-t { height: 8px; border-radius: 4px; background: var(--surface-2); overflow: hidden; }
.hb-t i { display: block; height: 100%; background: var(--secondary); border-radius: 4px; }
.hb-v { font-weight: 600; font-variant-numeric: tabular-nums; min-width: 28px; text-align: right; }
.mini-list { list-style: none; padding: 0; }
.mini-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 16px; border-bottom: 1px solid var(--line); }
.mini-list li:last-child { border-bottom: 0; }
.mini-list a { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.mini-list li:has(> a):hover { background: var(--hover); }
.mini-list li > span:not(.st):not(.num):not(.muted), .mini-list a > span:not(.st):not(.pill) { min-width: 0; display: flex; flex-direction: column; }
.mini-list b .pill { margin-left: 6px; }
.mini-list .cellx { flex-direction: row; }
.mini-list b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini-list em { font-style: normal; font-size: 12px; color: var(--muted); }
.mini-list.tight li { padding: 7px 0; }
.card-b > .mini-list.tight { margin-top: 10px; border-top: 1px solid var(--line); }

/* ---------- Detail pages ---------- */
.tl { list-style: none; padding: 0; position: relative; }
.tl li { position: relative; padding: 0 0 14px 22px; }
.tl li:last-child { padding-bottom: 0; }
.tl li::before { content: ''; position: absolute; left: 5px; top: 14px; bottom: -2px; width: 1.5px; background: var(--line); }
.tl li:last-child::before { display: none; }
.tl-dot { position: absolute; left: 0; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: var(--card); border: 2.5px solid var(--tc, var(--muted-2)); }
.tl li.info .tl-dot { border-width: 1.5px; width: 10px; height: 10px; left: 1px; top: 5px; }
.tl-h { display: flex; justify-content: space-between; gap: 10px; }
.tl-h b { font-weight: 600; font-size: 13px; }
.tl li.info .tl-h b { font-weight: 500; }
.tl-h time { font-size: 11.5px; color: var(--muted); white-space: nowrap; }
.tl p { color: var(--text-2); font-size: 12.5px; margin-top: 1px; }
.tl-by { font-size: 11.5px; color: var(--muted); }
.bill { display: flex; flex-direction: column; }
.brow { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; font-variant-numeric: tabular-nums; }
.brow.em { border-top: 1px dashed var(--border); margin-top: 4px; padding-top: 8px; color: var(--muted); }
.brow.extra { color: color-mix(in srgb, var(--warn) 75%, var(--ink-mix)); }
.brow.total { border-top: 1px solid var(--border); margin-top: 4px; padding-top: 8px; font-weight: 650; font-size: 14px; }
.bill-note { display: flex; gap: 6px; align-items: flex-start; margin-top: 8px; font-size: 12.5px; color: var(--text-2); }
.bill-note.warn { color: color-mix(in srgb, var(--warn) 75%, var(--ink-mix)); }
.bill-note .ic { margin-top: 2px; }
.thumbs { display: flex; gap: 8px; flex-wrap: wrap; }
.thumb { width: 54px; height: 54px; border-radius: 8px; background: var(--surface-2); color: var(--muted); display: grid; place-items: center; position: relative; }
.thumb.lg { width: 88px; height: 70px; }
.thumb em { position: absolute; right: 5px; bottom: 3px; font-style: normal; font-size: 10.5px; font-weight: 600; opacity: .7; }
.notes { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.notes li { padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--warn) 7%, var(--card)); border: 1px solid color-mix(in srgb, var(--warn) 18%, var(--border)); }
.notes span { font-size: 11.5px; color: var(--muted); }
.quote { padding-left: 10px; border-left: 2px solid var(--border); color: var(--text-2); }
.thread { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.thread li { padding: 8px 10px; border-radius: 8px; background: var(--surface-2); }
.thread li.sys { background: transparent; border: 1px dashed var(--border); }
.th-h { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; }
.th-h time { color: var(--muted); }
.composer { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
textarea, .fld input, .fld select, .add-row input, .add-row select, .li-row input { width: 100%; border: 1px solid var(--border); border-radius: var(--r); background: var(--card); padding: 7px 10px; outline: 0; transition: border-color .12s, box-shadow .12s; }
textarea { resize: vertical; min-height: 38px; }
.fld input[type=color] { height: 36px; padding: 3px; cursor: pointer; }
textarea:focus, .fld input:focus, .fld select:focus, .add-row input:focus, .add-row select:focus, .li-row input:focus { border-color: var(--secondary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 14%, transparent); }
.fld input:disabled, .fld select:disabled, textarea:disabled { background: var(--surface-2); color: var(--muted); }
.checks { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.checks li { display: flex; gap: 8px; align-items: flex-start; }
.checks li.ok .ic { color: var(--success); } .checks li.bad { color: color-mix(in srgb, var(--error) 80%, var(--ink-mix)); font-weight: 500; } .checks li.bad .ic { color: var(--error); } .checks li.na .ic { color: var(--info); }
.why { padding-left: 18px; margin-top: 6px; color: var(--text-2); }
.revs { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.revs p { margin-top: 2px; } .revs em { font-style: normal; font-size: 11.5px; color: var(--muted); }
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; }
.switch-row span { display: flex; flex-direction: column; }
.switch-row em { font-style: normal; font-size: 12px; color: var(--muted); }
input[role=switch] { appearance: none; width: 34px; height: 20px; border-radius: 10px; background: color-mix(in srgb, var(--border) 70%, var(--muted)); position: relative; cursor: pointer; flex: none; transition: background .15s; margin: 0; }
input[role=switch]::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgb(0 0 0 / .25); transition: transform .15s; }
input[role=switch]:checked { background: var(--action); }
input[role=switch]:checked::after { transform: translateX(14px); }
input[role=switch]:disabled { opacity: .5; cursor: not-allowed; }
.sw { display: inline-flex; vertical-align: middle; }

/* Verification */
.docs { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; }
.docs figure { margin: 0; }
.docs figcaption { font-size: 12px; color: var(--muted); margin-top: 6px; }
.idcard { width: 100%; height: auto; display: block; border-radius: 12px; }
.id-bg { fill: color-mix(in srgb, var(--info) 6%, var(--card)); stroke: var(--border); }
.id-band { fill: color-mix(in srgb, var(--info) 22%, var(--card)); }
.id-ph { fill: var(--surface-2); stroke: var(--border); }
.id-fg { fill: color-mix(in srgb, var(--muted) 45%, var(--card)); }
.id-h { font-size: 11px; font-weight: 700; fill: color-mix(in srgb, var(--info) 70%, var(--ink-mix)); letter-spacing: .06em; }
.id-l { font-size: 9.5px; fill: var(--muted); }
.id-v { font-size: 13px; font-weight: 600; fill: var(--text); }
.vchk { display: flex; flex-direction: column; gap: 9px; }
.vchk label, .radios label, .chk { display: flex; align-items: center; gap: 8px; cursor: pointer; }
input[type=checkbox]:not([role]), input[type=radio] { width: 15px; height: 15px; accent-color: var(--action); margin: 0; flex: none; }

/* Moderation */
.flags { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.flags li { display: flex; gap: 12px; padding: 12px 14px; align-items: flex-start; }
.fl-ic { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; background: color-mix(in srgb, var(--warn) 12%, var(--card)); color: var(--warn); flex: none; }
.fl-b { flex: 1; min-width: 0; }
.fl-h { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fl-h time { margin-left: auto; font-size: 12px; color: var(--muted); }
.flags blockquote { margin: 8px 0 6px; padding: 7px 10px; border-radius: 6px; background: var(--surface-2); color: var(--text-2); font-size: 12.5px; }
.fl-m { font-size: 12px; color: var(--muted); }
.fl-a { display: flex; gap: 6px; flex: none; }

/* ---------- Support inbox ---------- */
.inbox { display: grid; grid-template-columns: 380px minmax(0, 1fr); border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--card); height: calc(100vh - 52px - 40px - 70px); min-height: 480px; overflow: hidden; box-shadow: var(--sh-1); }
.inbox.full { height: calc(100vh - 52px - 40px); }
.inbox-l { border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; }
.inbox-tabs .tabs { padding: 0 8px; margin: 0; }
.inbox-tabs .tabs button { padding: 0 7px; font-size: 12.5px; }
.tlist { list-style: none; padding: 0; overflow-y: auto; flex: 1; }
.tlist a { display: flex; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--line); border-left: 2px solid transparent; }
.tlist a:hover { background: var(--hover); }
.tlist a.on { background: var(--sel); border-left-color: var(--secondary); }
.tl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.tl-top { display: flex; align-items: center; gap: 6px; }
.tl-top b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tlist a.unread .tl-top b, .tlist a.unread .tl-sub { font-weight: 650; }
.tl-top time { margin-left: auto; font-size: 11.5px; color: var(--muted); }
.tl-sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tl-prev { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tl-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 3px; }
.tl-meta .st { height: 20px; font-size: 11.5px; }
.inbox-r { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.inbox-r > .empty { margin: auto; }
.conv-h { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.conv-t { flex: 1 1 260px; min-width: 0; }
.conv-t h1 { font-size: 15px; font-weight: 650; }
.conv-t p { font-size: 12px; color: var(--muted); }
.conv-a { display: flex; gap: 6px; flex-wrap: wrap; }
.conv-a .btn { height: 30px; }
.conv-ctx { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 16px; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--bg) 60%, var(--card)); font-size: 12.5px; }
.conv-ctx > span:not(.av):not(.vtag) { color: var(--muted); }
.linked { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px 2px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--card); }
.linked:hover { border-color: var(--secondary); }
.inbox-r > .callout { margin: 10px 16px 0; }
.msgs { list-style: none; padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1; }
.msgs.in-modal { padding: 4px 0 12px; max-height: 50vh; }
.msgs li { display: flex; flex-direction: column; max-width: 78%; }
.bubble { padding: 9px 12px; border-radius: 12px; background: var(--surface-2); white-space: pre-wrap; overflow-wrap: anywhere; }
.m-user { align-self: flex-start; } .m-user .bubble { border-bottom-left-radius: 4px; }
.m-admin { align-self: flex-end; align-items: flex-end; } .m-admin .bubble { background: var(--sel); border-bottom-right-radius: 4px; }
.m-note { align-self: flex-end; align-items: flex-end; } .m-note .bubble { background: color-mix(in srgb, var(--warn) 10%, var(--card)); border: 1px dashed color-mix(in srgb, var(--warn) 40%, var(--border)); }
.m-tag { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: color-mix(in srgb, var(--warn) 70%, var(--ink-mix)); margin-bottom: 2px; }
.m-meta { font-size: 11.5px; color: var(--muted); margin-top: 3px; }
.m-sys { align-self: center !important; max-width: 90% !important; font-size: 11.5px; color: var(--muted); text-align: center; }
.reply { border-top: 1px solid var(--line); padding: 10px 16px 12px; display: flex; flex-direction: column; gap: 8px; }
.reply-tabs { display: flex; align-items: center; gap: 4px; }
.reply-tabs > button { white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: 6px; font-weight: 500; color: var(--muted); font-size: 12.5px; }
.reply-tabs > button.on { background: var(--surface-2); color: var(--text); font-weight: 600; }
.reply-tabs .menu { margin-left: auto; }
.reply-tabs .menu .btn { height: 28px; font-size: 12.5px; }
.reply textarea.note { background: color-mix(in srgb, var(--warn) 6%, var(--card)); }
.reply-f { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.reply-f .ferr { margin-right: auto; }

/* ---------- Forms, modal, toast ---------- */
.fld { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; border: 0; padding: 0; min-width: 0; }
.fld > span, .fld > legend, .lbl { font-size: 12.5px; font-weight: 550; color: var(--text-2); padding: 0; }
.lbl { display: block; margin-bottom: 6px; }
.fld i { font-style: normal; font-weight: 400; color: var(--muted); }
.fld.inline { flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--line); margin: 0; }
.fld.inline > span:first-child { display: flex; flex-direction: column; }
.fld.inline em { font-style: normal; font-weight: 400; font-size: 12px; color: var(--muted); }
.fld.inline input { width: auto; }
.req { color: var(--error); font-weight: 600; }
.fe, .ferr { color: color-mix(in srgb, var(--error) 85%, var(--ink-mix)); font-size: 12.5px; display: flex; align-items: center; gap: 5px; }
.ferr:empty { display: none; }
.fld input[aria-invalid] { border-color: var(--error); }
.frow { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0 12px; }
.radios { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.radios.col { flex-direction: column; gap: 8px; }
.radios em { font-style: normal; color: var(--muted); font-size: 12px; }
.radios label.dis { color: var(--muted); cursor: not-allowed; }
.prefix { display: flex; align-items: stretch; }
.prefix i { display: grid; place-items: center; padding: 0 9px; border: 1px solid var(--border); border-right: 0; border-radius: var(--r) 0 0 var(--r); background: var(--surface-2); color: var(--muted); font-style: normal; }
.prefix input { border-radius: 0 var(--r) var(--r) 0 !important; }
.hint { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); margin: -4px 0 12px; }
.modal { position: fixed; inset: 0; z-index: 80; display: none; }
.modal.open { display: grid; place-items: center; padding: 16px; }
.m-back { position: absolute; inset: 0; background: var(--overlay); animation: fade .15s; }
@keyframes fade { from { opacity: 0; } }
.m-box { position: relative; width: 100%; max-width: 500px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--sh-2); animation: mIn .16s ease-out; }
.m-box.wide { max-width: 860px; }
@keyframes mIn { from { opacity: 0; transform: translateY(6px) scale(.99); } }
.m-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px 10px; }
.m-h h2 { font-size: 15px; font-weight: 650; }
.m-b { padding: 4px 18px 8px; overflow-y: auto; }
.m-msg { color: var(--text-2); margin-bottom: 14px; }
.m-f { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--line); }
.toast { position: fixed; left: 50%; bottom: 20px; transform: translate(-50%, 20px); z-index: 95; display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 10px; background: var(--primary); color: var(--card); box-shadow: var(--sh-2); font-weight: 500; opacity: 0; pointer-events: none; transition: opacity .18s, transform .18s; max-width: calc(100vw - 32px); }
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.toast.ok .ic { color: color-mix(in srgb, var(--success) 70%, white); }
.toast.err .ic { color: color-mix(in srgb, var(--error) 70%, white); }
:root[data-theme="dark"] .toast, :root[data-theme="dark"] .tip { background: #F1F5F9; color: #0B0F17; }

/* ---------- Catalogue + content ---------- */
.sortable { list-style: none; padding: 0; }
.sortable li { display: flex; align-items: center; gap: 12px; padding: 9px 14px; border-bottom: 1px solid var(--line); }
.sortable li:last-child { border-bottom: 0; }
.sortable li.off .so-m, .sortable li.off .cat-ic, .sortable li.off .av { opacity: .55; }
.ord { display: flex; flex-direction: column; margin: -4px 0; }
.ord .ibtn { width: 22px; height: 18px; }
.so-m { flex: 1; min-width: 0; }
.so-m b { font-weight: 550; }
.so-n { font-size: 12px; color: var(--muted); white-space: nowrap; }
.so-a { display: flex; align-items: center; gap: 4px; }
.sortable.faq .sub { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.add-row { display: flex; gap: 8px; align-items: center; padding: 12px 14px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.add-row input, .add-row select { flex: 1; min-width: 180px; width: auto; height: 32px; }
.add-row .ferr { flex-basis: 100%; }
.li-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.li-row input { flex: 1; }
.split { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 16px; align-items: start; }
.subnav { display: flex; flex-direction: column; gap: 1px; position: sticky; top: 0; }
.subnav button { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; border-radius: 6px; text-align: left; color: var(--text-2); font-weight: 500; }
.subnav button:hover { background: var(--hover); }
.subnav button.on { background: var(--sel); color: var(--sel-ink); font-weight: 600; }
.subnav em { font-style: normal; font-size: 11.5px; color: var(--muted); }
.grid-form { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
.split-form { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 20px; }
.cat-prev { display: flex; align-items: center; gap: 10px; height: 44px; font-weight: 550; }
.phone-prev { background: var(--bg); border: 1px solid var(--border); border-radius: 14px; padding: 12px; max-width: 320px; position: relative; }
.pp-h { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 10px; }
.pp-h span { color: var(--link); font-weight: 600; font-size: 12px; }
.pp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 4px; }
.pp-grid > span { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.pp-grid em { font-style: normal; font-size: 10.5px; color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70px; }
.banners { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.banners li { display: grid; grid-template-columns: 300px minmax(0, 1fr) auto; gap: 16px; padding: 12px; align-items: center; }
.bn-a { display: flex; align-items: center; gap: 4px; }
.bn-m .menu > summary.btn { height: 30px; padding: 0 8px 0 4px; gap: 4px; }
.bn-m .menu > summary .st { height: 22px; }
.bn-m .menu-pop { min-width: 290px; }
.bn-m .menu-pop button span { white-space: nowrap; }
.bnr { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 12px; color: #fff; position: relative; overflow: hidden; min-height: 108px; }
.bnr.cust { background: linear-gradient(120deg, #0D9488, #2563EB); }
.bnr.earn { background: linear-gradient(130deg, #0D9488, #5EC9BF 130%); }
.bnr.prov { background: linear-gradient(130deg, #101828, #0D9488); }
.bnr > div { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.bnr-k { font-size: 10px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; opacity: .85; }
.bnr b { font-size: 14px; line-height: 1.3; }
.bnr-cta { align-self: flex-start; margin-top: 4px; background: #fff; color: #101828; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 6px; }
.bnr-art { width: 54px; height: 54px; border-radius: 50%; background: rgb(255 255 255 / .16); display: grid; place-items: center; flex: none; }
.bnr-seg { position: absolute; z-index: 2; top: 20px; left: 26px; display: flex; gap: 4px; width: 50px; }
.bnr-seg i { flex: 1; height: 3px; border-radius: 2px; background: rgb(255 255 255 / .4); }
.bnr-seg i.on { background: #fff; }
.phone-prev .bnr { padding-top: 22px; }
.notif-prev { display: flex; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--surface-2); align-items: flex-start; }
.notif-prev > div { flex: 1; min-width: 0; }
.notif-prev p { font-size: 12.5px; color: var(--text-2); }
.notif-prev time { font-size: 11px; color: var(--muted); }
.np-ic { flex: none; }
.reach { margin-top: 14px; padding: 12px; border-radius: 10px; border: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; }
.reach b { font-size: 20px; font-weight: 650; }
.reach span { font-size: 12px; color: var(--muted); }

/* Banner editor */
.segc { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border-radius: var(--r); background: var(--surface-2); }
.segc label { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 6px; cursor: pointer; font-weight: 500; color: var(--text-2); }
.segc label.on { background: var(--card); color: var(--text); box-shadow: var(--sh-1); font-weight: 600; }
.segc input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.segc label:focus-within { outline: 2px solid var(--focus); outline-offset: 1px; }
.segc.sm label { height: 26px; padding: 0 10px; font-size: 12.5px; }
.opt-cards.four { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.opt-cards.four b { display: flex; align-items: center; gap: 6px; }
.upload { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1.5px dashed var(--border); border-radius: var(--r-lg); margin-bottom: 12px; }
.upload > .ic { color: var(--muted); }
.upload.has { border-style: solid; }
.upload img { width: 128px; aspect-ratio: 3.2 / 1; object-fit: cover; border-radius: 6px; flex: none; }
.up-m { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; }
.up-m span { color: var(--muted); display: flex; align-items: center; gap: 4px; }
.upload label.btn { cursor: pointer; }
.aud { list-style: none; padding: 0; margin-top: 12px; border: 1px solid var(--border); border-radius: var(--r-lg); }
.aud li { padding: 10px 12px; border-bottom: 1px solid var(--line); }
.aud li:last-child { border-bottom: 0; }
.aud li.on { background: color-mix(in srgb, var(--sel) 50%, var(--card)); }
.aud-c { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.aud-a { margin: 8px 0 0 25px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.chip.tog { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border: 1px solid var(--border); background: var(--card); cursor: pointer; font-size: 12.5px; }
.chip.tog.on { background: var(--sel); border-color: var(--secondary); color: var(--sel-ink); font-weight: 600; }
.chip.off { text-decoration: line-through; opacity: .6; }
.bnr.img { padding: 0; aspect-ratio: 3.2 / 1; min-height: 0; background: var(--surface-2); }
.bnr.img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bnr.img.empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--muted); border: 1.5px dashed var(--border); font-size: 12px; }
.bn-name { font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 320px; }
.bn-warn { display: flex; align-items: center; gap: 5px; margin-top: 6px; font-size: 12px; color: color-mix(in srgb, var(--warn) 75%, var(--ink-mix)); }
.clip1 { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.bn-ed aside .kv { grid-template-columns: 92px 1fr; }
/* City editor */
.ll { display: flex; align-items: center; gap: 4px; } .ll input { flex: 1; }
.area-grid { display: grid; grid-template-columns: minmax(0, 1.3fr) 90px minmax(0, 1.4fr) 44px 30px; gap: 6px 8px; align-items: center; margin-bottom: 8px; }
.area-grid > span:not(.ibtn) { font-size: 11.5px; color: var(--muted); font-weight: 500; }
.area-grid input:not([type=checkbox]) { width: 100%; height: 32px; border: 1px solid var(--border); border-radius: var(--r); background: var(--card); padding: 0 8px; outline: 0; }
.area-grid input:not([type=checkbox]):focus { border-color: var(--secondary); box-shadow: 0 0 0 3px color-mix(in srgb, var(--secondary) 14%, transparent); }
.geo-plot + p { margin-top: 8px; }
.geo-plot svg { width: 100%; height: auto; display: block; }
.geo-bg { fill: var(--bg); stroke: var(--border); }
.geo-ring { fill: none; stroke: var(--border); stroke-dasharray: 4 4; }
.geo-c { fill: var(--secondary); }
.geo-a { fill: var(--info); stroke: var(--card); stroke-width: 2; }
.geo-n { font-size: 9px; font-weight: 700; fill: #fff; }
.geo-list { list-style: none; padding: 0; margin-top: 8px; display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
.geo-list li { display: flex; align-items: center; gap: 7px; }
.geo-list i { width: 16px; height: 16px; border-radius: 50%; background: var(--info); color: #fff; font-style: normal; font-size: 9.5px; font-weight: 700; display: grid; place-items: center; flex: none; }
.geo-list li.ctr i { background: var(--secondary); width: 10px; height: 10px; margin: 0 3px; }
.geo-list span { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; }
.geo-list li.far, .geo-list li.far span { color: var(--error); font-weight: 600; } .geo-list li.far i { background: var(--error); }
.bn-m .kv { grid-template-columns: 76px minmax(0, 1fr); }
.far .geo-a { fill: var(--error); } .far .geo-t { fill: var(--error); font-weight: 600; }
.geo-t { font-size: 9.5px; fill: var(--text-2); } .geo-t.b { font-weight: 700; fill: var(--text); } .geo-t.m { fill: var(--muted); }
.geo-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 40px 16px; text-align: center; color: var(--muted); border: 1px dashed var(--border); border-radius: 10px; font-size: 12.5px; }
.ll-link { display: inline-flex; align-items: center; gap: 4px; color: var(--link); }
@media screen and (max-width: 1100px) { .opt-cards.four { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media screen and (max-width: 720px) { .area-grid { grid-template-columns: 1fr 80px; } .area-grid > span:not(.ibtn) { display: none; } .opt-cards.four { grid-template-columns: 1fr; } }

/* ---------- Settings ---------- */
.settings { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding-bottom: 60px; }
.settings > .card:first-child { grid-column: 1 / -1; }
.opt-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.opt-card { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border: 1px solid var(--border); border-radius: var(--r-lg); cursor: pointer; position: relative; }
.opt-card:hover { border-color: color-mix(in srgb, var(--secondary) 40%, var(--border)); }
.opt-card.on { border-color: var(--secondary); background: var(--sel); box-shadow: 0 0 0 1px var(--secondary); }
.opt-card input { margin-top: 2px; }
.opt-card > span:not(.pill) { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.opt-card em { font-style: normal; font-size: 12px; color: var(--muted); }
.opt-card .pill { position: absolute; top: 10px; right: 10px; }
.savebar { position: sticky; bottom: 12px; display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--sh-2); margin-top: -40px; }
.savebar > span:first-child { flex: 1; min-width: 0; font-weight: 500; }
.tones { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 16px; }
.tones div { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.tones em { font-style: normal; font-size: 12px; color: var(--muted); }
.lifecycle { display: flex; flex-direction: column; gap: 10px; }
.lc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.lc-l { width: 96px; font-weight: 600; font-size: 12.5px; }
.lc-row .ic { color: var(--muted); }
.grid-2 > .card .tbl td { vertical-align: top; }

/* ---------- App updates (OTA) ---------- */
.ota-ch .card-h .cnt { margin-left: 8px; }
.ota-slots { list-style: none; padding: 0; display: flex; flex-direction: column; }
.ota-slots li { display: flex; gap: 12px; align-items: flex-start; padding: 9px 0; border-top: 1px solid var(--line); }
.ota-p { display: inline-flex; align-items: center; gap: 6px; width: 84px; flex: none; font-weight: 600; font-size: 12.5px; }
.ota-p .ic { color: var(--muted); }
.ota-l { min-width: 0; flex: 1; overflow-wrap: anywhere; }
.steps { padding-left: 20px; display: flex; flex-direction: column; gap: 12px; }
.steps pre { margin-top: 6px; padding: 8px 10px; background: var(--surface-2); border-radius: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }

/* ---------- Login ---------- */
.login { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; gap: 16px; }
.login-card { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 24px; box-shadow: var(--sh-2); display: flex; flex-direction: column; }
.login-card .brand { padding: 0 0 18px; }
.login-card .brand-name { font-size: 22px; }
.login-card h1 { font-size: 18px; font-weight: 650; letter-spacing: -.01em; }
.login-card > p.muted { margin: 2px 0 18px; }
.login-card .btn-block { height: 36px; margin-top: 4px; }
.login-card .btn-ghost { margin-top: 6px; }
.login-foot { font-size: 12px; color: var(--muted); max-width: 380px; text-align: center; }

/* ---------- Onboarding (first sign-in of an invited admin) ---------- */
.onb-card { max-width: 460px; }
.onb-count { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.onb-steps { list-style: none; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 20px; padding: 0; }
.onb-steps li { height: 4px; border-radius: 2px; background: var(--border); }
.onb-steps li.done, .onb-steps li.on { background: var(--secondary); }
.onb-access { display: flex; flex-direction: column; gap: 12px; margin-top: 4px; }
.onb-access b { font-size: 12.5px; font-weight: 550; color: var(--text-2); }
.onb-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
.onb-tags .pill { margin: 0; }
.onb-list { list-style: none; display: flex; flex-direction: column; gap: 14px; margin-top: 4px; padding: 0; }
.onb-list li { display: flex; gap: 12px; align-items: flex-start; }
.onb-list .ic { color: var(--secondary); margin-top: 2px; }
.onb-list b { display: block; font-weight: 600; }
.onb-list span:not(.ic) { font-size: 12.5px; color: var(--muted); }
.onb-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 18px; }
.onb-foot .btn { height: 36px; }
.onb-foot .btn-ghost { margin-top: 0; }

/* ---------- Responsive ---------- */
@media screen and (max-width: 1280px) { .hide-md { display: none; } .grid-main { grid-template-columns: minmax(0, 1fr) 300px; } }
@media screen and (max-width: 1100px) {
  .grid-main, .grid-2.dash, .grid-3 { grid-template-columns: minmax(0, 1fr); }
  .grid-main > aside { position: static; }
  .inbox { grid-template-columns: 320px minmax(0, 1fr); }
  .opt-cards { grid-template-columns: 1fr; }
  .banners li { grid-template-columns: 260px minmax(0, 1fr); } .bn-a { grid-column: 1 / -1; justify-content: flex-end; }
}
@media screen and (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .side { position: fixed; inset: 0 auto 0 0; width: 260px; z-index: 60; transform: translateX(-100%); transition: transform .2s; box-shadow: var(--sh-2); }
  body.nav-open .side { transform: none; }
  body.nav-open .side-back { display: block; position: fixed; inset: 0; z-index: 55; background: var(--overlay); }
  .only-sm { display: inline-grid; }
  a.only-sm { display: inline-flex; }
  .top { padding: 0 12px; gap: 8px; }
  .gsearch kbd { display: none; }
  .page { padding: 16px 16px 32px; }
  .grid-2, .settings, .split, .split-form, .grid-form, .docs { grid-template-columns: minmax(0, 1fr); }
  .subnav { flex-direction: row; overflow-x: auto; position: static; }
  .subnav button { white-space: nowrap; }
  .inbox, .inbox.full { grid-template-columns: 1fr; height: auto; min-height: 0; overflow: visible; border: 0; background: none; box-shadow: none; }
  .inbox-l { border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--card); overflow: hidden; }
  .inbox.sel .inbox-l, .inbox .inbox-r.hide-sm { display: none; }
  .inbox.sel .inbox-r { border: 1px solid var(--border); border-radius: var(--r-lg); background: var(--card); overflow: hidden; }
  .msgs { max-height: none; overflow: visible; }
  .msgs li { max-width: 92%; }
}
@media screen and (max-width: 720px) {
  .hide-sm { display: none; }
  .ph h1 { font-size: 18px; }
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat-v { font-size: 18px; }
  .fsearch { flex: 1 1 100%; }
  .fsel { flex: 1 1 calc(50% - 4px); } .fsel select { max-width: none; width: 100%; }
  /* Tables become cards on phones. */
  .tbl:not(.matrix):not(.dense) thead { display: none; }
  .tbl:not(.matrix):not(.dense), .tbl:not(.matrix):not(.dense) tbody, .tbl:not(.matrix):not(.dense) tr { display: block; }
  .tbl:not(.matrix):not(.dense) tr { padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .tbl:not(.matrix):not(.dense) td { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 3px 0; border: 0; text-align: right; }
  .tbl:not(.matrix):not(.dense) td::before { content: attr(data-label); color: var(--muted); font-size: 12px; text-align: left; flex: none; }
  .tbl:not(.matrix):not(.dense) td:first-child { display: block; text-align: left; padding-bottom: 6px; }
  .tbl:not(.matrix):not(.dense) td:first-child::before { display: none; }
  .tbl:not(.matrix):not(.dense) td > .cellx { justify-content: flex-end; }
  .tbl td.act { justify-content: flex-end !important; }
  .tbl td.act::before { display: none; }
  .tbl tbody tr:hover td { background: none; }
  .banners li { grid-template-columns: 1fr; }
  .flags li { flex-wrap: wrap; } .fl-a { width: 100%; justify-content: flex-end; }
  .tones { grid-template-columns: 1fr 1fr; }
  .kv { grid-template-columns: 1fr; gap: 1px; } .kv dd { margin-bottom: 7px; }
  .fld.inline { flex-direction: column; align-items: stretch; gap: 6px; }
  .savebar { flex-wrap: wrap; }
  .m-box { max-height: calc(100vh - 16px); }
  .modal.open { padding: 8px; place-items: end center; }
  .gsearch input::placeholder { color: transparent; }
  .top-r .pill { display: none; }
  .ota-slots li { flex-direction: column; gap: 2px; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }

/* ---------- Print / Save as PDF (Share → Download PDF) ----------
 * A4, light theme, no navigation or controls, every table row and column. */
.print-head { display: none; }
@media print {
  @page { size: A4; margin: 12mm; }
  :root, :root[data-theme="dark"] {
    --primary: #101828; --secondary: #0D9488; --bg: #FFFFFF; --card: #FFFFFF; --side: #FFFFFF; --text: #111827; --muted: #64748B; --border: #E4E7EC;
    --success: #16A34A; --error: #DC2626; --info: #2563EB; --warn: #D97706; --ink-mix: black; --tint: 9%;
    --action: color-mix(in srgb, var(--secondary) 86%, black); --sh-1: none; --sh-2: none; color-scheme: light;
  }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; animation: none !important; transition: none !important; }
  html, body { height: auto; background: #fff; font-size: 11.5px; }
  .side, .top, .side-back, .ph-a, .ph-back, .fbar, .pager, .menu, .ibtn, .btn, .toast, .tip, .modal, .card-h .lnk, .att a > .ic:last-child, .th-s .ic, .flag-dot { display: none !important; }
  .shell { display: block; height: auto; }
  .body, .main { display: block; overflow: visible; height: auto; }
  .page { padding: 0; max-width: none; }
  .print-head { display: flex; align-items: center; gap: 10px; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 2px solid #0D9488; font-size: 10.5px; color: #64748B; }
  .print-head b { display: block; font-size: 15px; color: #111827; }
  .print-head .ph-stamp { margin-left: auto; text-align: right; max-width: 45%; }
  .ph { margin-bottom: 10px; } .ph h1 { font-size: 17px; } .ph p { font-size: 11px; }
  .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
  .stat { padding: 8px 10px; break-inside: avoid; } .stat-v { font-size: 16px; }
  .grid-2, .grid-2.dash, .grid-main { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
  .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
  .card { break-inside: avoid; box-shadow: none; }
  .tcard, .tscroll, .card:has(.tbl) { overflow: visible; break-inside: auto; }
  .tbl { font-size: 10.5px; } .tbl th, .tbl td { padding: 5px 8px; }
  .tbl thead { display: table-header-group; } .tbl tr { break-inside: avoid; }
  .tbl .hide-md, .tbl .hide-sm { display: table-cell !important; }
  .tbl tbody tr:hover td { background: none; }
  .chart svg { height: 140px; }
  a { color: inherit !important; text-decoration: none !important; }
  .empty { padding: 16px; }
  .hb-l, .mini-list b, .clip1 { white-space: normal; overflow: visible; text-overflow: clip; }
  .hbars li { grid-template-columns: minmax(120px, 46%) 1fr auto; }
}
```

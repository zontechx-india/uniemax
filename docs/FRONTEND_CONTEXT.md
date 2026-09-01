# Frontend Context — White-Label E-Commerce Platform

> Engineering reference for the frontend. Read alongside [CONTEXT.md](./CONTEXT.md)
> (product spec), [BACKEND_CONTEXT.md](./BACKEND_CONTEXT.md), and [API.md](./API.md).

---

## Core Principle — Two Apps, One Repo

The frontend ships **two completely separate applications** — two HTML
entries, two bundles, one origin:

| App        | Served at        | Audience                | API surface           |
| ---------- | ---------------- | ----------------------- | --------------------- |
| Storefront | `/` (everything else) | Customers & sellers | `/api/v1/...`         |
| Admin      | **`/admin`**     | UnieMax platform staff | `/api/v1/admin/...`   |

This mirrors the backend, which already splits its routes into a public
(customer) subtree and an `/admin` subtree (see [BACKEND_CONTEXT.md](./BACKEND_CONTEXT.md)).

**Why separate builds:**

- **Security** — admin code, routes, and views never ship in the bundle a
  customer downloads. `admin.html` is only fetched by someone who asked for
  `/admin`.
- **Isolation** — a change to the admin console cannot break the storefront and
  vice versa. They share the token layer (`src/index.css`) and `src/shared/`,
  and nothing else.
- **Deployment** — the `/admin` path can be cached and access-controlled
  independently (WAF / IP allow-list at the edge) on top of the backend's
  `requireAdmin` guard.

**Why one origin rather than an `admin.` sub-domain** (the earlier plan): the
API's auth cookies are same-origin, so a second origin would need CORS +
`SameSite=None` and a second TLS certificate for no security gain — the
bundle separation is what keeps admin code off a customer's machine, not the
hostname. The sub-domain form still resolves in dev for old bookmarks.

---

## Current Status — Auth Wired to the Real Backend

The separation infrastructure is fully wired, and each app renders a
**login page** with a **Facebook-style split-screen layout** (light theme,
minimal, professional):

- **Laptop / desktop (lg ≥ 1024px)** — two columns: a full-height marketing
  **hero** on the left (background image `public/auth_hero_1.jpg` with a dark
  legibility overlay) and the **login panel** on the right.
- **Tablet / mobile (< lg)** — the hero is hidden and the login panel is
  centered full-width. Mobile-first and overflow-safe.

The shared primitives live in `src/shared/ui/form.tsx` (`AuthLayout`, `Hero`,
`AuthCard`, `TextField`, `SegmentedTabs`, buttons, notes, icons); each app
supplies its own hero.

### Real auth integration (web profile — httpOnly cookies)

Auth talks to the live backend (`package/auth`) via `src/shared/auth/`:

| File | Purpose |
| ---- | ------- |
| `http.ts`    | Axios client: `withCredentials`, echoes the surface's CSRF cookie in `X-CSRF-Token` on mutations (`um_admin_csrf` for `/api/v1/admin/**`, `csrf_token` otherwise — chosen from the request URL, so no boot-time initialisation has to be respected), normalizes the error envelope into `ApiError` |
| `authApi.ts` | Typed endpoints: `customerAuth` (register, login, google, requestOtp/verifyOtp, forgot/resetPassword, linkRequest/linkVerify, me, refresh, logout) + `adminAuth` (login, me, refresh, logout) + `resolveSession` |
| `useSession.ts` | Session hook: on mount probes `/me` (one refresh retry on 401) → `loading / guest / authed`; exposes `signedIn(user)` / `signOut()` |

Both frontends are **web** clients: tokens live in httpOnly cookies (never JS),
and in dev the Vite proxy (`/api` → `localhost:4000` in `vite.config.ts`) keeps
the API same-origin — matching production, so no CORS/SameSite issues.

**Storefront login** (`storefront/pages/LoginPage.tsx`) — all three backend
methods, switched by a segmented Email / Mobile-OTP control. The switcher is
a **sign-in** method picker only: it renders on the sign-in views (email
password, phone, phone-verify) and is hidden on the email-only sub-flows —
create account (which carries its own "Create your account" heading),
forgot password and reset — since Mobile OTP cannot create an account:
- **Email + password** — sign in, **verify-first registration** (form → emailed
  code → account created verified + signed in), and the forgot-password flow
  (email → code + new password).
- **Google** — **hidden for now** (`GOOGLE_SIGNIN_ENABLED = false` in
  `LoginPage.tsx`); the dev-simulation button and `customerAuth.google()` stay
  in place, ready to re-enable when the real integration is planned (the
  backend currently has **no Google verifier registered** either — its
  `/google` endpoints answer 400).
- **Mobile OTP** — **login-only**: phone → SMS code (4 digits from the real
  Message Central delivery, 6 from the dev fallback/bypass — the inputs
  accept 4–8 and never hardcode a length), for numbers already
  linked to an account from the profile (unlinked numbers get a clear 404
  message). Dev responses include `devCode` (**123456**), surfaced as hints.

**Admin login** (`admin/pages/LoginPage.tsx`) — email + password. No
self-service reset (accounts are provisioned via `npm run create-admin`).

The **admin** gate (`AdminApp`) restores the session from cookies on load and
swaps between login and the signed-in app. The **storefront** no longer gates
at the root — see the marketplace homepage below: the router always mounts,
sign-in is a route (`/login`), and only the account subtree is guarded.

### Marketplace homepage (`/`) + session structure

The homepage is the platform's **public entry point** (spec:
`HomePage_mpv.md`) — a store-discovery page, not a shopping page. It renders
for guests and signed-in customers alike and adapts per session state.

- **Session plumbing** — `StorefrontApp` mounts the marketplace router for
  every non-shopping path and provides the WHOLE session state
  (loading/guest/authed) via `app/marketSession.tsx`
  (`useMarketSession()`). The account subtree is wrapped in
  `app/RequireCustomer.tsx`: loading → splash, guest →
  `/login?next={intended}`, authed → the existing `SessionProvider`, so
  every `useCustomerSession()` consumer works unchanged. `/login`
  (`pages/LoginRoute.tsx`) renders the same `LoginPage`, honors a sanitized
  `?next=` (same-origin paths only — no open redirect) and bounces
  already-authed visitors home. A `next` pointing into the anonymous
  shopping router (`/store|/cart|/checkout|/order`, e.g. a guest sent here
  from a checkout) returns via `window.location.replace` — those routes
  don't exist in the marketplace router, so a client-side navigate would
  hit its catch-all.
- **`pages/HomePage.tsx`** (marketplace, replaces the old dashboard landing):
  own chrome — a deliberately **airy** sticky header (`h-16`, `md:h-20`) laid
  out as four zones separated by large gaps (`gap-5` → `lg:gap-12`) rather
  than a dense cluster: brand (logo `h-10`/`md:h-12` + `text-xl`/`sm:text-2xl`
  wordmark) · **global search centered in the toolbar** on md+, dropping to
  its own row under the bar below md · "Sell on UnieMax" link (lg+) · then
  the utilities (theme toggle · cart link with count · Sign in /
  `AccountMenu`, all `h-10`, `gap-3` → `lg:gap-6`; the old hairline separator
  was removed — the gap does that job). **Full-bleed** like the storefront
  (`max-w-[1920px]` soft cap, `lg:px-10`; card grids run 2→3→4→5 columns).
  Sections render as **full-bleed alternating bands** (base canvas / `alt`
  surface tone + a bottom `border-line` divider, compact `py-8/10`) — the
  band lives inside each section component so a hidden section leaves no
  empty band; separation comes from background changes rather than large
  gaps. Sections, in order: a **left-aligned hero band** (headline + Start
  Shopping anchor → #new-stores + Open Your Store; on lg+ a two-column
  offset **collage of real product covers**, adapting from 2 covers up
  (max 4) — decorative, fed by the same fetch as Fresh Finds); a **Shop
  by Category
  chip strip** (`GET /public/categories` — most common category names
  across stores; tapping a chip pre-fills and focuses the global search
  via a tiny module-level search-intent bus; the strip renders nothing
  while loading/failed/empty); **New Stores**
  (**storefront-preview cards**: a 16:9 banner cut from the first of the
  API's `previewImages` (with a gradient foot **only when there is a real
  photo** — over the icon fallback it read as a grey smear), the store logo
  as a round badge straddling the banner edge at the **left**, then a
  left-aligned Oswald name and **star-rating slot**, and a full-width
  footer row above a divider: `productCount` anchored left, a **Visit
  Store →** pill right — a centred column left both margins empty. The
  card body must stay `relative`: the banner above it is positioned, so
  otherwise the overlapping logo paints underneath the image. The
  whole card is still one link — the CTA is a styled `<span>`, never a
  nested `<a>`, so there is no second tab stop. **The rating is a
  placeholder**: there is no review system yet, so `StoreRating` renders
  muted outline stars + "No reviews yet" rather than fabricating stars for
  shoppers, and lights up unchanged the moment the API returns
  `rating`/`reviewCount`);
  **Fresh Finds** (`GET /public/products`, newest 12 platform-wide,
  product cards with image / store / name / price on a denser grid than
  the store cards — 2→3→4→5→6 columns, 4-up from `lg`; section hides while
  the platform has no products — one shared `useNewProducts()` fetch
  feeds it and the hero collage, the rail owning the error/retry UI);
  **Recently Viewed** (local, hidden when empty, logo + name pills);
  **My Stores** (owners only, compact wrapping row — logo, body-face
  name, Published/Draft chip — deliberately slim so consumer sections
  keep the prime real estate; these pill rows and the category strip
  all **wrap** rather than scroll horizontally — no scrollbars on the
  homepage); and a **Become a Seller** gradient panel
  (split layout: pitch + 3 check-mark proof points + CTA on the left —
  label flips to "Create Another Store" for owners; guests route through
  `/login?next=/stores/new` — and the live **platform counters**
  (Stores / Products / Orders from `GET /public/stats`) on the right as
  social proof; counters fail silently and any zero value hides). The
  **footer** is a structured 4-column block: brand + tagline, Marketplace
  (About / Support / Contact) and Legal (Privacy / Terms) columns
  (→ `pages/InfoComingSoonPage.tsx`, public placeholders), and a Sell on
  UnieMax column with a Become a Seller button. Every section still
  fetches independently with its own skeleton and retry — one failed API
  never blanks the page.
- **Global search** (`features/discovery/discoveryApi.ts` →
  `GET /api/v1/public/search`) — starts at 2 characters, 300 ms debounce,
  stale-response guard; results are **always grouped** (Stores / Categories
  / Products, never interleaved) with store/category/product hits navigating
  to `/store/{slug}`, `…/category/{slug}`, `…/product/{slug}` (full page
  loads — the shopping surface lives in the public router). Category and
  product rows show their owning store ("in Power Sports"). Enter opens the
  first hit; Escape/outside-tap closes. The box lives in the sticky header,
  so it stays reachable while scrolling; focusing it while empty opens the
  dropdown with recent-search chips.
- **Local memory** (`features/discovery/recentActivity.ts`, localStorage +
  `useSyncExternalStore`, cross-tab): recent searches
  (`uniemax.recentSearches`, cap 8, saved when a result is opened, shown as
  chips in the search dropdown while the field is empty) and recently
  viewed stores
  (`uniemax.recentStores`, cap 12 `{slug,name,logoUrl}` snapshots — the
  homepage section displays at most the same 12 — recorded
  by `PublicStoreLayout` for **published** stores only — a draft preview is
  not a shopping visit).
- **New Stores** rail — `GET /api/v1/public/stores` (newest publish first,
  `pageSize=12`, cards use its `productCount` + `previewImages`); empty
  state invites the visitor to be the first seller. **Fresh Finds** —
  `GET /api/v1/public/products`. **Category chips** —
  `GET /api/v1/public/categories`. **Platform counters** —
  `GET /api/v1/public/stats` (rendered inside the Become a Seller panel).
  The footer's bottom bar carries a trust row (COD available · Secure
  checkout).

### Storefront account shell (routed dashboard)

Signed-in account pages mount inside `RequireCustomer` → `AppLayout`
(`storefront/app/router.tsx`):

- **`layout/AppLayout.tsx`** — the authed shell is a **sticky top bar only**
  (brand → `/`, theme toggle, account menu); the old sidebar/drawer was
  removed — it duplicated the account menu. Pages render into `<Outlet/>`
  inside a **full-width** container (`max-w-[1920px]`, a soft cap for
  ultrawides — matching the storefront); form-heavy pages constrain
  themselves (`CreateStorePage` `max-w-lg`, `StoreManageLayout` `max-w-7xl`,
  section forms `max-w-xl`).
- **Account menu** (`layout/AccountMenu.tsx`) — the ONE place account
  navigation lives: Flipkart-style dropdown on the top-bar avatar, opens on
  hover (click/tap on touch), closes on Escape / outside tap / item click.
  Items come from `ACCOUNT_MENU_ITEMS` in `app/navigation.ts` (My Profile,
  Orders, Saved Addresses, Help & Support — Help last, because it is where
  someone goes when one of the rows above has gone wrong) plus the dynamic
  store row and a Logout row using
  the shared confirm flow (`layout/useSignOutConfirm.ts`); Logout always
  goes through `shared/ui/ConfirmDialog.tsx` ("Logout?" / Logout, matching
  the menu row's wording) — only on confirm is the session revoked
  server-side, and **confirming navigates to `/` (replace) before revoking**:
  flipping to guest while a guarded route is still mounted would let
  `RequireCustomer` redirect to `/login?next=…`, so logging out of
  `/stores/{slug}` landed on the login page and signing back in returned to
  the page just left. Logout ends on the marketplace homepage from every
  screen. The trigger's name is single-line and truncates past
  `max-w-36`. The same menu is reused by the marketplace header, whose
  sticky bar carries `backdrop-blur` — which is why the dialog portals to
  `<body>` (see below).
- **Session context** (`app/sessionContext.ts` + `app/SessionProvider.tsx`) —
  provides `{ customer, signOut }` to the authed tree via
  `useCustomerSession()`; no prop drilling.
- **Pages are lazy routes** (one chunk per page — the `/wishlist` and
  `/settings` placeholder routes were removed until those features are
  actually built). `/profile` is the real **My Profile** page
  (`ProfilePage.tsx`): identity card (avatar, name, member-since) and a
  **Sign-in details** card listing the account's identifiers — email (with a
  Verified chip) and mobile number. When no phone is linked it offers the
  **mobile-number linking flow** (CONTEXT.md "Account Linking"): enter the
  number → `POST /auth/me/link/request` texts an OTP (`devCode` hint shown in
  dev) → entering the code hits `POST /auth/me/link/verify`, which links the
  number verified and returns the updated customer — pushed into the session
  via `useMarketSession().signedIn()` so the whole authed tree updates, and
  the number then works as an OTP sign-in method on `/login`. A number
  already on another account is rejected by the backend with a 409 (one
  number = one account), surfaced inline. Once linked the row is read-only
  with a Verified chip (identifiers change only via verified linking, never
  a plain edit); an `altPhone` row shows when set (contact-only).
  `/orders` is the real **My Orders** page (`OrdersPage.tsx` over
  `GET /api/v1/orders`): one card per order — order number, date, store
  link, status chip (Placed/Confirmed/…/Delivered/Cancelled), payment chip
  (Paid online / pending / Pay on delivery), total, item rows with
  thumbnails, and a "View details" link to the shareable confirmation page
  (plain `<a>` — `/order/…` lives in the anonymous public router).
  `/addresses` is the real **Saved Addresses** page (`AddressesPage.tsx`
  over `features/addresses/`): up to 10 addresses, one **primary** (the
  default checkout suggestion — deleting it promotes the oldest remaining),
  add/edit via the shared `AddressForm` (label, name, phone, optional
  email, address, pincode, state, country), Set primary, guarded delete.
  Checkout offers this list as one-tap suggestions.
  `/support` is the real **Help & Support** page (`SupportPage.tsx` +
  `SupportTicketPage.tsx` over `features/support/`) — the shopper's channel
  to the **UnieMax team**: the contact card (email/phone/hours), a ticket
  form and the account's own tickets, each opening a thread at
  `/support/{ticketId}`. It is the same feature as a seller's store Support
  section pointed at the other half of the audience, and differs in exactly
  two things: the list is fetched `scope=ACCOUNT` (so a customer who also
  sells never sees their store threads here — those live under each store,
  where the store's context is), and the categories offered are a shopper's
  problems (orders, refunds, **Report a store or seller**) rather than a
  seller's (payouts, store setup). A ticket raised here goes to UnieMax, not
  to the shop that was ordered from — a customer↔seller channel is a
  separate, later feature. Because a ticket must know who is writing,
  `/support` moved **out** of the public footer placeholders: a signed-out
  visitor following the marketplace footer's Support link now lands on
  sign-in and continues to the real page. Unknown paths redirect to `/` (the
  marketplace homepage).

### Support feature (`storefront/features/support/`)

**One implementation, three entry points.** The account menu's Help &
Support, a store's UnieMax Support section and a storefront's Help & Support
are the same screens pointed at different recipients, so the parts live here
and the six pages are thin compositions:

| Piece | What it owns |
| ----- | ------------ |
| `supportApi.ts` | Three typed clients — `supportApi` (→ UnieMax), `storeSupportApi` (shopper → a shop) and `storeInboxApi` (the seller's side) — plus `CATEGORY_LABELS` (**one wording per enum value**, audience-neutral: two wordings is how a queue starts disagreeing with itself) and the three **option lists** `SELLER_CATEGORIES` / `CUSTOMER_CATEGORIES` / `STORE_CATEGORIES`, which is where the audiences actually differ |
| `SupportContactCard.tsx` | Email / phone / hours. Renders from a **local fallback copy first** and never blocks on `GET /public/support-contact` — a support page showing no way to contact support is the one failure it must not have, so a failed fetch is silently ignored |
| `NewTicketForm.tsx` | Subject · topic · details · reply-to email/phone. Topic options **and the submit target** (`submitTo`) are props, since the flows post to different endpoints; **priority is never offered** — given the choice everyone picks Urgent and the field stops sorting anything |
| `TicketList.tsx` | The reporter's tickets. Rows link **relatively** (`to={ticket.id}`), which is what lets one list sit under both `/support` and `/stores/{slug}/support` without knowing either path. `null` = loading, `[]` = the empty state — never confused |
| `TicketThread.tsx` | Fetch + conversation + reply + Close, for all three flows. Each message is labelled from its server-derived **`authorRole`** — "You", the shop's name, or "UnieMax Support" — never an individual (the reporter is talking to an organisation, and naming a staff member invites chasing that person instead of the queue). `authorType` can't do this job: on a store thread both sides are `CUSTOMER`. Bodies render `whitespace-pre-wrap` so a pasted error log stays readable; the reply box warns when replying will **reopen** a resolved ticket; a closed ticket is read-only. Only the back link is a prop |
| `ticketMeta.tsx` | Status chip + thread timestamp format |

### Stores feature (customer-owned stores — `storefront/features/stores/`)

A customer can own multiple stores, backed by the real API
(`/api/v1/stores` — see API.md). Entry point: a **dynamic row in the
account menu** — "Create Store" (→ `/stores/new`) when the customer owns
none, "My Store" (→ `/stores`) otherwise; `AccountMenu` checks
`storesApi.list()` on mount and on each open.

Routes: `/stores` (select a store — clicking a card goes straight to its
management page — or create; first-run empty state; each card shows the
store's **Published/Draft** status chip and its public `/store/{slug}` path,
so the list doubles as an at-a-glance health check), `/stores/new` (create:
name + an **optional logo** — picked, validated against the server's media
config and cropped 1:1 **locally** (the shared `ImageCropDialog` pipeline),
then uploaded to `PUT /stores/:id/logo` right after the store is created —
an upload failure never strands the flow, Store Details offers the same
upload again. Its **Back control is history-aware**: `navigate(-1)` when
in-app history exists — the page is reached from the homepage, the account
menu and the store list — falling back to `/` on a direct open), and
`/stores/:storeSlug` — a Flipkart-account-style split
**inside** the main outlet: `StoreManageLayout` renders a left section card
and the selected section in a right card via a nested `<Outlet/>` (children
read the loaded store through `useManagedStore()` outlet context).
Management URLs use the store's **slug** (the backend resolves id or slug
interchangeably).

The section list is **grouped by what the seller is doing** (`SECTION_GROUPS`),
because a flat list of twelve made a once-ever setting look as important as a
daily job — captions only, **deliberately not collapsible** (twelve items over
four groups fit on screen; an accordion would add a click before every
navigation and hide the item being hunted for):

| Group | Sections |
| ----- | -------- |
| **Overview** | Dashboard · Orders *(pending-count badge)* |
| **Catalog** | Categories · Products |
| **Storefront** | Store Details · Appearance · Homepage · Footer |
| **Settings** | Payments · Bank Accounts · Shipping · Checkout |
| **Help** | Customer Support · UnieMax Support |

Ordering rationale, so it isn't re-shuffled by accident: Catalog leads because
Products is the most-opened section after Orders (it used to sit last);
Categories precedes Products because the app gates Products until a category
exists; **Storefront** is what a customer sees (safe to experiment with) while
**Settings** is money + fulfilment (three of which confirm before saving);
Store Details is branding rather than configuration, so it sits under
Storefront; Payments precedes Bank Accounts because payout accounts only
matter once online payment is on; and **Help** sits last, holding the two
support channels that must not be confused — **Customer Support** is the
shop's own inbox (buyers writing to the seller, so it leads: daily work) and
**UnieMax Support** is the seller writing to the platform. Naming them by
*who is on the other end* is the only labelling that stays unambiguous once
both exist.

**Dashboard** (`StoreDashboardPage`, the manage landing at
`/stores/{slug}`; Store Details moved to `/stores/{slug}/details`) — over
`GET /stores/:id/dashboard`, **fetched by the layout, not the page**
(`ManagedStoreContext.dashboard` / `dashboardError` / `refreshDashboard`),
because the nav's Orders badge needs the same counters. The layout outlives
section navigation, so this is one request per management session instead of
one per visit to the Dashboard, and re-entering the section renders instantly
from context. `refreshDashboard()` coalesces concurrent callers and discards
responses for a store the seller has since left; the Dashboard page calls it
only on **re-entry** (a mount-time snapshot of whether data is already in
hand — otherwise it would duplicate the layout's initial load), and
`StoreOrderDetailPage` calls it after a status change or cancellation so the
badge and tiles never lag the order they describe. It renders: Today's
Orders / Total Orders / Revenue
tiles, the order pipeline (Pending / Processing / Shipped / Completed /
Cancelled / Refunded — each tile deep-links into the Orders section
filtered to its status; Processing spans two statuses so it links to the
full list), and the latest 8 orders, each row linking to its order detail
page (plus a "View all orders" link).

**Orders** (`StoreOrdersPage` at `/stores/{slug}/orders` +
`StoreOrderDetailPage` at `…/orders/{orderId}`, shared chips/labels in
`orderMeta.tsx`) — the seller's order management over
`/api/v1/stores/:id/orders`:

- **List** — status tabs (All + the six statuses, deep-linkable via
  `?status=` so dashboard tiles land pre-filtered), a debounced search
  (order number / customer name / phone), newest first, server-paginated
  with Load More; every row opens the detail page.
- **Detail** — items with thumbnails + money summary, customer/delivery
  snapshot (tel: link, pickup note for PICKUP orders), payment card
  (flags dev-simulated payments), a **lifecycle timeline** (Placed →
  Confirmed → Packed → Shipped → Delivered, driven by the order's
  timestamps; pickup orders show "Picked up" and skip Shipped; a
  cancelled order shows the stages it reached + Cancelled with the
  seller's reason), and the **status actions**: one primary
  next-step button (Confirm Order → Mark as Packed → Mark as Shipped →
  Mark as Delivered; pickup goes Packed → Delivered) plus Cancel Order
  while the order hasn't shipped. Every action confirms via
  `ConfirmDialog` first (changes are customer-visible immediately); the
  cancel dialog carries an optional reason field and explains that stock
  is restored (and a paid order marked refunded). Conflicts (409 — e.g.
  a race with another tab) surface as inline errors.

**Publish & share** — the left card ends in `StorePublishCard` (visible on
every manage section): a Published/Not-published status row with a
Publish/Unpublish toggle (`PATCH /stores/:id/publish`) and a **Share Store**
button that copies the store's public URL (`{origin}/store/{slug}`,
built by `publicStoreUrl()` in `storesApi.ts`; uses the native share sheet
where available). Before publishing, the same URL works as a **private
draft preview** for the signed-in owner (an amber hint says only they can
open it), and a **Preview** button beside Share opens it in a new tab
(labelled "View Store" once published).

**Public storefront (multi-page)** — everything under `/store/…`, `/cart…`
and `/checkout/…` is served **without sign-in**: `StorefrontApp` checks the
path *before* the session gate and mounts `app/publicRouter.tsx`, a full
nested router. The
storefront is a real multi-page shop rather than one filtering screen, so it
scales from a few products to thousands:

```
/store/:storeSlug                          StoreHomePage
/store/:storeSlug/category/:categorySlug   StoreCategoryPage
/store/:storeSlug/product/:productSlug     StoreProductPage
/store/:storeSlug/shop[?q=]                StoreShopPage
/store/:storeSlug/support[/:ticketId]      StoreHelpPage · StoreHelpTicketPage
/cart, /cart/:storeSlug                    cart pages (OUTSIDE the store
                                           layout — one cart spans stores)
/checkout/:storeSlug                       per-store order review (orders
                                           are placed per store)
```

`PublicStoreLayout` fetches the store **shell once**
(`GET /api/v1/public/stores/:slug` — branding, theme and the category tree,
**no products**) and shares it with every child route via `usePublicStore()`,
so moving between pages never refetches the chrome. It applies `storeVars()`
and renders `StoreHeader` + `<Outlet/>` + `StoreFooter`. `<main>` is
**edge-to-edge** and carries no padding of its own: inner pages wrap
themselves in the exported **`StorePageShell`** (the 1920px-capped padded
column), which lets the homepage render full-bleed section bands instead.

- **Help & Support entry points** — a shopper reaches the shop from the
  **top bar** (a `Help` nav item beside Categories, and a row in the mobile
  drawer) and from the **footer** (first row of Customer Support). Two
  placements because the two reading patterns are different: someone hunting
  for "how do I contact them" scans the toolbar, someone who has read to the
  bottom of a product page is already in the footer. The footer's Customer
  Support block is now **unconditional** — it used to render only when the
  owner had filled in a phone or email, but the in-app link exists for every
  store, and hiding the one guaranteed contact route to keep a heading tidy
  is the wrong trade.
- **`StoreFooter`** (`features/publicStore/StoreFooter.tsx`) — renders the
  owner's Footer settings from the shell (`store.footer`): brand block (logo +
  metal-text name, about, "Since {year}", social icon chips — FB/IG/YT live,
  WhatsApp/X/LinkedIn/Telegram/Pinterest future-ready), Quick Links (custom
  links as router `Link`s for in-app paths / new-tab anchors for URLs, plus
  policy links), business locations (address, contact person, `tel:` phones,
  `mailto:` email, hours, and a **View on Google Maps** link built from the
  pinned lat/lng — falling back to an address search, no API key needed) and
  a Customer Support block (phone / WhatsApp `wa.me` / email / hours). Every
  block is conditional; a store with nothing configured gets just the
  copyright bar. Bottom bar: owner's `copyrightText` (default
  "© {year} {store name}. All Rights Reserved."), GST/registration small
  print, "Powered by UnieMax". Responsive: 1 → 2 → 4 columns.

- **`StoreHeader`** — logo · Home · Shop · **Categories ▾** · search ·
  **share** · cart. Hover
  dropdown on desktop, hamburger drawer with an accordion below `lg`. The menu
  lists **categories and subcategories only, never products**. The share
  button (`ShareButton.tsx`, backed by `shared/share.ts`) opens the native
  share sheet where available, else copies the store's permanent public URL
  with a "Link copied" check — the same helper the owner's Share Store panel
  uses. Nav items whose
  features don't exist yet (Offers, Track Order, About, Contact) are
  deliberately absent rather than rendered as dead links.
- **`StoreHomePage`** — hero, Shop by Category, then the
  merchandising rows (Featured / New Arrivals / Best Sellers) from
  `GET …/home`. Sections render in the **owner-arranged order** (the payload's
  ordered `sections` list); each is skipped when disabled or empty. Every
  section is a **full-bleed band** (alternating page-canvas / surface tone plus
  a bottom `border-line` divider, compact `py-8/10`) exactly like the
  marketplace homepage — separation comes from the background change, not from
  large gaps, and the band lives inside the section so a hidden one leaves no
  empty strip. Sections are filtered for *content* before the tones are
  assigned, so the alternation never breaks on an empty row.
  - **Hero** — sized like the marketplace hero (`text-3xl sm:text-5xl`,
    `py-8/10`) rather than the old tall rounded card: eyebrow, store name,
    the product/category count line, a Start Shopping CTA and — only when the
    categories band is actually on the page — a `#shop-by-category` anchor
    button. On `lg+` an offset two-column **collage of the store's real
    product covers** (max 4, deduped from the merchandising rows, decorative
    `alt=""`, skipped below 2 covers). Keeps the radial brand wash.
  - **Shop by Category** — deliberately **icon-free, text-only** tiles: name,
    the subcategory line and the product count in a compact row
    (`px-3.5 py-3`), six across on a wide screen. The old circular
    `TagIcon` badge and its tall padding are gone.
  - **Product rows** — `ROW_SIZE = 6` fetched, but `ROW_VISIBILITY` hides the
    surplus per breakpoint (`hidden md:list-item` …) so **every** breakpoint
    paints exactly one full row — 2 → 3 → 4 → 5 → 6 cards — and never strands
    an orphan. Each carries a "View all →" link **scoped to that section**
    (`/shop?section=featured|newArrivals|bestSellers`). Rows are
    **strictly flag-driven** (a product shows only in the sections its owner
    ticked) and a row with nothing ticked is not rendered at all.
- **`StoreCategoryPage`** — breadcrumb, title, subcategory chips, then the
  shared `ProductListing`.
- **`StoreShopPage`** — browse-all listing; `?q=` turns it into search
  results and `?section=` scopes it to one merchandising row (title follows,
  e.g. "Best Sellers"). One page, since they are the same listing at a
  different scope. Target of the header search, the Shop nav item and every
  "View all" link (which passes its section).
- **`StoreProductPage`** — the **only** page that renders variants, laid out
  as breadcrumb · gallery + purchase card · Product Highlights · Description ·
  Specifications · You May Also Like:
  - **Media gallery** — main viewer plus a thumbnail rail (vertical beside the
    image on `lg`, a scrollable strip below on phones) whenever there is more
    than one item; the product video plays inline with a play-glyph thumb and
    thumbs lazy-load. Interactions: pointer-anchored **hover zoom** (mouse
    only — `pointerType` guarded, images only), **swipe** between items on
    touch, hover arrows and an `n / total` counter. The gallery is
    `lg:sticky` so it stays in view while the long right column scrolls.
  - **Purchase card** — everything about buying inside one bordered card:
    category eyebrow → name → price → stock badge → the first few highlights →
    variant picker (each option shows its own price / "Out of stock") →
    **quantity selector + Add to Cart + Buy Now** (`PurchaseActions`; Buy Now
    adds the line then goes straight to `/checkout/{storeSlug}`) → the
    delivery block → trust badges. The **share button** sits in the card
    header beside the name.
  - **Delivery, returns & trust are read from the seller's own settings** —
    fulfilment mode (delivery / pickup, pickup naming the primary footer
    location), COD and online-payment switches, and the returns/shipping
    policy links — never a fabricated courier ETA. "Free delivery" is true
    platform-wide today (`orders.service.ts` charges a flat 0); **update that
    line when shipping rules land**.
  - **Highlights / Description / Specifications come out of the single
    description field** (`productDescription.ts` — see below). The first 4
    highlights sit in the purchase card; the standalone **Product Highlights**
    section renders only when there are more than that (the same bullets twice
    on one screen read as padding). The Specifications table always renders:
    parsed rows first, then the catalog facts (category path, option count,
    availability, sold-by).
  - **Sticky purchase bar** — an IntersectionObserver watches the purchase
    card; once it scrolls out of view a fixed bottom bar (thumbnail, name,
    live price, Add + Buy Now) takes over on every breakpoint, and the page
    carries `pb-24` so it never covers content.
  - **No rating and no reviews.** There is no review system in the schema or
    API, and the platform's rule is to say so rather than invent stars (same
    as `StoreRating` on the marketplace homepage) — the section arrives with
    the feature.
- **`productDescription.ts`** — `parseDescription()` turns the product's ONE
  free-text description into `{ highlights, specs, paragraphs }`: `-`/`*`/`•`/
  `✔` lines become highlights, short `Label: value` lines become spec rows
  (label ≤ 28 chars, value ≤ 60, **and at least 2 of them** — otherwise they
  fall back to prose in their original position), everything else stays prose
  with paragraph breaks preserved. Nothing is fabricated: a plain paragraph
  description renders exactly as one Description section, as before. The
  catalog deliberately has no highlights/specification fields; this reads the
  structure the seller already typed instead of adding schema.
- **`ProductListing`** — shared listing body (breadcrumb, title, sort & filter
  bar, grid, Load More) used by the category and search pages. It owns the
  *controls* only; every query goes to the server.
- **`useProductQuery`** — calls `GET …/products` with
  category/q/section/sort/price/stock/page. **Nothing is filtered in the browser** —
  each change resets to page 1, Load More appends the next page
  (`PAGE_SIZE = 24`, auto-loading via IntersectionObserver), `q` is debounced,
  and a request counter discards out-of-order responses. Results live in a
  **short-TTL session cache** (5 min, LRU-capped) keyed by store + full
  query: returning to a listing (product page → back) re-renders every
  loaded page synchronously instead of refetching page 1, which — together
  with the `<ScrollRestoration/>` mounted at the public router's root
  (`publicRouter.tsx`) — restores the exact scroll position.
- **`ProductCard`** — the **whole card is one link** to the product page; there
  is no Add to Cart on a card. Buying happens on the product page, which keeps
  every card the same shape whether or not the product has options, so a grid
  of thousands stays uniform. Shows the **cover image** (lazy-loaded
  `loading="lazy"`/`decoding="async"`, icon fallback while no photo exists),
  category label, name, a **"From ₹X"** price, a **stock badge** and **"N
  Variants Available"** (never the options themselves). Hover applies `metal-lift`:
  a small rise plus an **evenly-spread halo** (zero-offset shadow, so it
  radiates equally on all four sides rather than pooling underneath) and the
  name shifts to the brand color. The card is deliberately **compact**
  (`p-2`/`p-3`, `rounded-lg`, `text-sm sm:text-base` name) so the full-bleed
  layout carries dense rows instead of four oversized cards: the shared
  `PRODUCT_GRID` ramp (exported here, also used by `GridSkeleton` and the
  homepage rows) runs 2 → 3 → 4 → 5 → **6 columns (2xl)**.
- **`FilterPanel`** — right slide-over on desktop, bottom sheet on mobile:
  Availability + Price Range live; Brand/Rating/Discount shown "Soon".

Empty results show a **No products found** state with **Clear filters**; a
store with no shoppable catalog shows products-coming-soon. The store's theme
colors are applied (`storeVars()`), and surfaces/text adapt to the background's
luminance so dark themes stay legible. The API pre-filters by the visibility
rule (product + category chain active, enabled variants only).
Unknown/unpublished slugs get a "store isn't available" screen — with one
exception: the signed-in **owner** of an unpublished store gets a **draft
preview** (the API resolves the cookie session best-effort and serves the
store with `isPublished: false`; `PublicStoreLayout` then shows a solid
warning banner above the header — "Draft preview … only you can see it" —
with a plain `<a>` to `/stores/{slug}`, since the manage page lives in the
authed router and needs a full page load to cross the gate). On a 404 the
layout retries once after `customerAuth.refresh()`, so an owner whose
15-minute access token expired mid-preview isn't bounced to the
unavailable screen.

**Shopping cart (grouped by store)** — the cart is **client-side**
(`features/cart/cart.ts`: localStorage-backed with `useSyncExternalStore`
hooks + cross-tab sync), so anonymous visitors can shop across multiple
stores; a line's identity is store + product + **variant** (null for
plain products), and each line snapshots product/variant name, **product
slug** (links the row back to its product page and enables revalidation),
effective price, stock, store name/slug, and the **cover-image URL** — cart
and checkout rows show a product thumbnail (box-icon placeholder when the
product has no photo; revalidation refreshes the URL, so pre-thumbnail
lines and changed covers heal themselves). Cart rows show the variant as
a chip. Adding to cart from the product page pops a short **"Added to cart —
View cart" toast** (`AddedToast` in `CartControls.tsx`); quantity changes on
the cart pages stay silent.
**Logging out empties the cart** (`cart.clear()`, wired into the storefront's
`signOut` in `StorefrontApp.tsx`): there is no server-side cart, so a
device-local basket would otherwise be inherited by whoever uses the browser
next. Only an *explicit* logout clears it — an expired session (the 401 path
out of checkout) redirects to `/login` and leaves the cart intact, so the
shopper can sign back in and pay.
Three public routes, matched before the session gate like `/store/{slug}`:
**`/cart`** (`pages/cart/CartPage.tsx`) groups items **by store** — each
store card shows the store's **logo** (fetched via
`features/publicStore/useStoreShells.ts`, a session-cached shell lookup;
`StoreLogo.tsx` falls back to the store glyph), item count, subtotal, a
**Continue shopping** link, a **Place Order** button (→
`/checkout/{storeSlug}`; disabled when nothing is orderable), and the
first 3 lines, with a "View N more items" link to
**`/cart/{storeSlug}`** (`pages/cart/CartStorePage.tsx`), the dedicated
all-items page for that store (plus Clear all and its own Place Order).
**Store-scoped view:** `?from={slug}` scopes the **contents**, not just the
palette. Opened from a store, `/cart` shows that store's group **alone** —
the visitor is mid-shop there, orders are placed per store, and a summary
total spanning other stores would overstate what they're about to buy. A
full-width **"Show all cart items — N more from M other stores"** button
below the list (and a matching link in the summary) reveals the rest,
keeping the from-store first and labelling the boundary "Other stores in
your cart"; the button then flips to "Show only {store}". The order summary
always totals **what is on screen**. Opened from the marketplace (plain
`/cart`) every store is listed, as before. A `?from=` store with nothing in
the cart falls back to the full list — there is nothing to scope to. The
store header's cart badge counts **that store's** items for the same reason
(the marketplace header still counts everything).
**Theming rule:** the cart continues the theme of the store the customer
**opened it from**, carried **explicitly in the URL**: every cart link
inside a store points at `/cart?from={storeSlug}` (built by `cartUrl()` in
`storesApi.ts` — used by the store header's cart button, the added-to-cart
toast, and the store-scoped cart/checkout pages' back links), and `/cart`
applies that store's theme regardless of which stores' items are inside.
Opened from the marketplace (homepage — plain `/cart`, no `from`) it
renders the neutral palette that follows the visitor's light/dark toggle.
Store-scoped pages (`/cart/{slug}`, `/checkout/{slug}`, the order page)
always use their own store's theme directly (`useStoreShell`). The context
deliberately lives in the URL and **not in storage** (a sessionStorage
"last-visited store" heuristic existed and was removed): a URL param is
part of browser history, so back/forward-cache restores, refreshes and
multiple tabs all keep the right theme, where ambient tracking broke. All pages use
the storefront treatment (full-width shell, flat surface+border cards,
Oswald headings, sticky top bar) with an order-summary panel stuck beside
the list on desktop.
**`/checkout/{storeSlug}`** (`pages/cart/CheckoutPage.tsx`) is the
per-store **checkout** — **sign-in required**: the page probes the cookie
session on mount (browsing and the cart stay anonymous; only ordering
needs an account, matching the API's `requireCustomer` on order
placement). Guests get a "Sign in to place your order" panel whose CTA is
a plain `<a>` to `/login?next=/checkout/{slug}` (full page load — /login
lives in the marketplace router), and a mid-checkout 401 on Place Order
(expired session) redirects the same way. For signed-in customers it
renders an Inter-titled top bar with a secure-checkout
cue, compact store identity row, the read-only item list (edit links back
to the cart), the two interactive checkout steps (below), and an order
summary whose **Place Order** button goes live once both steps are done.
Unavailable lines are excluded and called out.
On mount they **revalidate** (`features/cart/useCartRevalidation.ts`):
each distinct product is re-fetched once and `cart.sync()` applies fresh
price/stock (quantities clamp down; an amber note reports changes). A
product/variant that is gone (deleted, disabled, unpublished, or a simple
product that gained options) is marked **unavailable** — kept visible with
a warning but excluded from counts and subtotals; only a definite 404
does this, network errors leave snapshots untouched. The shared line row
(qty stepper, remove, line total, unavailable state) lives in
`pages/cart/CartLine.tsx`.

**Checkout steps** (`pages/cart/CheckoutSteps.tsx`, rendered by
`CheckoutPage` once the shell loads) — Delivery Details → Choose Payment
Method, then Place Order (live — only the real online-payment gateway is
still future). **Step 1 — Delivery Details**: for `BOTH`-mode stores a
Delivery/Pickup picker (pickup shows the store's primary footer location
and skips address fields); customers get their **saved addresses
as selectable rows** (primary preselected) with an inline "Add New
Address" that saves to the address book, plus an email top-up field when
the store collects email but the chosen address has none (the plain-form
fallback only renders if the addresses probe fails — the page itself
already required sign-in). The form renders **only the fields
the store collects** (`shell.checkout`, seller-toggled) and validates
exactly those. Confirming collapses the step to a summary with a Change
button. **Step 2 — Choose Payment Method**: radio cards for Online Payment
/ Cash on Delivery per the store's `payments` switches (dimmed until step
1 is done; a store with nothing enabled gets a can't-order note). With both
steps complete the summary's **Place Order** button goes live
(`publicOrderApi.place` → `POST /public/stores/:slug/orders`): the payload
carries item references + quantities only (the server re-prices and
re-checks stock), success clears that store's cart lines and replaces the
route with **`/order/{storeSlug}/{orderId}`** —
`pages/cart/OrderSuccessPage.tsx`, a store-themed confirmation (green
check, order number pill, paid/pay-on-delivery line — flagging simulated
dev payments —, item list with thumbnails, delivery/pickup summary,
Continue shopping). ONLINE payment is simulated in development; production
answers 503 until the gateway lands, surfaced as the Place Order error.
The `/order/...` prefix is part of `StorefrontApp`'s anonymous
`PUBLIC_PATH`, so a guest can reopen their confirmation link.

**Back controls step back, they don't re-navigate.** The checkout and
per-store cart back arrows use `shared/useGoBack.ts` (`navigate(-1)` when
React Router's `history.state.idx > 0`, else a `replace` to the given
fallback), and the dead-end "Back to cart" CTAs pass `replace`. Written as
plain `<Link to={cart}>` they PUSHED a second cart entry with checkout still
ahead of it, so Back bounced cart → checkout → cart forever. `/cart`'s own
arrow deliberately keeps `window.history.back()`: the store header reaches
it with a full page load (`<a href>`), which resets `idx` to 0 even though
the store is one browser step back.

Every public page sets a **per-route `document.title`** via
`shared/usePageTitle.ts` — "Product · Store · UnieMax", "Search "q" ·
Store · UnieMax", "Your Cart · UnieMax", etc. (SPA-only: real OG/meta tags
for crawlers wait for SSR/prerender).

- `storesApi.ts` — typed HTTP client (list/create/get/update/updateTheme/
  setPublished + `storeCatalogApi` for per-store categories/subcategories/
  products/variants — variant mutations return the full parent product, and
  `updateProduct` carries the editable details (name, description — `null`
  clears it — and `categoryId`) plus the visibility switch and the
  merchandising flags) plus `publicStoreApi` (the five anonymous storefront endpoints:
  `getBySlug` shell, `getHome`, `listProducts`, `getCategory`, `getProduct`),
  over `shared/auth/http.ts`. `listProducts` uses `callList` so the
  pagination `meta` survives. Normalizes the server's `theme` JSON against
  client defaults; exports `publicStoreUrl(slug)` and the storefront URL
  builders (`storeHomeUrl` / `storeCategoryUrl` / `storeProductUrl` /
  `storeShopUrl`) — the one place that knows the route shape.
- `useStores.ts` — data hooks: `useStores` (list), `useStore` (by id;
  404/foreign → `null` → redirect to `/stores`).
- Sections: `StoreDetailsPage` (name update + **logo upload**: pick →
  validate against the server's media config → crop 1:1 → upload as WebP
  with a progress bar; Replace / Remove with confirmation — saves
  immediately, independent of the name form),
  `StoreHomepagePage` (**arrange** the storefront homepage — drag-and-drop
  (native HTML5 DnD, no dependency) plus ▲/▼ buttons for keyboard/touch to
  reorder Hero · Shop by Category · Featured Products · New Arrivals · Best
  Sellers, each with an `ActiveSwitch` — order + visibility persisted together
  as the full ordered list via `PATCH /stores/:id/homepage`; a switch only
  *hides* a section, never forces an empty row; the fixed header is not
  listed),
  `StoreFooterPage` (**Footer** manager — everything the storefront footer
  shows, as independently-saving cards over `PATCH /stores/:id/footer`, each
  sending only its own section: **Contact Information** — up to 10 business
  locations (branch name, full address, contact person, mobile + alternate,
  email, hours, Set-as-primary with exactly one primary enforced), each
  addable/editable inline with a **Google Maps picker**
  (`LocationMapPicker.tsx`: Places search box + click/drag pin persisting
  lat/lng; without `VITE_GOOGLE_MAPS_API_KEY` it degrades to manual
  latitude/longitude fields) and guarded deletes; **Social Media** —
  Facebook/Instagram/YouTube up front plus a "More platforms" reveal
  (WhatsApp number, X, LinkedIn, Telegram, Pinterest); **Store Information**
  — About Us, established year, GST + registration numbers; **Customer
  Support** — email/phone/WhatsApp/working hours; **Store Policies** —
  optional external URLs per policy until dedicated pages land; **Additional
  Footer Links** — up to 10 custom label+URL rows (in-app paths allowed);
  and **Copyright** — custom line defaulting to
  "© {year} {store name}. All Rights Reserved."),
  `StoreBankPage` (**Bank Accounts** — the seller's payout accounts over
  `/stores/:id/bank-accounts`: list up to 5 accounts (bank + masked
  ····last-4, holder, IFSC, branch, optional UPI), each with a
  verification chip — Pending verification / Verified / Verification
  failed (with the failure note) — and a **Primary** badge; actions: Set
  primary, inline edit (warns that changing details of a verified account
  resets it to pending), guarded delete (deleting the primary warns that
  payouts hold until another is chosen; nothing auto-promotes). The add
  form validates holder name, 9–18-digit account number with a
  **confirm-account-number** field, IFSC shape, bank, branch and optional
  UPI VPA. A banner flags "no primary selected" whenever accounts exist
  without one),
  `StorePaymentsPage` (**Payments** — how customers PAY: Accept Online
  Payment (pays out to the primary bank account — the page warns and links
  to Bank Accounts when it's on without a primary account) and Accept Cash
  on Delivery. Because a toggle changes the live checkout, it only
  *requests* the change — a `ConfirmDialog` (neutral tone for on, danger
  for off) spells out the effect and nothing is written until accepted →
  `PATCH /stores/:id/payments`; an all-off state warns that customers
  can't order. The checkout's payment step offers exactly the accepted
  methods from the public shell's `payments`),
  `StoreShippingPage` (**Shipping** — how customers RECEIVE orders: a
  radio-card choice of Delivery / Store Pickup / Both →
  `PATCH /stores/:id/shipping`, likewise confirmed via `ConfirmDialog`
  before saving. When pickup is enabled without any footer business
  location the page links to Footer → Contact Information. The checkout's
  delivery step follows the mode from the shell's `shipping`),
  `StoreCheckoutPage` (**Checkout** — which customer details the checkout
  collects: seven toggles (Name / Phone / Email / Address / Pincode /
  State / Country, all on by default) grouped into contact + delivery
  fields, drafted locally and saved with one button →
  `PATCH /stores/:id/checkout`; a disabled field is hidden from customers
  and skipped in validation. Warns when a delivering store switches all
  address fields off),
  `StoreSupportPage` (**UnieMax Support** — the two ways to reach the
  platform team, in the order they are useful: direct contact, then a tracked
  ticket. The page itself is thin: everything visual comes from
  `features/support/` (see the Support feature above), and what it decides is
  the **scope** — the list is filtered to THIS store and new tickets carry
  it, because "my tickets across everything I own" is a different question
  that would make the section ambiguous), `StoreSupportTicketPage` (one
  thread at `support/{ticketId}` — a back link around the shared
  `TicketThread`),
  `StoreCustomerSupportPage` (**Customer Support** — the shop's own **inbox**:
  what its buyers raised from the storefront. Opens on **Needs reply** (open
  + in progress) sorted oldest-activity-first, for the same reason the admin
  queue does — an inbox exists to show what is still owed, the opposite of
  the newest-first ordering everywhere else in store management — with an
  "awaiting reply" count that stays truthful whatever tab is selected),
  `StoreCustomerSupportTicketPage` (one request at
  `customer-support/{ticketId}`: the thread, the customer's contact snapshot
  as `tel:`/`mailto:` links, a reply box and a status select. Deliberately
  simpler than the console's equivalent — **no priority**, which is the
  platform's triage vocabulary — and replying picks the request up on its own
  so the Needs-reply tab can't quietly lie),
  `StoreAppearancePage` (background + primary color — picker swatch plus a
  typed/pasted hex field (`#rrggbb`, `#rgb` shorthand auto-expanded) —
  plus optional **secondary** (links/prices/highlights), **surface**
  (cards/panels) and **button text** (CTA labels) colors, each an
  Auto/Customize toggle where Auto keeps the derived behaviour (secondary
  follows primary; surface follows the background; button text is
  white/black from the primary's luminance) — and a live mini-storefront
  preview — top bar, category chip bar, product card grid **and a real
  labeled CTA button** (same `metal-cta text-cta-contrast` classes as the
  live storefront, so button-text contrast is checked before saving),
  rendered with the real page's own `storeVars()` semantics (flat
  surfaces, chrome CTAs) so it previews truthfully →
  `PATCH /stores/:id/theme`), `StoreCategoriesPage`
  (inline add form with an optional **parent select** — top-level or
  "Inside {root}" for a subcategory, one level only — and a **collapsible
  nested list**: roots with indented "Sub"-chipped children,
  product/subcategory counts, guarded delete via `ConfirmDialog`. Roots
  with children get an expand/collapse chevron plus an Expand-all /
  Collapse-all control; the open set is remembered per store in
  localStorage (`storefront.categories.expanded.{storeId}`) and a root
  auto-expands when a subcategory is added to it, so long catalogs stay
  scannable. Every row (root or sub) has an **inline rename** — a pencil
  swaps the name for an input with save/cancel, Enter saves, Escape
  cancels → `PATCH /stores/:id/categories/:categoryId` with `{ name }`),
  and `StoreProductsPage`
  (**gated**: with zero categories it shows an "Add a category first"
  state linking to the Categories section — the category-first sequence;
  otherwise an Add Product form — name, category select grouped by root
  with "Root › Sub" options, optional description, an optional **photo
  picker** (`NewProductPhotos.tsx`) and a **"This product
  has variants" checkbox** that picks the product shape. Unchecked (the
  default) shows required Price + Stock; checked hides them and shows a
  **variants editor** instead (rows of name / price / stock, each required,
  with Remove + "Add variant"; one row is always present). Because **the
  variant is the unit of sale** the two are mutually exclusive — there is
  never a second competing price — and the checkbox only *hides* fields, so
  toggling back and forth preserves whatever was typed. The submitted
  payload carries `hasVariants` plus exactly one side's fields.
  **Photos at add time** (`NewProductPhotos.tsx`): media uploads need a
  product id (`POST …/products/:productId/media`), so up to 8 images are
  validated, cropped 1:1 and held as blobs **locally**, then uploaded one at
  a time straight after `createProduct` — the deferred-upload shape
  `CreateStorePage` uses for a new store's logo. The button counts them
  ("Uploading photo 2 of 3…"). The picker offers pick/drop, remove and Make
  cover only; full reordering, alt text and the video stay in the row's
  Photos & video panel, which owns real media rows. A failed upload never
  strands the flow — the product row still appears and the page shows which
  photos to re-add. The product
  list shows "Root › Sub" paths, total stock and a price **range** when
  options differ ("₹89,900 – ₹1,09,999"). Each row has a **pencil** opening
  an inline **details editor** — name, category (same grouped "Root › Sub"
  select as the add form) and description; only changed fields are PATCHed,
  an emptied description is cleared to null, and the slug/public URL never
  changes on rename. Each row also expands into a
  **variant manager**: for an option-less product that panel edits its
  implicit Default variant (price + stock); once options exist it lists
  them, each variant row editable **inline** (pencil → name / price / stock
  with save/cancel, only changed fields sent) alongside enable/disable,
  delete, and an inline add-variant form). The expanded panel also carries the
  **Storefront placement** checkboxes (Featured Product · Best Seller · New
  Arrival · Hide from Search). Each maps to exactly one storefront row, and
  because ticking one changes what customers see immediately, the checkbox
  only *requests* the change — a `ConfirmDialog` names the affected row and
  nothing is written until it is accepted, so the boxes always reflect saved
  state. Root categories get a matching **star** toggle.
  The expanded panel opens with **Photos & video**
  (`ProductMediaManager.tsx`): up to **8 images** — multi-select or
  drag-and-drop onto the + tile, each validated (size/type from
  `/public/media-config`, shown as hints), **cropped 1:1**
  (`ImageCropDialog`, queue-walks multiple picks) and uploaded as WebP with
  a per-file progress bar; failures stay in the grid with **Retry** (reuses
  the cropped blob) / Discard. Tiles drag to reorder (optimistic, ‹ ›
  buttons as fallback) — the **first image is the cover** (badged) — and
  each has Replace / Delete / **Alt** (alt-text dialog). Below sits the
  **single video slot** (upload/replace/delete, no crop).
  Every category, product, and variant
  row has an **enable/disable pill switch** (`ActiveSwitch.tsx` → the
  `PATCH` toggle endpoints); disabled rows dim and show a "Disabled"
  chip — disabled items are hidden from the public storefront.

---

## Admin console (`src/admin/`) — the platform operator's app

Served at **`/admin`** on the same origin (see "Two Apps, One Repo"). The
router uses `basename="/admin"`, so its own paths are written without the
prefix; nginx returns `admin.html` for every path under `/admin`
(`try_files $uri /admin.html`) and the Vite dev/preview server does the same
via the `adminRouter` plugin, so deep links work in both.

### Shell & session hardening

`AdminApp` probes the cookie session (`GET /admin/auth/me`, one refresh retry)
and swaps between the login page and the console. Because this is the
highest-privilege surface on the platform, `app/adminSession.tsx` adds three
rules the storefront does not have:

1. **Silent refresh every 10 min** — the access token lives 15, so a long
   shift on one screen never dies mid-action. It's a cookie exchange; no
   token touches JS.
2. **Idle sign-out after 30 min** — an unattended console on a shared desk is
   the real risk. Activity is `pointerdown`/`keydown`/`scroll`/`focus`;
   `visibilitychange` deliberately does **not** count, because a background
   tab is not someone at the desk.
3. **Global 401 handling** — an axios interceptor drops the whole app to the
   login screen the moment any admin call comes back unauthorised (session
   revoked elsewhere, admin deactivated), instead of leaving half-loaded
   pages showing stale data. The login POST is exempt: a 401 there is a form
   error, not an expired session.

`layout/AdminLayout.tsx` is the shell — **one nav, two presentations**: the
same `NAV_GROUPS` render as a fixed 16rem rail from `lg` up and as a slide-in
drawer below it, so a nav change lands in both at once. The drawer closes on
navigation and locks body scroll while open. Groups: Overview · Commerce
(Orders, Payments, Products) · Accounts (Stores & sellers, Customers) ·
Platform (Notifications, Activity log, Admin users — the last SUPER_ADMIN-only,
and the API enforces that independently).

### Isolated UI kit (`admin/ui/`)

A console is dense, tabular and keyboard-driven; the storefront is spacious
and promotional. Sharing components would force every change to satisfy both,
so the admin has its own kit — while sharing the **token layer**, so the two
still look like one product.

| File | What |
| ---- | ---- |
| `primitives.tsx` | Card/CardHeader/PageHeader, Chip (6 tones), Button, TextInput/TextArea/SelectInput, Empty/Error/Skeleton, Detail row |
| `DataTable.tsx` | **The** table + `Pagination`. Below `md` each row re-renders as a stacked card (that's why every column declares a `header` string; one column may be `primary`, and `hideOnMobile` drops detail). One definition per page instead of a desktop table plus a drifting mobile list. |
| `Toolbar.tsx` | Filter row: debounced `SearchInput`, `FilterSelect`, scrollable status `Tabs` |
| `statusMeta.tsx` | One label + tone per domain state, defined once — so "Shipped" is the same word and color everywhere. Every chip carries its label; color is a second signal, never the only one. |
| `charts.tsx` | `TrendChart` · `BarList` · `Donut` · `Sparkline` · `ChartFrame` (see below) |
| `StatTile.tsx` | Headline number + optional sparkline; a `to` makes it a link |
| `format.ts` | `formatMoney/Exact/Short`, counts, dates, `formatRelative`, `formatPriceRange` |

**Money is a decimal string** everywhere (`"14250.00"`) — that is what Prisma
`Decimal` serialises to — and is converted to a number only at the moment of
display, never for arithmetic. Totals always come from the server.

### Charts — hand-drawn SVG, no dependency

Rules they follow (constraints, not taste):

- **One axis, one series.** The trend chart shows revenue **or** orders,
  switched by a toggle. ₹ and counts share no scale; overlaying them on two
  y-axes invents a correlation.
- **Color is assigned by entity, never rank** — `--chart-1` is always money,
  `--chart-2` always counts, whatever a filter does.
- **Colors come from tokens.** `index.css` defines `--chart-1/2/-grid` per
  scheme. Money draws in the brand purple itself (`#6c3ef4`, 5.8:1 on the
  white chart surface — unlike the gold it replaced, which at 1.79:1 was a
  *fill* color, not a mark color). Counts moved **off the accent blue** in the
  same change: purple and blue are neighbouring hues at near-identical
  lightness, exactly the pair red-green colorblind viewers cannot separate, so
  the two trend lines would have read as one. The steps are now
  `#6c3ef4`/`#c2410c` light and `#9574f7`/`#f08c4b` dark — complementary sides
  of the wheel, each ≥ 4.8:1 against its own surface, with dark selected
  against `#1e1e1e` rather than flipped.
- **Hover is part of the chart**: crosshair + tooltip on the trend (hit
  targets are full-height columns, far bigger than the marks), per-slice
  hover on the donut. Values are direct-labeled selectively — never a number
  on every point.
- Reserved status colors (danger for Cancelled) are used as *status*, never
  as "series 3".

### Pages (`admin/pages/`, all lazy chunks)

| Route | Page |
| ----- | ---- |
| `/` | **Dashboard** — one request (`GET /admin/dashboard`) feeds everything, so tiles can't disagree with the chart beside them. Range toggle 7/30/90d, revenue/orders trend, payment-split donut, order-pipeline bars, top stores/products, latest orders, low stock, and an integration-health banner when the gateway or push is unconfigured. **Every counter is a link** — pipeline bars and low-stock rows land on the target page already filtered. |
| `/orders`, `/orders/:id` | Platform-wide orders. Read-only: the seller owns fulfilment. Detail adds the joins the seller can't see (customer account, gateway reference) plus a lifecycle timeline built from the order's own timestamps. |
| `/payments` | The same order rows through the money lens, with per-status totals for the current filter. |
| `/products` | Seller catalog across stores, with the hide/restore moderation switch (always asks for a reason — the seller is notified immediately). |
| `/stores`, `/stores/:id` | Stores + owners. Detail carries suspension and **manual payout-account verification** (account numbers masked to the last 4). |
| `/customers`, `/customers/:id` | Buyers and sellers (same account type), with blocking. The dialog states both effects: no future sign-in **and** every session revoked. |
| `/support`, `/support/:ticketId` | The support queue — **sellers and shoppers in one list** (never a shopper's thread with a shop: those are the seller's to answer), filterable by `scope` (two pages would just mean one of them going unread), each row carrying a Seller/Shopper chip. Defaults to the **Needs reply** tab (open + in progress) sorted **oldest activity first** — a queue's job is to show what is still owed, which is the opposite of every other table here. The detail page carries the thread, the reply box (replying moves OPEN → IN_PROGRESS on its own) and triage: status saves on change and notifies the reporter, priority is internal and silent. |
| `/notifications` | This admin's feed, the per-device push toggle, and the platform broadcast (confirm-with-preview — a broadcast can't be recalled). |
| `/activity` | The append-only admin audit trail, filterable by action and record type. |
| `/admins` | SUPER_ADMIN only: create, promote/demote, deactivate, reset password. |

`features/adminApi.ts` is the one place that knows the admin API's shape;
`features/useAdminQuery.ts` holds the two data hooks — `useAdminQuery` (one
resource) and `useAdminList` (**filters live in the URL**, so back/forward
work, a filtered view is shareable, and a filter change resets to page 1).
Both discard out-of-order responses via a request counter. `useAdminList`
takes an optional second type parameter for endpoints whose `meta` carries
more than the pagination counters (support adds `openCount`); it defaults to
`ListMeta`, so plain list pages are unaffected.

---

## Notifications & push (both apps)

Shared plumbing, one bell per app:

- `shared/notifications/notificationsApi.ts` — feed + subscription client;
  `notificationsApi('admin' | 'customer')` picks the prefix, the endpoints are
  otherwise identical (the server decides whose feed it is from the session).
- `shared/push/usePushSubscription.ts` — the whole Web Push handshake as a
  hook, resolving to `checking | unsupported | unconfigured | denied | off |
  on` so the UI can *explain* rather than throw. **Permission is only ever
  requested from a button press** — an unprompted dialog is the fastest way
  to get notifications blocked for good, and a block can't be undone from the
  page.
- `public/push-sw.js` — the service worker. Deliberately tiny: renders the
  notification, routes the click to an existing tab, **caches nothing and
  intercepts no fetches**, so it can never serve a stale app shell.
- `admin/layout/NotificationBell.tsx` and
  `storefront/layout/NotificationBell.tsx` — unread badge (polled once a
  minute; the list loads only when opened), latest items, per-device push
  toggle. The storefront bell is how a **seller** learns they have an order
  without watching their inbox; it uses a real navigation for `/order/…`
  links, which live in the anonymous public router the authed router doesn't
  know.

Full architecture: [`PUSH_NOTIFICATIONS.md`](./PUSH_NOTIFICATIONS.md).

---

## Analytics — Meta Pixel (storefront only)

Meta's base snippet (pixel `931826082697608`) sits verbatim in the head of
`index.html`, so it loads before the app bundle and fires the first
`PageView`. The **admin console (`admin.html`) has no pixel** — nothing about
operator activity belongs in an ad platform.

`shared/analytics/metaPixel.ts` is only what the snippet cannot do itself.
Every call in it no-ops when `fbq` is missing (ad blocker), so tracking can
never break a page.

- The pixel id is **hardcoded in the HTML**, not an env var — which also means
  dev and staging builds report to the same pixel. Filter them out in Events
  Manager, or gate the snippet if that noise starts to matter.
- `trackRouterPageViews(router)` is subscribed to **both** routers in
  `StorefrontApp.tsx` — a client-side navigation is invisible to the stock
  snippet, so without it Meta would only ever see the first URL of a visit.
  Whichever router the page load did not mount never navigates, so it never
  double-counts.
- `trackCompleteRegistration(method)` fires on **account creation only**:
  after `registerVerify` (verify-first — no account exists until then), and
  after OTP/Google sign-in when the backend reports `isNewUser`. A returning
  sign-in must never fire it; that would train Meta's delivery model on the
  wrong people.
- The snippet's `<noscript>` tracking image is kept as Meta issues it, though
  it can never fire: the app needs JS to render at all.

Adding a funnel event (`ViewContent`, `AddToCart`, `InitiateCheckout`,
`Purchase`) means calling `trackEvent()` at the point the thing actually
happened — after the server confirms, not on the click.

---

## Tech Stack

| Concern       | Choice                                        |
| ------------- | --------------------------------------------- |
| Build tool    | Vite 8 (multi-page: two HTML entries)         |
| Framework     | React 19                                      |
| Language      | TypeScript (strict, bundler resolution)       |
| Styling       | Tailwind CSS v4 (`@tailwindcss/vite`) + skillui token theme (dark default / light / per-store), see Design System |
| HTTP          | axios (shared client in `src/shared/auth/http.ts`) |

> `react-router-dom` v7 powers the storefront's authed shell
> (`storefront/app/router.tsx`, lazy page chunks). The admin app has no
> router yet. `react-easy-crop` powers the crop-before-upload dialog in
> `shared/media/`.

---

## Directory Layout

```
frontend/
├── index.html               # Storefront entry → src/storefront/main.tsx
├── admin.html               # Admin entry      → src/admin/main.tsx
├── vite.config.ts           # Multi-page build + dev subdomain router + /api & /uploads proxy
├── .env.example             # VITE_API_URL (optional — dev uses the proxy) +
│                            #   VITE_GOOGLE_MAPS_API_KEY (optional — Footer map picker)
└── src/
    ├── index.css            # Tailwind entry + base styles
    ├── shared/
    │   ├── favicon.ts           # Runtime tab-icon control: store pages swap the
    │   │                        #   favicon to the store's logo (app default when
    │   │                        #   none / on leaving — used by PublicStoreLayout)
    │   ├── usePageTitle.ts      # Per-page document.title ("Part · Part · UnieMax")
    │   ├── useGoBack.ts         # Back controls that STEP BACK (navigate(-1)) instead
    │   │                        #   of pushing the previous page again, with a
    │   │                        #   replace-fallback for direct opens
    │   ├── theme/               # Design-system tokens + runtime theming — see below
    │   │   ├── index.ts          # Barrel: `theme` aggregate + re-exports
    │   │   ├── colors.ts         # palette + dark/light schemes + semantic colors
    │   │   ├── typography.ts     # font families, weights, size scale, textStyles
    │   │   ├── spacing.ts        # 4px-grid scale + `space(n)` helper
    │   │   ├── radius.ts         # border-radius scale (2/3.2/4/6/50px, pill)
    │   │   ├── shadows.ts        # floating + glow elevation tokens
    │   │   ├── mode.ts           # dark/light controller (localStorage + <html data-theme>)
    │   │   ├── ThemeProvider.tsx # context: useTheme() → { mode, setMode, toggle }
    │   │   └── ThemeToggle.tsx   # sun/moon toggle button
    │   ├── ui/
    │   │   ├── form.tsx          # Auth primitives: AuthLayout (split screen), Hero,
    │   │   │                     #   AuthCard, TextField, Select (themed, custom
    │   │   │                     #   chevron), SegmentedTabs, buttons, icons
    │   │   ├── AppLogo.tsx       # UnieMax brand art: AppLogoFull (splash screens —
    │   │   │                     #   public/app_logo.png, the bag mark, also the
    │   │   │                     #   tab icon in both HTML entries) + AppLogoLockup
    │   │   │                     #   (mark + name; size by HEIGHT only, the aspect
    │   │   │                     #   ratio sets the width; tone="on-dark" for the
    │   │   │                     #   auth heroes)
    │   │   ├── ConfirmDialog.tsx # Reusable confirmation modal (used by logout).
    │   │   │                     #   Portals into document.body — callers mount it
    │   │   │                     #   beside their trigger, and a `backdrop-blur`
    │   │   │                     #   ancestor (the sticky headers) is a containing
    │   │   │                     #   block for `fixed`, which pinned the overlay to
    │   │   │                     #   the header instead of centring it on screen
    │   │   └── socialIcons.tsx   # Social brand glyphs + SOCIAL_META (label + icon per platform)
    │   ├── analytics/
    │   │   └── metaPixel.ts     # Meta Pixel: SPA PageView + CompleteRegistration
    │   │                        #   (layers on the index.html base snippet)
    │   ├── maps/
    │   │   └── googleMaps.ts     # Maps JS API script loader (VITE_GOOGLE_MAPS_API_KEY,
    │   │                         #   minimal typings) + googleMapsLink() builder
    │   ├── share.ts              # shareOrCopy + copyToClipboard (native sheet / clipboard)
    │   ├── media/                # Upload building blocks (logo + product media)
    │   │   ├── mediaConfig.ts    # Server upload rules (/public/media-config) +
    │   │   │                     #   validateFile/acceptAttr/ruleHint helpers
    │   │   ├── cropImage.ts      # Canvas crop → WebP (≤1600px, q0.85) — only the
    │   │   │                     #   cropped, compressed image is ever uploaded
    │   │   └── ImageCropDialog.tsx # react-easy-crop modal (fixed aspect, zoom)
    │   └── auth/
    │       ├── http.ts           # Axios client (cookies + CSRF + ApiError)
    │       ├── authApi.ts        # Typed customer/admin auth endpoints
    │       └── useSession.ts     # Cookie-session hook (loading/guest/authed)
    ├── storefront/
    │   ├── main.tsx              # Mounts <StorefrontApp/>
    │   ├── StorefrontApp.tsx     # Session gate (splash ↔ login ↔ routed shell)
    │   ├── app/
    │   │   ├── router.tsx        # Marketplace router: public / + /login + guarded account subtree
    │   │   ├── publicRouter.tsx  # Public storefront + cart routes (no sign-in)
    │   │   ├── navigation.ts     # Account-menu nav config (single source of truth)
    │   │   ├── marketSession.tsx # Whole-session context (loading/guest/authed) + provider
    │   │   ├── RequireCustomer.tsx # Route guard: guest → /login?next=…, authed → SessionProvider
    │   │   ├── sessionContext.ts # CustomerSession context + useCustomerSession()
    │   │   └── SessionProvider.tsx # Provides { customer, signOut } to the tree
    │   ├── layout/
    │   │   ├── AppLayout.tsx     # Authed shell: sticky top bar + Outlet (no sidebar)
    │   │   ├── AccountMenu.tsx   # Top-bar avatar dropdown (account links + logout)
    │   │   ├── useSignOutConfirm.ts # Shared confirm-then-sign-out flow
    │   │   ├── Avatar.tsx        # Photo or initial fallback (header + profile)
    │   │   └── icons.tsx         # Inline stroke icons for the shell
    │   ├── features/
    │   │   ├── addresses/        # Customer address book
    │   │   │   ├── addressesApi.ts # Typed client for /api/v1/addresses
    │   │   │   └── AddressForm.tsx # Shared add/edit form (Saved Addresses + checkout)
    │   │   ├── support/          # Support tickets — ONE set of parts, three
    │   │   │   │                 #   entry points (account menu · a store's
    │   │   │   │                 #   UnieMax Support · a storefront's Help)
    │   │   │   ├── supportApi.ts # Typed clients + labels + per-audience topic lists
    │   │   │   ├── SupportContactCard.tsx # Email/phone/hours (fallback-first)
    │   │   │   ├── NewTicketForm.tsx # Raise a ticket (topics passed in)
    │   │   │   ├── TicketList.tsx    # The reporter's tickets (relative row links)
    │   │   │   ├── TicketThread.tsx  # Conversation + reply + close
    │   │   │   └── ticketMeta.tsx    # Status chip + thread timestamp format
    │   │   ├── discovery/        # Marketplace homepage data layer
    │   │   │   ├── discoveryApi.ts # /public/stores · /public/products · /public/search · /public/categories · /public/stats
    │   │   │   └── recentActivity.ts # localStorage recent searches + recently viewed stores
    │   │   ├── cart/
    │   │   │   ├── cart.ts       # Client-side cart: localStorage store + hooks + sync()
    │   │   │   └── useCartRevalidation.ts # Cart-open price/stock refresh
    │   │   ├── publicStore/      # The multi-page storefront under /store/{slug}
    │   │   │   ├── useStoreShells.ts # Session-cached shell lookup (logo+theme) for cart/checkout
    │   │   │   ├── PublicStoreLayout.tsx # Shell: fetches store once + usePublicStore()
    │   │   │   ├── StoreHeader.tsx   # Logo · Home · Categories ▾ · search · share · cart
    │   │   │   ├── StoreFooter.tsx   # Owner-configured footer (locations, social, support…)
    │   │   │   ├── ShareButton.tsx   # Share/copy-link control (store + product)
    │   │   │   ├── ProductListing.tsx# Shared body for category + search pages
    │   │   │   ├── ListingControls.tsx # Sort/filter bar, breadcrumb, LoadMore, empty states
    │   │   │   ├── ProductCard.tsx   # Listing card + responsive ProductGrid
    │   │   │   ├── useProductQuery.ts# Server-paginated listing (debounce + race guard)
    │   │   │   ├── catalog.ts        # Filter state + stock-level presentation only
    │   │   │   ├── storeTheme.ts     # Per-store CSS-var theming + metal tokens (storeVars) + SKIN
    │   │   │   ├── CartControls.tsx  # PurchaseActions (qty + Add to Cart + Buy Now),
    │   │   │   │                     #   QuantityStepper, AddedToast, StockBadge
    │   │   │   ├── productDescription.ts # Description → highlights / specs / prose
    │   │   │   └── FilterPanel.tsx   # Availability + Price filters (slide-over/bottom sheet)
    │   │   └── stores/           # Customer-owned stores (see Stores feature above)
    │   │       ├── storesApi.ts  # Typed HTTP client for /api/v1/stores
    │   │       ├── useStores.ts  # useStores (list) + useStore (by id) hooks
    │   │       └── useManagedStore.ts # Outlet-context hook for manage sections
    │   └── pages/
    │       ├── LoginPage.tsx     # Email+password · Google (dev) · phone OTP
    │       ├── LoginRoute.tsx    # /login route: ?next= handling + already-authed redirect
    │       ├── HomePage.tsx      # Marketplace homepage: hero+collage, New Stores, Fresh Finds, seller CTA
    │       ├── InfoComingSoonPage.tsx # Public placeholder for /about /privacy /terms /contact
    │       ├── ProfilePage.tsx   # /profile — account details + mobile-number linking (SMS OTP)
    │       ├── AddressesPage.tsx # /addresses — saved delivery addresses (one primary)
    │       ├── SupportPage.tsx   # /support — shopper → UnieMax (contact + tickets)
    │       ├── SupportTicketPage.tsx # /support/:ticketId — one ticket thread
    │       ├── OrdersPage.tsx    # /orders — the customer's order history
    │       ├── store/            # Public storefront pages (no sign-in)
    │       │   ├── StoreHomePage.tsx     # Hero, featured categories, merchandising rows
    │       │   ├── StoreCategoryPage.tsx # Breadcrumb, subcategory chips, listing
    │       │   ├── StoreProductPage.tsx  # Gallery (zoom/swipe) + purchase card +
    │       │   │                         #   highlights/description/specs + sticky bar
    │       │   └── StoreShopPage.tsx     # Browse all / ?q= search results
    │       ├── cart/
    │       │   ├── CartPage.tsx       # /cart — items grouped by store + totals
    │       │   ├── CartStorePage.tsx  # /cart/{storeSlug} — all items of one store (store-themed)
    │       │   ├── CheckoutPage.tsx   # /checkout/{storeSlug} — per-store order review (store-themed)
    │       │   ├── StoreLogo.tsx      # Logo badge w/ store-glyph fallback (cart pages)
    │       │   ├── CheckoutSteps.tsx  # Delivery details → payment method steps
    │       │   ├── OrderSuccessPage.tsx # /order/{slug}/{orderId} confirmation
    │       │   └── CartLine.tsx       # Shared line row (stepper, remove, total)
    │       └── stores/
    │           ├── StoresPage.tsx       # My Stores list / first-run empty state
    │           ├── CreateStorePage.tsx  # Name + logo (minimal by design)
    │           ├── StoreManageLayout.tsx# Left sections card + right <Outlet/>
    │           ├── StoreDashboardPage.tsx # Manage landing: order stats + latest orders
    │           ├── StoreOrdersPage.tsx  # Seller orders list (status tabs, search, Load More)
    │           ├── StoreOrderDetailPage.tsx # One order: items, timeline, status actions + cancel
    │           ├── orderMeta.tsx        # Shared status chips / payment labels / date formats
    │           ├── StorePublishCard.tsx # Publish/Unpublish toggle + Share Store
    │           ├── StoreDetailsPage.tsx # Name + logo upload (crop → progress → replace/remove)
    │           ├── ProductMediaManager.tsx # Per-product photos (8, DnD reorder, cover) + video
    │           ├── NewProductPhotos.tsx # Add-Product photo picker: crops locally,
    │           │                     #   uploads after the product id exists
    │           ├── StoreAppearancePage.tsx # Colors + live preview
    │           ├── StoreHomepagePage.tsx # Show/hide storefront homepage sections
    │           ├── StoreFooterPage.tsx  # Footer manager: locations, social, info,
    │           │                        #   support, policy links, links, copyright
    │           ├── LocationMapPicker.tsx # Google Maps search + pin picker (lat/lng;
    │           │                        #   manual-coordinates fallback without a key)
    │           ├── StoreBankPage.tsx    # Payout bank accounts (max 5, one primary,
    │           │                        #   verification status chips)
    │           ├── StorePaymentsPage.tsx # Accept Online Payment / COD switches
    │           │                        #   (confirm-before-save)
    │           ├── StoreShippingPage.tsx # Fulfilment mode: Delivery / Pickup / Both
    │           │                        #   (confirm-before-save)
    │           ├── StoreCheckoutPage.tsx # Which checkout fields to collect
    │           │                        #   (7 toggles, hidden = not validated)
    │           ├── StoreSupportPage.tsx # UnieMax Support: contact + this store's tickets
    │           ├── StoreSupportTicketPage.tsx # One UnieMax thread + reply/close
    │           ├── StoreCustomerSupportPage.tsx # The shop's inbox (buyers' requests)
    │           ├── StoreCustomerSupportTicketPage.tsx # One request + reply + status
    │           ├── StoreCategoriesPage.tsx # Add/list/rename/collapse/toggle/delete categories
    │           ├── StoreProductsPage.tsx # Add/list/toggle/delete products (category-gated)
    │           └── ActiveSwitch.tsx     # Enable/disable pill switch (rows)
    └── admin/                   # Platform console — served at /admin
        ├── main.tsx             # Mounts <AdminApp/>
        ├── AdminApp.tsx         # Session gate + BrowserRouter basename="/admin"
        ├── app/
        │   ├── router.tsx       # Lazy routes under the shell
        │   ├── adminSession.tsx # Context + silent refresh, idle logout, 401 drop-out
        │   └── navigation.ts    # NAV_GROUPS + per-path document titles
        ├── layout/
        │   ├── AdminLayout.tsx  # Rail (lg+) / drawer (below) + top bar
        │   ├── NotificationBell.tsx # Unread badge + feed dropdown
        │   └── icons.tsx        # Six inline shell glyphs
        ├── ui/                  # ISOLATED console kit (see "Admin console")
        │   ├── primitives.tsx · DataTable.tsx · Toolbar.tsx
        │   ├── statusMeta.tsx · StatTile.tsx · charts.tsx · format.ts
        ├── features/
        │   ├── adminApi.ts      # Typed client for /api/v1/admin/**
        │   └── useAdminQuery.ts # useAdminQuery + useAdminList (URL filters)
        └── pages/               # LoginPage + 11 lazy console pages
```

Keep app-specific code under `storefront/` or `admin/`, and put anything both
apps must share under `src/shared/`. **`storefront/` must never import from
`admin/`** (or vice versa) — that would defeat the bundle separation.

---

## Design System — Theme Tokens (`shared/theme/`)

The authoritative design system lives in the repo-root `skillui/` package
(the **anydesk** system: dark-themed, cool palette, 4px grid). Its colors,
spacing, radius and type scale are used as-is; the typefaces are the one
deliberate deviation (Oswald + Inter instead of Times New Roman + Noto
Sans, adopted from the approved UnieMax prototype — see below). **Read `skillui/SKILL.md` before building
any UI.** Its tokens are materialized into reusable TypeScript constants
under `src/shared/theme/` — the single source both apps import instead of
hardcoding colors, fonts, spacing, radii, or shadows:

| File            | Exports                                                        |
| --------------- | ------------------------------------------------------------- |
| `colors.ts`     | `palette` (raw hex) + `colors` (semantic: `background`, `surface`, `border`, `text.*`, `brand.*`, `accent`, `status.*`, `overlay.*`) |
| `typography.ts` | `fontFamily`, `fontWeight`, `fontSize`, `lineHeight`, `letterSpacing`, and spreadable `textStyles` (`h1`–`h3`, `body`, `caption`) |
| `spacing.ts`    | `spacing` (px strings) + `spacingPx` (numbers) + `space(n)` 4px-grid helper |
| `radius.ts`     | `radius` scale (`xs`/`sm`/`md`/`lg`/`pill`/`full`) + `defaultRadius` |
| `shadows.ts`    | `shadows` (`floating`, `glowRed`)                             |
| `index.ts`      | barrel — re-exports all + a `theme` aggregate object          |

The approved brand palette is five colors:

| Name | Hex | Role |
| ---- | --- | ---- |
| Primary Purple | `#6c3ef4` | `--brand` — CTAs, links, prices, chart-1 |
| Dark Purple | `#5428d9` | `--brand-hover` + the brand gradient's far stop |
| Black | `#111111` | the lockup's "Unie"; the label on the dark scheme's brand |
| White | `#ffffff` | `--brand-contrast` — text ON the brand in light |
| Light Purple | `#f3f0ff` | `--brand-soft` — selected rows, chips, soft wells |

Accent convention: the brand purple drives CTAs and links
(`colors.brand.primary`); blue **`#1863dc`** (`colors.accent` /
`colors.focusRing`) is still reserved for focus rings and active states.
**Color is the one deliberate deviation from the skill** (an approved brand
palette replacing its red) — structure, spacing, radius, shadows and the type
scale still come from skillui unchanged, and no colors outside the palette
are invented; one derived step, `#9574f7` = `lighten(#6c3ef4, .28)` (the same
derivation `storeVars()` uses for the metal edge), carries the dark scheme.

Because the purple is a **dark** color, text placed on it is white
(`--brand-contrast` / `--cta-contrast`), never the ink the gold needed.
`--danger` is independent of the brand and stays red `#ef443b`.

**The brand is the one non-neutral that flips per scheme.** `#6c3ef4` reads
at 5.8:1 on white but only 3:1 on the dark canvas, which fails AA for links
and prices — so the dark scheme steps `--brand` up to `#9574f7` (5.0:1) and,
because that is now a *light* fill, flips `--brand-contrast` to the palette's
Black. `--brand-gradient` follows suit. Two things deliberately do **not**
flip: `--brand-metal*` (the metal-CTA fallbacks, cut from `#6c3ef4`) and
`--cta-contrast` (white), which pair with each other in both schemes.

### Brand art (`public/` + `AppLogoLockup`)

Two supplied RGBA assets, both trimmed of their transparent margin and
downscaled for the web (the originals were 1–1.3 MB):

| File | What | Used by |
| ---- | ---- | ------- |
| `app_logo.png` | the bag mark — white U on the brand purple, 453×512 | `AppLogoFull` (splash screens), the tab icon in both HTML entries, `favicon.ts`, `push-sw.js` |
| `app_logo_with_name.png` | the lockup — mark + "UnieMax", 888×224 | `AppLogoLockup` (light scheme) |
| `app_logo_with_name_dark.png` | the same lockup with "Unie" lifted to white | `AppLogoLockup` (dark scheme + `tone="on-dark"`) |

The lockup sets **Unie** in near-black and **Max** in the purple, so it needs
the dark twin — the black half would vanish on the dark canvas. The swap is a
**CSS variable** (`--logo-lockup`, flipped by `:root[data-theme='dark']`)
painted through the `.logo-lockup` utility rather than two `<img>` tags, so
the browser only fetches the file it actually paints. The utility carries the
artwork's `aspect-ratio`, which is why callers set a **height only**
(`h-7`…`h-11`) and never a width. `tone="on-dark"` pins the white-name twin
for the auth heroes, which sit on a dark photo in both schemes.

The lockup is the brand signature everywhere the name appears as a mark: the
marketplace header and footer, the authed top bar, both login pages, the
admin rail/drawer/mobile header, and the coming-soon page. Prose mentions
("Sell on UnieMax", "Powered by UnieMax") stay plain text.

> ⚠️ `src/index.css` is the **runtime source of truth** for every color.
> `shared/theme/colors.ts` mirrors the same values as typed constants for
> JS-side consumers, but no component reads it — editing it alone changes
> nothing on screen. Keep the two in step.

### Global scale

The root font size is **90%** (`html { font-size: 90% }` in `index.css`) —
an approved design decision matching 90% browser zoom. Every rem-derived
Tailwind size (text, spacing, heights) scales with it across both apps;
pixel values (borders, the 1920px shell cap) are unaffected. Don't
compensate with larger per-component sizes — the compact scale is intended.

### Light / dark theming (runtime)

**Colors are the only themeable axis** — typography, spacing, radius and
shadows are global skill tokens and never change. `index.css` defines the
whole palette as CSS variables and maps them into Tailwind v4 via
`@theme inline`, so a fixed set of **semantic utilities** flip at runtime:

| Utility | Role | Utility | Role |
| ------- | ---- | ------- | ---- |
| `bg-bg` | page canvas | `text-fg` | primary text |
| `bg-surface` | cards / panels / bars | `text-muted` | secondary text |
| `bg-surface-alt` | wells / hover tracks | `border-line` | borders / dividers |
| `bg-input` | input fields | `bg-brand` / `text-brand` | CTAs / links (purple) |
| `text-brand-contrast` | text on brand (white) | `bg-accent` / `text-accent` | focus / active (blue) |
| `bg-brand-soft` | brand tint (Light Purple) | `logo-lockup` | the brand lockup (see *Brand art*) |
| `text-danger` / `success` / `warning` | status | `shadow-floating` | elevation |
| `rounded-md` (4px) · `rounded-lg` (6px) · `rounded-pill` (50px) | radius | `font-heading` / `font-body` | Oswald / Inter |

**Card hover language** (marketplace grids): `shadow-floating` at rest →
`hover:-translate-y-1` (4px lift) + `hover:shadow-lifted` (the deeper
zero-offset halo token) + `group-hover:scale-105` on the image, over
`duration-200` / `duration-500`. Store cards, product cards and the
Recently-Viewed pills all share it. (Per-store pages keep `metal-lift`
instead — that halo is tinted from the owner's own color.)

**`dark:` variant.** `index.css` declares
`@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *))`,
so `dark:` follows **our** toggle rather than Tailwind's default
`prefers-color-scheme` (which would ignore it entirely). Reach for it **only
where a treatment must genuinely differ per scheme** — semantic tokens already
cover everything that merely changes color. It compiles inside `:where()`, so
it carries no extra specificity and wins purely on source order (Tailwind emits
variants after their base utilities, which is what makes `text-fg
dark:text-brand` resolve correctly).

**Nothing uses it today.** Its one user was the selected-state rule on
`/stores/{slug}`, which swapped carrier per scheme because the light gold was
illegible on white; now that the brand carries its own dark step, the section
nav and the Today's Orders tile use one rule in both schemes — a solid brand
**left bar** over the `bg-brand-soft` tint with an ink label. Every nav row
still carries a transparent left border so the text never shifts on selection.

**The seven neutrals and the brand step flip**; accent and status live once
on `:root` and are shared by both schemes.

| Var (utility) | Light (default) | Dark |
| ------------- | --------------- | ---- |
| `--bg` (`bg-bg`) | `#f8f8f8` | `#121212` |
| `--surface` (`bg-surface`) | `#ffffff` | `#1e1e1e` |
| `--surface-alt` (`bg-surface-alt`) | `#f1f1f1` | `#0c0c0c` |
| `--input-bg` (`bg-input`) | `#ffffff` | `#1a1a1a` |
| `--line` (`border-line`) | `#e8e8e8` | `#2a2a2a` |
| `--fg` (`text-fg`) | `#1a1a1a` | `#f8f8f8` |
| `--fg-muted` (`text-muted`) | `#707070` | `#9a9a9a` |
| `--brand` (`bg-brand`/`text-brand`) | `#6c3ef4` | `#9574f7` |
| `--brand-hover` | `#5428d9` | `#aa90f9` |
| `--brand-contrast` (`text-brand-contrast`) | `#ffffff` | `#111111` |
| `--brand-soft` (`bg-brand-soft`) | `#f3f0ff` | `rgba(149,116,247,.16)` |
| `--logo-lockup` | `app_logo_with_name.png` | `…_dark.png` |

Only `#121212` was specified for the dark scheme; the other six neutrals are
derived from it, and the secondary text is lifted to `#9a9a9a` because
`#707070` fails AA against `#121212`.

- **Brand gradient.** The signature brand treatment (`--brand-gradient`:
  `#6c3ef4`→`#5428d9` in light, its light steps in dark) is exposed as two
  utilities — `bg-brand-gradient` (hero surfaces, brand logo/avatar marks,
  **primary CTAs**) and `text-brand-gradient` (gradient display text). Both
  stops carry `--brand-contrast` at ≥ 4.5:1 in either scheme, which is what
  lets one token serve as both a fill and a text color. A third,
  **`text-brand-gradient-on-dark`** (`--brand-gradient-on-dark`: Light Purple
  → `#9574f7`, fixed), covers display text that sits on a dark photo in both
  schemes — the two auth heroes. Solid `bg-brand`/`text-brand` stays the
  default for chips, dots, links and status; the gradient is **app chrome
  only** — destructive confirms keep solid color, and per-store pages
  (`/store/{slug}`) use their own owner-derived metal-accent gradients instead
  (see *Metal accents* below), never this brand one.
  Gradient CTAs use `hover:opacity-90` and `disabled:bg-none` (so the muted
  disabled color shows through).
- **Light is the default** (the brand palette is light-first). The mode lives
  on `<html data-theme>`; `:root` holds the light values — so the pre-JS paint
  already matches the default and never flashes — and
  `:root[data-theme='dark']` carries the dark overrides.
- `shared/theme/mode.ts` persists the choice to `localStorage`
  (`uniemax-theme`) and applies it; `initThemeMode()` runs in each
  `main.tsx` before render (no flash). `ThemeProvider` exposes
  `useTheme() → { mode, setMode, toggle }`; `ThemeToggle` (sun/moon) sits in
  the storefront top bar. Both apps are wrapped in `ThemeProvider`.
- **Fonts** (a deliberate deviation from the skill's Times New Roman / Noto
  Sans pairing, adopted from the approved UnieMax prototype
  `prototype/index.html`): headings/display use **Oswald** — a condensed,
  athletic face carrying a constant **+0.02em tracking** (applied by the base
  `h1–h3` rule and re-asserted by the `font-heading` utility, which therefore
  also wins over `tracking-tight`; Oswald must never be tightened further).
  Body/UI uses **Inter**. Both are SIL OFL and self-hosted as latin variable
  files: `public/fonts/Oswald-Variable.woff2` (~28 KB, wght 200–700) and
  `public/fonts/Inter-Variable.woff2` (~73 KB, wght 100–900), with Segoe UI /
  `system-ui` fallbacks. Only these two families are allowed. Display
  conventions from the prototype: section headings `text-2xl sm:text-3xl`
  semibold, hero `text-4xl sm:text-6xl` bold `leading-none`, product-card
  names `text-lg` medium `leading-tight` — 700 is reserved for the hero/brand,
  because condensed Oswald reads cramped when bolded at small sizes.
  **User-typed names in the authed app** (store names on the My Stores cards,
  the "Managing …" header) render in the body face instead — add `font-body
  tracking-normal` to the heading element — because the condensed display
  face suits page headings and storefront display, not people's own names.
  The **store-management section headings** (`/stores/{slug}` — Store
  Details, Appearance, Homepage, Footer, Categories, Products and their
  in-card subheads) also use `font-body font-semibold tracking-normal`:
  they are workbench UI, and bolded condensed Oswald read cramped at those
  small sizes.
  The storefront keeps Oswald for store/product names deliberately (that's
  the prototype's brand look). The
  storefront brand mark (store name in header/footer) uses `metal-text` —
  gradient display text cut from the owner's primary (prototype's
  `gold-text`).

### Per-store theming (`/store/{slug}`) + metal accents

The public store page is themed by the **store owner**, not by the app's
dark/light mode. `PublicStoreLayout` calls `storeVars(theme)` (the store's
Appearance settings, in `features/publicStore/storeTheme.ts`) to set the
same CSS variables (`--bg`, `--surface`, `--fg`, `--brand`, …) **on the page
root** — neutrals derived from the background's luminance — so every
semantic utility resolves to the store's palette while spacing / fonts /
radius stay global. Color roles: **primary** owns the metal (CTA chrome,
hover glow, brand-mark gradient); the optional **secondary** re-points the
flat brand usages (`--brand`: prices, links, chips, focus); the optional
**surface** replaces the derived card/panel color (wells and borders then
derive from it); and the optional **button text** color sets `--cta-contrast`
(the `text-cta-contrast` utility used by `SKIN.cta`) — on Auto it contrasts
the **primary** (white/black by luminance), deliberately NOT the secondary,
since the CTA background is painted from primary (deriving it from secondary
used to put dark text on dark buttons when the two diverged). All three are
`null` = Auto by default, which reproduces the derived behaviour exactly. Because the neutrals are computed, a
malformed hex would render as flat grey rather than being harmlessly ignored
by CSS, so `storeVars()` falls back to the default theme colors (and treats
malformed optional colors as Auto) for any value failing
`^#[0-9a-fA-F]{6}$`.

**Metal accents — deliberately scarce.** Surfaces, bars, chips and wells are
FLAT semantic colors; the shine is reserved for the places that should read as
important. Only three `.metal-*` utilities exist (`index.css`):

| Utility | Role |
| ------- | ---- |
| `metal-cta` | primary CTA, chrome gradient cut from the owner's brand color |
| `metal-lift` | interactive card hover: small rise + evenly-spread brand halo |
| `metal-text` | gradient display text for the store's brand mark (header/footer name) |

Both are tinted from the **owner's own colors** (never a fixed grey), so each
store's shine matches its brand. `metal-lift`'s hover shadow (`--metal-glow`)
deliberately has **zero x/y offset**, so the halo spreads equally on all four
sides instead of pooling under the card — the same principle as the skill's
`--shadow-floating`. (An earlier iteration brushed gradients over every
surface — header, chips, wells, cards; it read as noise and was flattened, so
the metal now marks importance rather than texture.)

> These gradients are a **deliberate, scoped deviation** from the skill's
> "solid colors only" rule (same precedent as the brand gradient). They apply
> to the store-themed shopping surfaces only — `/store/{slug}` plus the
> cart/checkout pages' primary CTAs (Place Order, Deliver to This Address),
> which follow the owner's palette; `index.css` carries neutral `--brand-metal*`
> fallbacks cut from the app red so a `/cart` with no known store still
> renders them. The rest of both apps stays flat and solid. Using `metal-cta
> text-cta-contrast` is also what makes the owner's **Button text color**
> setting apply to these buttons.

The `SKIN` object in `storeTheme.ts` maps semantic slots (`surface`, `well`,
`chip` — all flat — and `cta` → `metal-cta`), so storefront components stay
declarative. `StoreAppearancePage` edits the two colors with a live
mini-preview built from the same semantics, so the preview is a true
miniature.

**Layout width.** Storefront pages are **full-bleed** like a real shop — the
header, footer and each page's `StorePageShell` share `max-w-[1920px]` (a soft
cap for ultrawides only) with `lg:px-10` padding, instead of a centered column.
`<main>` itself is unpadded so the homepage's section bands can run truly
edge-to-edge. Open-ended product grids run 2 → 3 → 4 → 5 → **6 columns (2xl)**;
the homepage merchandising rows use the same ramp and hide the surplus per
breakpoint, so each row is always exactly full.

---

## How the Two Apps Are Kept Separate

### 1. Build time — separate bundles (`vite.config.ts`)

```ts
build: {
  rollupOptions: {
    input: {
      storefront: resolve(__dirname, 'index.html'),
      admin:      resolve(__dirname, 'admin.html'),
    },
  },
}
```

`npm run build` emits two independent entry HTMLs and two separate JS bundles
(`dist/assets/storefront-*.js`, `dist/assets/admin-*.js`). Shared code is
factored into a common chunk; app-specific code stays in its own bundle.

### 2. Dev server — `/admin` routing

In production nginx serves `admin.html` for every path under `/admin`
(`location /admin { try_files $uri /admin.html; }`). A small Vite middleware
(`adminRouter` in `vite.config.ts`) does exactly the same locally, for both
`npm run dev` and `npm run preview`, so a deep link behaves identically in
all three:

| URL                                | Serves             |
| ---------------------------------- | ------------------ |
| `http://localhost:5173`            | Storefront         |
| `http://localhost:5173/admin`      | Admin              |
| `http://localhost:5173/admin/orders` | Admin (deep link)|
| `http://admin.localhost:5173`      | Admin (legacy sub-domain form, still honored) |

Only **top-level navigations** are rewritten (`Accept: text/html`), so JS, CSS
and images under `/admin/...` still resolve normally.

---

## Running Locally

```bash
cd backend && npm run dev     # API on :4000 (auth needs it)
cd frontend
npm install
npm run dev                   # single dev server, both apps; /api proxies to :4000
```

Then open:

- Storefront → <http://localhost:5173>  (email+password · Google dev · phone OTP; dev code **123456**)
- Admin      → <http://localhost:5173/admin>  (email/password — create one with `npm run create-admin`)

For push notifications in dev, generate a VAPID pair once
(`cd backend && npm run push-keys`) and paste it into `backend/.env`; without
it the feed still fills and the server logs each push instead of sending it.

`VITE_API_URL` is only needed when the API is **not** reachable through the
dev proxy (e.g. a remote backend).

Other scripts: `npm run build` (typecheck + build both), `npm run preview`
(serve `dist/`, subdomain router also active), `npm run lint`.

---

## Next Steps

1. **Real online-payment gateway** — checkout, order creation, Order
   Success, My Orders and seller order management are live; ONLINE payment
   is dev-simulated and refused (503) in production until the gateway
   lands. It also brings the real refund flow (cancelling a paid order
   currently marks it refunded, which today only hits dev-simulated
   payments).
2. Swap the Google dev-simulation for the official Google Identity Services
   button once `GOOGLE_CLIENT_ID` is decided (same `customerAuth.google()` call).
3. Account section UI for the remaining auth self-service (change/set password,
   phone/email linking — endpoints already live) and the remaining account
   placeholder (`/profile`). Wishlist/settings return as routes only when
   the features are actually built.
4. Shipping-charge rules (fixed/district/state — orders currently ship
   free) and customer-side order tracking/cancellation.
5. Per-kind notification preferences (a subscribed device currently gets
   every notification for its principal; the `kind` column is already there).

---

## Production Deployment Notes

- Build once (`npm run build`) → deploy `dist/` behind a proxy/CDN.
- nginx needs **two SPA fallbacks**, and `/admin` must come first:
  ```nginx
  location /admin { try_files $uri /admin.html; }   # console deep links
  location /      { try_files $uri /index.html;  }  # storefront
  ```
  Without the first block, `/admin/orders` falls through to the storefront
  and the console 404s on refresh.
- Lock `/admin` down separately (WAF / IP allow-list / auth at the edge) in
  addition to the backend's `requireAdmin` preHandler.
- `push-sw.js` is served from the site root (`/push-sw.js`) — it must not be
  rewritten by either fallback, which `try_files $uri` already guarantees
  since the file exists. Push also requires **HTTPS** (localhost excepted).
- Set `VITE_API_URL` per environment at build time.

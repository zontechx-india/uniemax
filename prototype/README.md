# UnieMax prototype — seller app + admin console

A clickable copy of the seller workspace (`/mystores/**`) and the admin console,
with dummy data. Use it to try a feature's screens and flow **before** building
it in React. Plain HTML, CSS and JavaScript: no React, no npm, no build step.

It is **not** the product: nothing here talks to the real API or database.

## Open it

On Windows, double-click **`prototype/start.cmd`**. It starts a tiny server and
opens <http://localhost:5180>. Close its window to stop. (Or run
`node prototype/server.js`.) Click **Open both apps** and put the two windows
side by side — a change in one shows up in the other.

- Seller sign-in: **Mobile OTP**, any 10-digit number, code **123456**
  (or Email tab: any email + any password).
- Admin sign-in: `anita@uniemax.com` + any password.
- Internet is needed: the Tailwind browser build loads from a CDN.

**Why a server, not just opening `index.html`?** Two reasons. The two apps sync
through the browser's `storage` event, which only works between pages from the
same address. And the server puts the real `frontend/src/index.css` into each
page, so the prototype looks exactly like the app and follows its theme.

## Files

```
prototype/
├── start.cmd              double-click to start (Windows)
├── server.js              tiny static server; puts the real index.css into pages
├── index.html             launcher: open the seller app, the console, or both
├── seller.html            seller page shell: <div id="app"> + scripts in order
├── admin.html             admin page shell (also loads the real admin.css)
├── pay.html               the customer's bill page (link a seller shares): #/b/<token>, list of links at #/
├── assets/styles.css      the control panel's layout (tokens only, no colours)
├── docs/BASE_REQUIREMENT.md   the product spec template — fill in per feature
├── docs/BILLS.md          Create a new bill — screens, rules and the real build plan
└── js/
    ├── icons.js           Icon('name') seller icons · AIcon('name') console icons
    ├── ui.js              html``, formatters, btn(), UI.toast/modal/confirm/empty/skeleton/errorState
    ├── data.js            mock data + demoState()
    ├── store.js           state, saving, STATUS maps, Q selectors, World rules, Act base, run()/later()
    ├── plans.js           Plans & pricing (new): Plans selectors, planCard(), the plan World rules
    ├── catalog.js         categories tree + ~1,050 products with variants (like the real schema), Catalog.search/take
    ├── bills.js           Bills (new): Bills selectors + totals, the bill World rules, demoBills()
    ├── router.js          App: screen stack (reg, go, back, replace, reset, set, refresh) + event wiring
    ├── app.js             start-up + the control panel
    └── screens/
        ├── auth.js        sign in (both apps)
        ├── seller.js      seller shell + screens + seller Acts
        ├── seller-plans.js  seller #/plans — plans, compare table, choose / Enterprise enquiry
        ├── seller-bills.js  seller #/bills, #/bills/new, #/bills/:id — list, create, item picker, share
        ├── pay.js         the customer's bill page (pay.html) — bill, OTP, address, pay, receipt
        ├── admin.js       console shell + screens + admin Acts
        ├── admin-plans.js   console #/plans + #/plans/:id — plans, feature matrix, billing rules, editor
        └── admin-bills.js   console #/bills + #/bills/:id, the order page's bill card
```

A feature file can add its own dialogs with `DIALOGS.kind = (dialog) => UI.modal(…)`
(`js/ui.js`), push to `AppConfig.jumps` / `AppConfig.simulate`, and register
screens with `App.reg` — so a new feature does not have to grow `seller.js` or `admin.js`.

Scripts load in a fixed order (see the bottom of `seller.html`); each file adds
global objects the next ones use. Design rules: the real
[`docs/DESIGN_GUIDELINES.md`](../docs/DESIGN_GUIDELINES.md).

## How it works

- **State.** `S()` is the shared world (stores, orders, tickets, payouts,
  notifications), saved in localStorage under `STORE_KEY`
  (`uniemax_proto_v6`). If the saved `STATE_VERSION` differs, it resets.
  `Store.ui` is each app's own screen state (session, filters, drafts).
- **Changes.** Screens never change state. Every change is an `Act.*` function
  that ends with `Act.commit()` (= save + re-render). Business rules live in
  `World.*` in `store.js`, so both apps follow the same ones.
- **Statuses.** `STATUS.order`, `.payout`, `.ticket` hold `{ label, tone, admin,
  adminTone, desc }` per status, plus `STATUS.orderFlow` (the allowed order).
- **Fake server.** `run(key, work)` waits like a network call, shows the loading
  state, fails when the control panel says so, and toasts the result.
  `later(ms, fn)` makes the other side answer (PaymentHub after 2.5 s, support or
  the seller after ~4 s when their app is closed).
- **Syncing.** Each change also writes to a shared event log; the other tab
  reloads the world and shows a toast. A heartbeat every 2 s tells each app if
  the other is open.
- **Loading / error states.** A screen with `skeleton` shows it for the network
  delay when you open it. "Network error" in the control panel makes the next
  load show an error with Retry.

## Control panel (desktop, left of the app)

Current screen · Jump to (signs you in if needed) · Load full demo data · Start
over as a new user · Empty data · Network error (next page load) · Action
failure (next action) · **Other side replies now** · app-specific simulations
(a new order, pause the shop, a seller ticket, a failed payout) · Offline ·
Network delay · whether the other app is open + auto-reply · Dark mode · the
shared event log. Hidden below 1024 px so phone layouts are seen clean.

## Flows to try

| Start in | Do this | The other app shows |
| -------- | ------- | ------------------- |
| Seller | Help from UnieMax → Ask a question | New ticket in Support, bell count |
| Admin | Reply, or change the ticket status | Reply in the thread, notification |
| Admin | Seller payouts → Pay | Earnings: "On its way", then "Paid" |
| Admin | Store → Suspend / Mark verified | Dashboard "paused" / Verified badge |
| Seller | Order → Confirm → Packed → Sent → Delivered | The order status in the console |
| Either | Control panel → A customer places an order | New order in both, seller notification |
| Seller | Jump to → Plans (new) → choose a plan | Store page "Plan" card, admin notification |
| Seller | On Pro, choose Starter | Queued for renewal; "Keep Pro" undoes it |
| Seller | Enterprise → Talk to us | An enquiry ticket in Support |
| Admin | Finance → Plans & pricing → edit a price, a feature, the billing rules | Seller's plan cards and compare table; a notification if it is their plan |
| Seller | Orders → Create a bill → Add items → Make bill → Send on WhatsApp → Open | The customer page (pay.html): pay with code 123456 → the seller gets a Confirmed order; admin → Seller bills |
| Seller | Create a bill → Customer paid me already | The order at once, paid in cash (in the shop: Delivered); admin Orders → Source: Seller bill |

## Bills — "Create a new bill" (new — not in the real app)

Full spec and the real build plan: [`docs/BILLS.md`](docs/BILLS.md). Data:
`db.bills` (shape at the top of `js/bills.js`); a paid bill is a normal order
with `source: 'BILL'` and `billId`, and the same 8-digit number. New orders in
the prototype now get 8-digit numbers like the real app; the older demo orders
keep `UM-…`. The customer's side (opening the link, paying) is played by the
control panel or the dashed "Prototype only" box on a waiting bill.

## Plans & pricing (new — not in the real app)

Data: `db.plans` (settings, list, features, history) and `store.subscription`
— shapes at the top of `js/plans.js`. Rules: upgrades and any choice during
the trial start now; a smaller plan starts at renewal. A price change follows
the admin's rule: existing sellers keep their price until renewal, or move now.
The trial plan and the after-trial plan must stay live and fixed-price. Only a
draft with no sellers can be deleted. Payment is pretend. The limits, yearly
discount, trial length and the Enterprise-only "Dedicated account manager"
are starting values, not decided product facts. The order fee per plan is
shown but does not change payouts yet. The seller nav has no link to it yet.

## Add a new screen

1. Write the screen in `js/screens/seller.js` (or `admin.js`):
   ```js
   const ReviewsScreen = {
     render(params, query) {
       const reviews = S().reviews.filter((r) => r.storeId === S().me.storeId)
       if (reviews.length === 0) return UI.empty({ ico: 'chat', title: 'No reviews yet', description: 'They show here when customers write one.' })
       return html`<ul>${reviews.map((r) => html`<li>${r.text}</li>`)}</ul>`
     },
   }
   App.reg('reviews', { path: '/reviews', title: 'Reviews', tab: true, parent: 'dashboard', ...ReviewsScreen, skeleton: cards('h-24', 'h-24') })
   ```
2. Link to it: `<a href="#/reviews">` or `data-go="reviews"`. For a seller
   section, add a row to `SECTION_GROUPS`; for the console, add it to `NAV_GROUPS`.
3. New data? Add it to `buildWorld()` in `js/data.js` and **bump
   `STATE_VERSION`** in `js/store.js`.

## Add an action with a fake reply

1. The rule, in `World` (`js/store.js`) — check, change, log, notify:
   ```js
   replyToReview(db, reviewId, text) {
     const review = db.reviews.find((r) => r.id === reviewId)
     if (!review) throw new Error('This review no longer exists.')
     review.reply = text
     Act.notify(db, 'admin', 'Seller replied to a review', text, `/reviews/${reviewId}`)
     Store.emit('review.reply', 'Seller replied to a review', { ref: reviewId })
   },
   ```
2. The Act, in the screens file — `run()` gives loading, errors and the toast:
   ```js
   Object.assign(Act, {
     async replyToReview(values, reviewId) {
       const done = await run(`review:${reviewId}`, () => Store.change((db) => (World.replyToReview(db, reviewId, values.text), true)), { ok: 'Reply posted' })
       if (!done) return
       // The other side answers later — re-check before changing anything.
       later(5000, () => {
         const review = S().reviews.find((r) => r.id === reviewId)
         if (!review || review.hidden) return
         Store.change((db) => World.thankSeller(db, reviewId))
       })
     },
   })
   ```
3. Wire it in the markup: `<form data-submit="replyToReview" data-args="${args(review.id)}">`.
   Show `Store.ui.busy['review:…']` as "Saving…" and `Store.ui.errors['review:…']` with `UI.errorNote()`.

## Known differences from the real app

- Not built: the "All stores" list, the product wizard, the store builder,
  and every section marked "Not in the prototype".
- **New, not in the real app:** the seller's "paused by UnieMax" message and next
  step, and the admin dashboard's "Needs you" callout (the real one shows
  "Setup incomplete" for integrations).
- Product photos are colour tiles; charts are simplified SVGs.

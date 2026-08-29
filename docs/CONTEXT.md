# White Label E-Commerce Platform
> Version 1.0

## Overview

A lightweight, white-label e-commerce platform designed for small and medium businesses. The platform should support different business types (sports, electronics, clothing, grocery, etc.) without requiring code changes. Each business can manage its own products, categories, inventory, and customer orders.

The first implementation will be for a **Cricket Bat Store**, but the architecture should support any product category in the future.

---

# Objectives

- White-label architecture
- Easy product management
- Simple ordering process
- Mobile-friendly website
- Low maintenance
- Easily scalable

---

# User Roles

## Customer
- Browse products
- Search products
- View product details
- Place orders
- Track orders
- View previous orders
- Create and manage own online stores (a single account can own multiple
  stores; one is "active" at a time — see Store Creation & Management),
  including answering the support requests their own customers raise
- Contact UnieMax from the account menu, or **a shop from its storefront**
  (Help & Support in its top bar and footer): call, email, or raise a tracked
  request and follow the answer in-app — including reporting a store or
  seller to UnieMax (see Help & Support)

## Admin (UnieMax platform staff)
- View the platform dashboard (revenue, orders, stores, customers, trends)
- Oversee orders and payments across every store
- Oversee the seller catalog; hide a listing that breaks the rules
- Suspend / restore a store; verify a seller's payout account
- Block / unblock a customer account
- Send platform announcements
- Answer support tickets from sellers and shoppers, and triage the queue
- Review the admin activity log
- Manage admin users (super admins)
- Manage shipping charges and banners *(planned)*

---

# Store Creation & Management (Customer Stores)

A single account can own multiple stores and switch between them.

- **Store menu** (account dropdown) — shows "Create Store" when the user has
  no stores (straight to the creation page) and "My Store" otherwise
  (select a store → its management page, or create another). The selection
  page shows a "Create Your First Store" empty state for first-timers.
- **Create Store** — intentionally minimal to reduce friction: a store
  name plus an **optional logo** (pick an image → crop it square → it is
  staged locally and uploaded the moment the store is created). The logo
  can also be added, replaced or removed at any time from Store Details
  (same pick → crop → upload pipeline, with progress, to a dedicated
  storage bucket). Remaining information is collected in future updates.
  The page's Back control returns to wherever the visitor came from
  (homepage, account menu, or the store list).
- **Store management** — a two-panel page (left: section list —
  Dashboard, Orders, Categories, Products, Store Details, Appearance,
  Homepage, Footer, Payments, Bank Accounts, Shipping, Checkout, plus
  Customer Support and UnieMax Support; right: the selected section),
  addressed by the store's slug (`/stores/{storeSlug}`).
- **Seller dashboard** — the management page's landing view: **Today's
  Orders**, Total Orders and Revenue up top, then the order pipeline —
  **Pending / Processing / Shipped / Completed / Cancelled / Refunded** —
  and the latest orders (number, date, customer, item count, payment and
  status chips, total). Orders appear the moment customers place them;
  every pipeline tile and order row links into the **Orders** section
  where the seller works the order.
- **Order management (Orders section)** — the seller's working queue for
  a store's orders: a filterable list (status tabs + search by order
  number / customer name / phone, newest first, paginated) and a detail
  page per order (items, customer & delivery snapshot, payment summary,
  lifecycle timeline). The seller moves each order **forward** through
  **Confirm → Pack → Ship → Deliver** (a pickup order goes Packed →
  Picked up, skipping shipping), one confirmation dialog per step since
  the customer sees status changes immediately. Marking a
  cash-on-delivery order Delivered also records it as paid. An order can
  be **cancelled** any time before it ships (optional reason); its items
  return to stock automatically, and a paid order is marked refunded
  (status only for gateway payments — the money is refunded from the
  Cashfree dashboard until the automatic refund call ships).
- **Homepage sections** — **arrange** the storefront homepage: drag (or ▲/▼)
  to reorder the sections — Hero Banner, Shop by Category, Featured Products,
  New Arrivals, Best Sellers — and switch each on or off. Order and visibility
  are one setting. A switch can only *hide* a section — turning one on does not
  force an empty row to appear, because merchandising rows still need products
  ticked for them. The header/top bar is fixed chrome and not reorderable. New
  sections (offers, banners, reviews…) slot in without a migration.
- **Footer management** — the owner configures everything the storefront
  footer shows, one card per topic (each saves independently):
  - **Contact information** — one or more business locations (up to 10),
    each with an optional branch name, full address, optional contact
    person, mobile number, optional alternate number, email, optional
    business hours, and a **Set as Primary** flag (exactly one location is
    primary). Each location can be **pinned on Google Maps** (search a place
    or tap the map; the latitude/longitude are saved automatically) and the
    storefront shows a **View on Google Maps** link per location — built
    from the pin, or from the address when no pin was dropped. Without a
    Maps API key the picker degrades to manual coordinate fields.
  - **Social media** — Facebook, Instagram and YouTube up front; WhatsApp
    (number), X (Twitter), LinkedIn, Telegram and Pinterest behind a "More
    platforms" reveal. Only filled-in platforms show as footer icons.
  - **Store information** — About Us (short description), established year,
    GST number, business registration number (all optional).
  - **Customer support** — support email, phone, WhatsApp number and
    working hours, shown as their own footer block.
  - **Store policies** — Privacy / Terms / Shipping / Return & Refund /
    Cancellation as optional links (dedicated policy pages come later; the
    footer supports them from day one).
  - **Additional links** — up to 10 custom links (About Us, Contact, FAQ,
    Careers, Blog…), pointing at a URL or an in-app path.
  - **Copyright** — a custom line, defaulting to
    "© {year} {store name}. All Rights Reserved."
- **Bank accounts (payouts)** — the seller registers the bank account(s)
  UnieMax pays their sales earnings into (used when customers pay through
  the platform; the payments module itself is a later release). Up to 5
  accounts, each with account holder name, account number (entered twice to
  confirm), IFSC, bank name, branch and an optional UPI ID. Exactly **one
  account is primary** — only it receives payouts; deleting the primary
  never silently retargets payouts (they hold until the seller explicitly
  picks another). Every account carries a **verification status** (pending
  → verified / failed): verification will be performed by a third-party
  account validator and can also be done manually by a UnieMax admin from
  the future admin panel — the data model and statuses are provisioned now.
  Editing a verified account's details resets it to pending.
- **Payment settings** — Yes/No switches deciding how customers **pay**:
  **Accept Online Payment** (paid through UnieMax, settled to the seller's
  primary bank account — the gateway itself ships with the payments module)
  and **Accept Cash on Delivery** (the default-on Phase-1 method). Because
  a change applies to the live checkout immediately, every toggle asks for
  **confirmation** (a dialog spelling out the effect) before saving. The
  checkout shows customers which methods a store accepts. Turning
  everything off warns the seller that customers can't order, and enabling
  online payment without a primary payout account points to Bank Accounts.
- **Shipping settings** — how customers **receive** orders: the seller
  chooses **Delivery**, **Store Pickup**, or **Both** (default Delivery).
  Selecting a different option asks for **confirmation** before saving,
  since it changes the live checkout. Enabling pickup without a business
  location on file points the seller to Footer → Contact Information, and
  the checkout previews the store's fulfilment mode to customers.
  Shipping-charge configuration (fixed / district / state) joins this
  section with the orders module.
- **Checkout settings** — which customer details the store's checkout
  collects: Name, Phone, Email, Address, Pincode, State, Country — each a
  seller toggle, **all enabled by default**. A disabled field is hidden
  from the customer and skipped in validation. Contact fields (name/
  phone/email) are asked even for store-pickup orders; the address fields
  only for delivery. The page warns a delivering store that switches all
  address fields off.
- **Customization (Appearance)** — the section leads with **templates**, not
  color pickers: a horizontal strip of the platform's ready-made palettes,
  each drawn in its own colors, applied to the whole storefront in one click.
  A new seller who has no opinion about hex codes gets a professional look
  immediately; anyone who does can press **Customize** on the selected
  template and edit the same five colors as before — background + primary
  (picker or typed/pasted hex, e.g. `#6C3EF4`), plus three that default to
  **Auto**: secondary (links, prices & highlights — Auto follows primary),
  surface (cards & panels — Auto derives from the background) and **button
  text** (labels on Add to Cart / Place Order — Auto picks white or black from
  the button color's luminance, so text never disappears on a dark button).
  A customised palette is **the seller's own, named theme**, saved on their
  store; the template it started from is never modified, and the store keeps
  its colors even if that template is later changed or withdrawn. The seller's
  existing palette stays in the strip as its own card, so trying templates on
  never loses what they already had.

  Below it sits a **preview of a sample shop** — top bar, banner, category
  tiles, product cards, a promo strip and a footer — painted in the chosen
  colors and repainting the moment a template or a single color changes. It is
  **one layout, identical for every seller**, and deliberately not a rendering
  of their own store page: the palette is then the only thing that differs
  between two templates, which is what makes them comparable at a glance.
  The sample content is chosen so every color role appears at least once —
  the button at two sizes, prices and a sale badge in the secondary color,
  cards on the surface color, muted text on both the canvas and a card — so
  what the seller is really checking (does the button label stay readable, do
  card edges survive against the background) is on screen before they save.
  It reflows against **its own width rather than the window's** — the panel it
  sits in loses 260px to the section nav above `lg`, so a laptop can leave it
  narrower than a tablet does — stepping two-up → three-up → six-up products
  and dropping the search box and nav links as the room for them runs out,
  with no horizontal scroll or shrunken text at any size.

  **Open full preview** takes the same sample shop to its own page
  (`/stores/{slug}/appearance/preview`), outside the management workbench, so
  it gets the entire window — roughly 300–400px more than the panel can give
  it on a laptop. The template strip travels with it and stays pinned while
  the preview scrolls, so a seller can click through every template at close
  to real size and save from there. Colours stay on the Appearance form;
  **Customize** hands the draft back to it. Unsaved work survives the trip in
  both directions, so opening the full preview mid-edit shows what was being
  edited rather than the last saved palette.
- **Store catalog** — hierarchy: **Store → Category → Subcategory
  (optional) → Product → Variants**. The Categories section lets the owner
  add, list, **rename**, and delete the store's own categories, each
  optionally nested one level inside a parent (e.g. Electronics → Mobiles;
  subcategories cannot have their own subcategories). Long catalogs stay
  readable: each parent collapses/expands its subcategories, and renaming
  happens inline on the row. Products can only be added
  **after** at least one category exists: every product must belong to a
  category — root or subcategory — of the same store (enforced by the API,
  and the Products section shows an "Add a category first" gate until
  then). A product has a name, category and an optional description — all
  three editable after creation (renames keep the product's public link;
  a product can move to any category of the same store); **the
  variant is what actually sells**, so price and stock always live on a
  variant, and each variant's name, price and stock are likewise editable
  in place. Every product carries **media**: up to **8 photos** — added by
  multi-select or drag-and-drop, each **cropped square before upload** so
  the storefront stays consistent, reorderable by drag (the **first photo
  is the cover** customers see on listing cards), each replaceable,
  deletable and carrying optional alt text — plus **one optional video**
  (replace/delete). Upload hints (max size, allowed formats) come from
  server configuration and files are validated before uploading. A product with no options is entered with a single price and
  stock (kept on one implicit variant behind the scenes); adding options —
  labels like "Red / 128 GB" — replaces that single price, and each option
  then carries its own price and stock. Listings show the cheapest option
  as a "from" price. Removing the last option turns the product back into a
  simple one. Categories that still contain products or
  subcategories cannot be deleted. Every category, product, and variant
  can be **enabled/disabled** individually (the catalog-level
  publish/unpublish): disabled items stay manageable but are hidden from
  the public store page — a product shows publicly only when it and its
  whole category chain are enabled.
- **Publish / Unpublish** — stores start unpublished. Publishing makes the
  store's public page live for customers; unpublishing takes it offline
  (the public URL then behaves like a non-existent store). While
  unpublished, the same URL is a **private draft preview** for the
  signed-in owner — a banner marks it as a draft only they can see — so a
  store can be checked before going live.
- **Share Store** — every store has a permanent public URL
  (`/store/{storeSlug}`, slug auto-generated from the name and stable
  across renames). The management page shows the link and a Share button
  (copy / native share sheet) so it can be handed straight to customers,
  who can open it without an account.
- **Public storefront (multi-page)** — the shared URL opens a real
  multi-page shop, not a single filtering screen, so it scales from a few
  products to thousands. Visually it is a clean, **full-width** dark-commerce
  layout: flat surfaces derived from the owner's own background + primary
  colors, with **metal-chrome accents reserved for the important places** —
  primary CTAs and the card hover glow — so each store looks premium while
  still looking like itself, and the shine marks importance rather than
  texture.

  **Chrome (every page):** sticky header — store logo · Home · **Categories ▾**
  · product search · **share** · cart. The Categories menu is a hover dropdown
  on desktop
  and an expandable accordion in the mobile drawer, listing **categories and
  subcategories only, never products** (a product-level dropdown becomes
  unusable the moment a store grows). The **share** button (also present on
  every product page, beside the product name) opens the device's native
  share sheet where available and otherwise copies the permanent public link
  with a "Link copied" confirmation — shared links open the store or product
  directly, no account needed.

  **Homepage** (`/store/{slug}`) — introduces the store rather than dumping a
  grid: hero banner, **Shop by Category**, then the owner's
  merchandising rows — **Featured Products**, **New Arrivals**, **Best
  Sellers**. Every section is an edge-to-edge **band** on alternating
  backgrounds, so the page reads as one continuous shop rather than a stack of
  floating boxes. The **hero** is a compact introduction (store name, what the
  catalog holds, a Start Shopping button and a jump to the categories) with a
  collage of the store's real product photos beside it on wide screens.
  **Shop by Category** is a dense strip of text-only category tiles — name,
  its subcategories and the product count, no decorative icons.
  Each merchandising row shows **only** the products the owner ticked for it,
  and a row with nothing ticked is simply not shown. Rows are capped at one
  full row of cards (as many as the screen fits) with a "View all" link. The
  owner controls both the **order** of these homepage sections (including the
  hero) and whether each shows, by drag-and-drop in the store's Homepage
  section — see Store Management.

  **Category page** (`/store/{slug}/category/{category}`) — breadcrumb,
  category title, subcategory chips, sort & filter bar, and a responsive
  product grid that loads in batches (Load More + infinite scroll). A root
  category also shows its subcategories' products; a subcategory shows only
  its own.

  **Product page** (`/store/{slug}/product/{product}`) — a full detail page,
  and the *only* place variants are rendered. A **gallery** (zoom on hover,
  swipe on touch, thumbnail rail, inline video) beside a **purchase card**:
  name, price, stock, the **variant picker** (Colour / Storage / Size / RAM as
  labelled options, each showing its own price), a **quantity selector**, **Add
  to Cart** and **Buy Now** (straight to this store's checkout), and share.
  Below the card: **Product Highlights**, **Description**, **Specifications**
  and **You May Also Like**. A **sticky purchase bar** follows the customer
  once the card scrolls away.

  What the page shows is what the seller actually entered — there are no
  invented selling points: highlights and specifications are read out of the
  product's own description (bullet lines become highlights, short
  "Label: value" lines become specification rows), and the delivery / returns /
  trust block is built from the store's shipping mode, pickup location, payment
  switches and policy links. **No rating or reviews are shown** — the review
  system doesn't exist yet, and the platform never fabricates stars.

  **Shop / Search** (`/store/{slug}/shop`, `?q=` for search) — browse the whole
  catalog in the same grid, or search it by name and description. This is the
  target of the header's **Shop** link and every "View all".

  Listing cards are **compact** — image, category, name, a "from" price, a
  stock badge (In/Low/Out) and a **variant count** for products with options
  (never the full option list) — so a wide screen shows up to six per row
  instead of a few oversized tiles. The **whole card is a link** to the
  product page — there
  is no Add to Cart on a card, so every card looks the same whether or not the
  product has options; buying happens on the product page. Hovering lifts the
  card with an evenly-spread glow. Sorting: Newest, Popular,
  Best Selling, Price ↑/↓, Alphabetical (Popular/Best Selling await order
  data). Filters: Availability + Price Range now, Brand/Rating/Discount
  future-ready. Empty results offer a Clear-filters action.

  **Merchandising** — the owner controls placement per product from the
  Products section (Featured Product · Best Seller · New Arrival · Hide from
  Search) and can star root categories, so the shop is curated without code
  changes (while no category is starred, Shop by Category shows all of them). Each tick maps to exactly one storefront row and affects nothing
  else. Because these changes are live to customers immediately, ticking one
  asks for **confirmation** before saving.

  Categories, subcategories and products each have a **stable URL slug** that
  survives renames, so shared links keep working.

  **Footer (every page)** — renders the owner's Footer settings: store
  logo + brand mark, About Us, business locations (address, contact person,
  phones, email, hours, **View on Google Maps** link each), social media
  icons, policy + custom links, a customer-support block, and the copyright
  line (custom or the store-name default) with GST/registration small
  print. Every block is conditional — a store that configured nothing gets
  a minimal one-line footer, never empty headings. Fully responsive
  (1 → 2 → 4 columns).

  *Not yet in the store nav: Offers/Deals, Newsletter, a Track Order link
  for guests (signed-in customers see their history at `/orders`; guests
  keep their confirmation link — phone+OTP tracking is future), and
  dedicated policy/About pages (policy links can point at external
  documents meanwhile). These are deliberately absent from the nav rather
  than shown as dead links.*
- **Shopping cart (grouped by store)** — visitors shop without an account;
  the cart (at `/cart`) groups items **by store** (store **logo** when one
  is uploaded, name, item count, subtotal, a "Continue shopping" link back
  into the store, and a **Place Order** button). A store with
  many items previews a few lines and offers "View more" → a dedicated page
  listing all cart items from that store (`/cart/{storeSlug}`). Adding a
  product shows a brief "Added to cart — View cart" confirmation. Opening
  the cart **refreshes prices and stock** against the live catalog (stale
  quantities clamp down, and items no longer sold are flagged unavailable
  instead of silently vanishing). Quantities are capped by stock.
  **Theming:** the cart continues the look of the store the customer
  opened it from — every cart link inside a store carries that store's
  identity, and the combined `/cart` overview wears that store's theme
  even when the items inside belong to other stores. Opened from the
  marketplace homepage instead, the cart uses the marketplace's neutral
  palette (respecting the customer's light/dark choice). Pages that belong
  to a single store — `/cart/{storeSlug}`, the checkout and the order
  page — always use that store's theme directly.
- **Place Order (per store)** — orders are placed per store, so each cart
  group's Place Order button opens `/checkout/{storeSlug}`. **Placing an
  order requires a signed-in customer** (enforced by the API): browsing
  and the cart stay anonymous, but a guest opening the checkout gets a
  "Sign in to place your order" prompt that returns them to the same
  checkout after login — their cart is kept. For signed-in customers the
  page shows an order
  review carrying **only that store's items** (read-only, with an "Edit in
  cart" link), the subtotal, and the two interactive checkout steps:
  1. **Delivery Details** — for stores offering both fulfilments the
     customer first picks Delivery or Store Pickup (pickup shows the
     store's primary business location and skips address fields). The form
     asks **only the fields the seller enabled** in Checkout settings and
     validates exactly those. **Customers see their saved
     addresses as selectable rows** (primary preselected) and can add a
     new one inline (saved to the address book); if the store collects
     email and the chosen address has none, a small email field tops it
     up. Confirming collapses the step to
     an editable summary.
  2. **Choose Payment Method** — Online Payment / Cash on Delivery,
     limited to what the seller enabled in Payment settings.

  With both steps complete, **Place Order is live**: the server re-prices
  every line from the live catalog, validates the seller's payment/
  shipping/checkout configs, decrements stock transactionally (no
  overselling), and creates the order with a customer-friendly order
  number. The store's cart lines clear and the customer lands on a
  store-themed **Order Success** page (order number, paid/pay-on-delivery
  status, items, delivery or pickup summary) that guests can reopen by
  link. **Payment:** Cash on Delivery is live end-to-end; **online payment
  runs through the Cashfree gateway** (hosted checkout via the Cashfree web
  SDK — the success page tracks the payment, refreshes itself until it
  confirms, and offers **Pay now / Retry payment** while unpaid; see
  `docs/CASHFREE_PAYMENTS.md`). Without gateway keys, development builds
  simulate the payment ("DEV-SIMULATED") and production refuses online
  payment — a production build can never fake a payment.
- **Saved addresses** — every customer has an address book (`/addresses`,
  account menu → Saved Addresses): up to 10 delivery addresses (optional
  label, name, phone, optional email, address, pincode, state, country),
  one marked **primary** (the default checkout suggestion; the first
  address becomes primary automatically and deleting the primary promotes
  the oldest remaining). Checkout offers the list as one-tap suggestions.

Future releases add: automatic Cashfree refunds on cancellation (today a
paid order's refund is executed from the Cashfree dashboard),
shipping-charge rules, customer-side order tracking/cancellation,
dedicated store policy pages (policy links are already supported in
the footer), SEO settings, and additional configuration. (Footer/business
info, bank accounts, payment + shipping + checkout settings, customer
addresses, order placement, and seller order management — confirm → pack
→ ship → deliver + pre-shipment cancellation — have all landed.)

Backed by the customer-scoped `/api/v1/stores` API (see API.md).

---

# Marketplace Homepage (`/`)

The platform's public entry point (full spec: `HomePage_mpv.md`) — a
**store-discovery** page, not a shopping page; shopping happens inside
`/store/{storeSlug}`. Public for guests and signed-in customers alike;
sign-in moved to its own `/login` page.

- **Global search** — one box searching stores, products and categories
  platform-wide (results always grouped, never mixed; category/product hits
  open inside their owning store, since categories are per-store — there is
  no global category page).
- **Recent searches** — local to the browser, shown as chips, hidden when
  empty.
- **New Stores** — newest **published** stores (by first-publish time),
  shown as storefront-preview cards: a large banner from the store's own
  products, its logo, the store name, a **star rating**, the product count
  and a **Visit Store** button. The rating is a **placeholder** until the
  review system exists — a store with no reviews says so rather than
  showing invented stars. Empty state invites the visitor to be the first
  seller.
- **Recently Viewed** — stores the visitor opened before (local snapshots,
  published stores only), hidden when empty.
- **My Stores** — shown only to owners: status chip + Manage shortcut +
  create-another card.
- **Become a Seller** — prominent CTA panel; the button reads "Create
  Another Store" for existing owners, and guests pass through sign-in
  straight to store creation.
- **Platform stats** — published-store and visible-product counters (orders
  join later); hidden while the platform has no published stores.
- **Footer** — About / Privacy / Terms / Support / Contact open "coming
  soon" pages rather than dead links.

Deferred by design until real activity data exists: trending/featured/top
stores, popular products, deals, recommendations, reviews, follows.

---

# Website Pages

## Home
- Banner Carousel
- Featured Products
- Categories
- New Arrivals
- Best Selling Products
- About Business
- Contact Information

---

## Category Listing
- Product Grid
- Search
- Filters
- Sorting

---

## Product Details

Display:

- Product Images
- Product Name
- Description
- Category
- Price
- Available Stock
- Product Specifications
- Related Products

Actions

- Buy Now
- Add to Cart

---

## Shopping Cart

- Product List
- Quantity Update
- Remove Product
- Shipping Charge
- Total Amount

---

## Checkout

Customer Information

- Full Name
- Mobile Number
- OTP Verification
- Alternative Mobile Number
- Address
- District
- State
- Pincode

Order Summary

- Products
- Quantity
- Shipping Charge
- Total Amount

---

## Order Success

- Order ID
- Confirmation Message
- Estimated Delivery
- Track Order Button

---

## Order History

Access using

- Mobile Number
- OTP Verification

Customer can view

- Previous Orders
- Order Details
- Order Status

---

# Product Management

Admin can

- Add Product
- Edit Product
- Delete Product
- Enable/Disable Product

Each Product contains

- Product Name
- SKU
- Category
- Brand
- Description
- Price
- Discount Price
- Stock Quantity
- Multiple Images
- Specifications
- Status

---

# Category Management

Admin can

- Add Category
- Edit Category
- Delete Category
- Change Display Order

Example

Sports
- Cricket Bat
- Cricket Ball

Electronics
- Mobile
- Laptop

Clothing
- Shirts
- Shoes

Future categories can be added without development.

---

# Inventory Management

- Stock Quantity
- Low Stock Alert
- In Stock
- Out of Stock

---

# Image Management

- Upload Multiple Images
- Change Cover Image
- Delete Images

---

# Order Management

Admin can

- View Orders
- Search Orders
- Update Order Status
- Cancel Orders
- View Customer Details

Order Status

- Pending
- Confirmed
- Packed
- Shipped
- Delivered
- Cancelled

---

# Shipping Management

Shipping charge should be configurable.

Support

- Fixed Shipping
- District-wise Shipping
- State-wise Shipping
- Free Shipping (optional)

The shipping amount is calculated automatically during checkout.

---

# OTP Verification

OTP verification required for

- Placing Order
- Viewing Order History

Customer account creation is **not mandatory**.

---

# Authentication Requirements

As this is a global e-commerce platform, the authentication system should support
multiple sign-in providers behind a provider-agnostic module (real email/SMS/OAuth
services are plugged in later without changing the core auth logic).

## Login Options
- Users **register** with:
  - Email address + password (**primary** — email verified before the account is created)
  - Google Sign-In (*temporarily disabled in the current build — no token verifier
    is wired yet*)
  - Apple Sign-In (*future*)
- Users **log in** with any of the above, **plus**:
  - Mobile number (OTP) — available after linking the number from the Profile
    section (mobile numbers cannot create accounts)

## Account Linking
- A user links a **mobile number** from the Profile section (verified by SMS OTP);
  the number then works as an OTP sign-in method.
- If the number already belongs to another account, linking is rejected with a
  clear error.

## Linking Rules
- A mobile number can be linked to **only one user account**.
- An email address can be linked to **only one user account**.
- A mobile number cannot be linked to multiple email accounts.
- An email address cannot be linked to multiple mobile numbers.

## Verification
- Email linking must be verified using an email verification link or OTP.
- Mobile number linking must be verified using an SMS OTP.
- Linking is completed only after successful verification.

This approach provides a flexible authentication experience while ensuring that each email address and mobile number uniquely identifies a single user account.

---

# Search

- Product Search
- Category Search

---

# Platform Admin Console (`/admin`)

The UnieMax operator's console — a **separate application** from the
storefront (its own bundle, downloaded only by someone who opens `/admin`),
sharing the same look through one token layer. Fully responsive: a fixed
sidebar on a laptop, a drawer on a phone, and every table becomes a stacked
card list below `md`.

Sign-in is email + password only (accounts are provisioned, there is no
self-service signup or reset). Because it is the highest-privilege surface,
the session **refreshes silently every 10 minutes**, **signs out after 30
minutes idle**, and drops straight to the login screen if the session is
revoked from anywhere else.

- **Dashboard** — the platform's health in one screen: revenue, orders,
  stores and customers up top (each linking to the page that can act on it);
  a revenue/orders trend over 7 / 30 / 90 days; the payment split
  (online vs cash); the order pipeline; top stores and products; a low-stock
  watch list; and a banner when the payment gateway or push notifications
  aren't configured.
- **Orders** — every order across every store, filterable by status, payment
  status, method, store and date, searchable by order number, customer name,
  phone, store or gateway reference. The detail page shows items, money,
  contact/delivery snapshot, the payment reference and a lifecycle timeline.
  **Deliberately read-only** — the seller moves their own orders along, and
  the platform overriding that would make their dashboard lie.
- **Payments** — the same orders through the money lens: settlement status,
  method, gateway reference, and per-status totals for whatever is filtered.
- **Products** — the seller catalog across all stores, with inventory views
  (low stock, out of stock) and the platform's one moderation lever:
  **hide a listing** (with a reason the seller is told). It flips the same
  visibility switch the seller uses, so there is never a contradiction.
- **Stores & sellers** — every store, published, draft or suspended, with its
  owner, catalog size, orders and revenue. Two powers: **suspend a store**
  (removes it from the marketplace and stops new orders, while the owner
  keeps access to fix the cause) and **verify a payout account** manually —
  the admin half of bank verification, with a required note on failure.
- **Customers** — buyers and sellers together (they are the same account
  type), with **blocking**: no future sign-in by any method, and every signed-in
  device logged out at once.
- **Support** — one queue for everything written to the platform: sellers
  about their stores and shoppers about their orders and accounts, each row
  marked Seller or Shopper and filterable by either (two separate queues
  would just mean one of them going unread). It opens on **what still needs a
  reply**, oldest first, because a queue's job is to show what is owed rather
  than what is newest. A ticket page carries the whole conversation, the
  reply box (replying marks the ticket as being worked on, so the queue can't
  quietly lie) and triage — a status change is told to the reporter, priority
  stays internal.
- **Store themes** — the appearance templates sellers pick from: view them
  all, create and edit (name, one-line description, the five colors, order),
  and **enable or disable** — only enabled templates reach a seller's picker.
  Each row and the editor show the palette as a miniature storefront, so the
  CTA's text contrast is judged where it actually matters. Safe by design:
  a store keeps its **own copy** of the colors it applied, so editing,
  disabling or deleting a template never changes a live storefront. The
  starter five were built from real, well-configured stores — their colors
  only, no other store data.
- **Notifications** — the admin's own feed, push opt-in per device, and a
  **platform broadcast** to admins, sellers or all customers (confirmed with
  a preview, since it can't be recalled).
- **Activity log** — an append-only record of every change an admin has made:
  who, what, when, from which IP. Never edited or deleted.
- **Admin users** (super admins only) — create admins, change roles,
  deactivate, reset passwords. The platform refuses to let anyone change
  their own role, deactivate themselves, or remove the last super admin.

---

# Help & Support

**Help & Support** covers the three conversations the product has. Which one
you are in is decided by where you open it, and each is answered by the side
that can actually act:

| Where | Who writes | Who answers |
| ----- | ---------- | ----------- |
| Account menu → Help & Support | a shopper | **UnieMax** — orders, payments and refunds, a listing, the account, or **reporting a store or seller** |
| A storefront's Help & Support (top bar + footer of `/store/{shop}`) | a shopper | **the shop** — their order with it, a return, a product |
| Store management → UnieMax Support | a seller | **UnieMax** — that shop's payouts, catalog, settings |

A seller answers the second from **Store management → Customer Support**, the
shop's own inbox. The two sections are named for who is on the other end
because "Help & Support" would describe both equally.

They are one feature throughout, kept apart by who a thread is *with*: a
seller who also shops sees their store threads under the store, their
personal ones in the account menu, and their customers' in the inbox — never
mixed. UnieMax is **not a party** to a shopper's conversation with a shop and
never sees it; a shopper who needs the platform to step in uses "Report a
store or seller" instead.

Two routes out of a problem, in the order they are useful:

1. **Contact them directly** — email and phone (plus working hours), always
   on the page as tap-to-call / tap-to-email links. UnieMax's own details on
   the platform pages; the shop's own on its storefront. No sign-in needed —
   a phone number needs no account.
2. **Raise a ticket** — a tracked thread with a quotable reference number,
   answered inside the app. This one does need an account, since a
   conversation has to belong to somebody; a signed-out visitor on a
   storefront is offered sign-in rather than a form that would fail on
   submit. The reporter picks what the issue is about (the topics offered
   match who they are writing to), writes it up, and can leave a different
   reply-to email or phone than the account's.

How a ticket behaves, and why:

- The reporter sees the whole conversation and gets a notification whenever
  the platform replies or changes the ticket's state.
- Replying to a ticket the team marked **resolved reopens it** — "resolved" is
  the platform's opinion, and the person who raised it gets to disagree
  without starting over.
- **Closing is final** for both sides. If the problem comes back it is a new
  ticket, so one thread never turns into three unrelated issues.
- The reporter never chooses a priority: offered the choice, everything
  becomes urgent and the queue stops meaning anything. The platform team
  sets it — and sellers don't set it either, since a shop's inbox is small
  enough to read without one.
- A shop owner cannot message their own store: that thread would land in
  their own inbox.

---

# Notifications

**Live (email, via Resend):** order confirmation to the customer and a
"new order" alert to the seller on placement; customer updates on
Confirmed / Shipped / Delivered / Cancelled. The customer address falls
back to the account's login email when the store's checkout doesn't
collect one; emails carry deep links when the storefront origin is
configured.

**Live (in-app + push):** every account — customer, seller and admin — has a
**notification bell** with an unread badge, and can switch on **browser push
notifications per device** so alerts arrive with the tab closed. The feed is
kept server-side, so nothing is lost when a device is offline or has push
turned off. What fires: order placed (customer, seller and admins), order
Confirmed / Shipped / Delivered / Cancelled (customer), store suspended or
restored, product hidden or restored, payout account verified or failed
(seller), account unblocked (customer), and admin broadcasts. Push is
strictly opt-in and only ever requested from a button the person pressed.
Full detail: `docs/PUSH_NOTIFICATIONS.md`.

Future:

- Order SMS updates
- WhatsApp Updates
- Per-kind notification preferences

---

# Payment

Phase 1 (live)

- Cash on Delivery
- Online payment via **Cashfree** (hosted checkout — UPI/cards/netbanking;
  see `docs/CASHFREE_PAYMENTS.md`)

Phase 2

- Automatic refunds via the Cashfree refund API
- Credit/Debit Cards
- Net Banking

---

# Future Enhancements

- Coupons
- Wishlist
- Product Reviews
- Product Ratings
- Recently Viewed Products
- Multiple Admins
- Multiple Vendors
- Delivery Partner Integration
- Invoice Download (PDF)
- Analytics Dashboard
- GST Support

---

# Non-Functional Requirements

- Responsive Website
- Fast Loading
- SEO Friendly
- Secure APIs
- Image Optimization
- Cloud Storage
- Backup & Recovery

---

# Suggested Technology Stack

## Frontend
- React
- Tailwind CSS

## Backend
- Node.js

## Database
- PostgreSQL

## File Storage
- AWS S3

## Authentication
- OTP (SMS)

## Hosting
- AWS / DigitalOcean / VPS

---

# Phase 1 Deliverables

- White-label website
- Product management
- Category management
- Inventory management
- Shopping cart
- Guest checkout with OTP
- Dynamic shipping charges
- Order management
- Order history
- Responsive design

---

# Initial Business Configuration

Business Type
- Cricket Equipment

Categories

- Hard Tennis Bats
- Soft Tennis Bats

Products

- Multiple bat models under each category

The system should allow adding completely new categories and products in the future without requiring application changes.
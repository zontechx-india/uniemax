import type { StoreThemeColors } from '../../features/stores/storesApi'
import { SKIN, storeVars } from '../../features/publicStore/storeTheme'
import {
  CartIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ImageIcon,
  SearchIcon,
  StarIcon,
  StoreIcon,
} from '../../layout/icons'

/**
 * The Appearance section's theme preview.
 *
 * **One layout, every seller.** This is not a rendering of the seller's own
 * storefront: it is a fixed sample shop — top bar, banner, category tiles,
 * product cards, a promo strip, a footer — whose only variable is the
 * palette. Only the store **name and logo** are the seller's; every other
 * word, price and tile is the same for everyone. That makes it instant
 * (nothing is fetched) and, more usefully, a fair comparison: two templates
 * differ here by color alone, which is the one thing being judged.
 *
 * What it *does* borrow from the real storefront is the color plumbing —
 * `storeVars()` maps the five settings onto the same CSS variables the live
 * page uses, and the `SKIN` fragments and `.metal-*` treatments resolve
 * exactly as they do there. The layout is a sample; every color relationship
 * on show (CTA contrast, price against card, muted text on the canvas, card
 * edges against the background) is the real one.
 *
 * ## Why container queries, not breakpoints
 *
 * The preview lives in the store-management panel, which sits beside a 260px
 * sidebar **only above `lg`**. So the space it actually gets does not track
 * the viewport — it inverts around the point the sidebar appears:
 *
 * | Viewport | Sidebar | Preview width |
 * | -------- | ------- | ------------- |
 * | 1440px   | yes     | ~968px        |
 * | 1024px   | yes     | ~648px        |
 * | 768px    | no      | ~688px        |
 * | 425px    | no      | ~369px        |
 * | 375px    | no      | ~319px        |
 *
 * A 1024px viewport gives the preview LESS room than a 768px one. Viewport
 * breakpoints would therefore lay out a cramped four-column grid at 1024 and
 * a needlessly narrow one at 768 — which is exactly what the old version did.
 * The root is a `@container`, so every rule below reads the preview's OWN
 * width and each of the five target widths lands in a tier that fits it:
 *
 *   base (<24rem)  319 · 369   two-up, no search, no collage
 *   @sm  (≥24rem)  in-between  search appears, roomier type
 *   @lg  (≥32rem)  648         three-up products, four-up categories, collage
 *   @2xl (≥42rem)  688         full collage, roomier padding
 *   @3xl (≥48rem)  968         nav links (only where the header has room)
 *   @4xl (≥56rem)  968         six-up products, largest type and padding
 */

/** Shared band padding — one ramp, so every section steps together. */
const BAND = 'px-3 py-4 @sm:px-4 @sm:py-5 @2xl:px-5 @2xl:py-6 @4xl:px-6 @4xl:py-7'

const CATEGORIES = ['Apparel', 'Footwear', 'Accessories', 'Home']

const PRODUCTS: {
  name: string
  category: string
  price: string
  was?: string
  rating: string
  sale?: boolean
}[] = [
  {
    name: 'Everyday Cotton Shirt',
    category: 'Apparel',
    price: '₹1,299',
    was: '₹1,799',
    rating: '4.6',
    sale: true,
  },
  { name: 'Canvas Sneakers', category: 'Footwear', price: '₹2,450', rating: '4.4' },
  {
    name: 'Leather Card Holder',
    category: 'Accessories',
    price: '₹899',
    rating: '4.8',
  },
  {
    name: 'Ceramic Mug, Set of 2',
    category: 'Home',
    price: '₹649',
    was: '₹799',
    rating: '4.5',
    sale: true,
  },
  { name: 'Cotton Tote Bag', category: 'Accessories', price: '₹499', rating: '4.3' },
  {
    name: 'Desk Organiser',
    category: 'Home',
    price: '₹1,150',
    was: '₹1,450',
    rating: '4.7',
    sale: true,
  },
]

export function ThemePreview({
  theme,
  storeName,
  logoUrl,
}: {
  theme: StoreThemeColors
  /** The seller's own store name — with the logo, the only real content here. */
  storeName: string
  logoUrl: string | null
}) {
  return (
    <div
      className="@container overflow-hidden rounded-lg border border-line bg-bg text-fg"
      style={storeVars(theme)}
    >
      <TopBar storeName={storeName} logoUrl={logoUrl} />
      <Banner />
      <Categories />
      <Products />
      <PromoStrip />
      <Footer storeName={storeName} />
    </div>
  )
}

/**
 * Logo · name · nav · search · cart.
 *
 * Built to degrade rather than wrap: the name truncates, the search box is the
 * flexible element, and the two optional pieces drop out in the order they
 * stop earning their room — nav links below `@3xl`, then search below
 * `@sm`, leaving logo · name · cart, which fits at any width.
 */
function TopBar({
  storeName,
  logoUrl,
}: {
  storeName: string
  logoUrl: string | null
}) {
  return (
    <header
      className={`flex items-center gap-2 border-b px-3 py-2.5 @sm:gap-3 @sm:px-4 @2xl:px-5 ${SKIN.border}`}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className="h-8 w-8 shrink-0 rounded-md object-cover @2xl:h-9 @2xl:w-9"
        />
      ) : (
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md @2xl:h-9 @2xl:w-9 ${SKIN.cta}`}
        >
          <StoreIcon className="h-4 w-4" />
        </span>
      )}

      {/* min-w-0 lets a long store name truncate instead of pushing the cart
          off the edge — the failure the old preview had below 400px. */}
      <span className="metal-text min-w-0 max-w-32 truncate font-heading text-sm font-semibold @2xl:max-w-40 @2xl:text-base">
        {storeName}
      </span>

      {/* @3xl (48rem), well above the two mid sizes: a 1024px viewport
          leaves the preview ~648px and a 768px one ~688px, so any threshold
          between them would show the nav on the SMALLER screen and hide it on
          the larger. Putting it above both also keeps the header roomy —
          "Home · Shop · Categories" costs ~215px, which at 648px would leave
          the search box about 40px of text. Only the ~968px case (1440px
          viewport) has room to spare, and that is where the nav appears. */}
      <nav className="hidden items-center gap-0.5 @3xl:flex">
        {['Home', 'Shop'].map((label) => (
          <span
            key={label}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${SKIN.text}`}
          >
            {label}
          </span>
        ))}
        <span
          className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold ${SKIN.text}`}
        >
          Categories
          <ChevronDownIcon className="h-3 w-3" />
        </span>
      </nav>

      {/* The widest neutral surface on the page — where a background and a
          surface color sitting too close together first show up. */}
      <span className="relative ml-auto hidden min-w-0 flex-1 @sm:block">
        <SearchIcon
          className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${SKIN.muted}`}
        />
        <span
          className={`flex h-8 items-center truncate rounded-full border pl-9 pr-3 text-xs @2xl:h-9 ${SKIN.border} bg-surface-alt ${SKIN.muted}`}
        >
          Search products…
        </span>
      </span>

      <span
        className={`relative ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border @sm:ml-0 @2xl:h-9 @2xl:w-9 ${SKIN.border} ${SKIN.chip}`}
      >
        <CartIcon className={`h-4 w-4 ${SKIN.text}`} />
        <span
          className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold ${SKIN.cta}`}
        >
          3
        </span>
      </span>
    </header>
  )
}

/** Hero banner — headline, supporting line, and both button treatments. */
function Banner() {
  return (
    <section
      className={`relative overflow-hidden border-b ${BAND} ${SKIN.border} ${SKIN.surface}`}
    >
      {/* Brand wash, as on the live hero — keeps the band from reading flat. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.09]"
        style={{
          background:
            'radial-gradient(120% 120% at 88% 12%, var(--brand) 0%, transparent 62%)',
        }}
      />
      <div className="relative flex items-center gap-4 @2xl:gap-6">
        <div className="min-w-0 flex-1">
          <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-brand @sm:text-[10px] @sm:tracking-[0.28em]">
            New season
          </span>
          <h3
            className={`mt-1.5 font-heading text-lg font-bold leading-tight @sm:text-xl @lg:text-2xl @2xl:text-3xl @4xl:text-4xl ${SKIN.text}`}
          >
            Everything you need,
            <br />
            in one place.
          </h3>
          <p
            className={`mt-1.5 max-w-sm text-[11px] @sm:mt-2 @sm:text-xs @2xl:text-sm ${SKIN.muted}`}
          >
            Free delivery on orders over ₹999. Easy 7-day returns.
          </p>
          {/* Wraps rather than shrinking: two buttons squeezed onto one line
              below 340px made both labels illegible. */}
          <div className="mt-3 flex flex-wrap items-center gap-2 @sm:mt-4 @sm:gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[11px] font-bold @sm:px-5 @sm:text-xs @2xl:px-6 @2xl:py-2.5 @2xl:text-sm ${SKIN.cta}`}
            >
              Shop Now
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </span>
            <span
              className={`rounded-md border px-4 py-2 text-[11px] font-semibold @sm:px-5 @sm:text-xs @2xl:px-6 @2xl:py-2.5 @2xl:text-sm ${SKIN.border} ${SKIN.text}`}
            >
              Browse Categories
            </span>
          </div>
        </div>

        {/* Decorative slots — a sample collage, never real products. Two of
            them once there is room, all four only when there is plenty. */}
        <div className="hidden shrink-0 grid-cols-2 gap-2 @lg:grid @2xl:gap-2.5">
          <ImageSlot className="h-14 w-14 @2xl:h-16 @2xl:w-16 @4xl:h-20 @4xl:w-20" />
          <ImageSlot className="mt-4 h-14 w-14 @2xl:h-16 @2xl:w-16 @4xl:h-20 @4xl:w-20" />
          <ImageSlot className="-mt-4 hidden h-14 w-14 @2xl:block @2xl:h-16 @2xl:w-16 @4xl:h-20 @4xl:w-20" />
          <ImageSlot className="hidden h-14 w-14 @2xl:block @2xl:h-16 @2xl:w-16 @4xl:h-20 @4xl:w-20" />
        </div>
      </div>
    </section>
  )
}

/**
 * A stand-in for a photo. Tinted with the brand at low opacity rather than
 * left flat grey, so the slot reads as an image and the palette carries all
 * the way through the layout.
 */
function ImageSlot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`flex items-center justify-center overflow-hidden rounded-md ${SKIN.well} ${className}`}
    >
      <span
        aria-hidden
        className="flex h-full w-full items-center justify-center"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--brand) 16%, transparent) 0%, transparent 70%)',
        }}
      >
        <ImageIcon className="h-4 w-4 opacity-60 @2xl:h-5 @2xl:w-5" />
      </span>
    </span>
  )
}

function Categories() {
  return (
    <section className={`border-b ${BAND} ${SKIN.border}`}>
      <SectionHeading title="Shop by Category" />
      {/* Two-up until four tiles can hold a readable label — at 320px wide,
          four columns leave ~65px each, which truncates every name. */}
      <ul className="mt-3 grid grid-cols-2 gap-2 @lg:grid-cols-4">
        {CATEGORIES.map((name) => (
          <li key={name}>
            <span
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 @sm:px-3 @sm:py-2.5 ${SKIN.border} ${SKIN.surface}`}
            >
              <span
                className={`truncate font-heading text-xs font-medium @2xl:text-sm ${SKIN.text}`}
              >
                {name}
              </span>
              <span className="shrink-0 text-[10px] font-bold text-brand">24</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Products() {
  return (
    <section className={`border-b ${BAND} ${SKIN.border} ${SKIN.surface}`}>
      <SectionHeading title="Featured Products" action="View all" />
      {/* 2 → 3 → 6 up. Six sample products divide evenly at every step, so
          no tier is left with an orphan card on a second row, and each step
          keeps a card wide enough for the name, the price pair and the
          button to stay readable. */}
      <ul className="mt-3 grid grid-cols-2 gap-2.5 @lg:grid-cols-3 @4xl:grid-cols-6 @2xl:gap-3">
        {PRODUCTS.map((product) => (
          <li key={product.name}>
            <span
              className={`flex h-full flex-col overflow-hidden rounded-lg border ${SKIN.border} bg-bg`}
            >
              <span className="relative block p-1.5 pb-0 @sm:p-2 @sm:pb-0">
                <ImageSlot className="aspect-square w-full" />
                {product.sale && (
                  <span className="absolute left-3 top-3 rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-bold text-brand-contrast">
                    SALE
                  </span>
                )}
              </span>
              <span className="flex flex-1 flex-col gap-1 p-2 @sm:p-2.5">
                <span
                  className={`truncate text-[9px] font-semibold uppercase tracking-wide ${SKIN.muted}`}
                >
                  {product.category}
                </span>
                <span
                  className={`line-clamp-2 font-heading text-[11px] font-medium leading-tight @2xl:text-xs ${SKIN.text}`}
                >
                  {product.name}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="font-heading text-xs font-bold text-brand @2xl:text-sm">
                    {product.price}
                  </span>
                  {product.was && (
                    <span className={`text-[10px] line-through ${SKIN.muted}`}>
                      {product.was}
                    </span>
                  )}
                </span>
                {/* Dropped on the narrowest cards — at ~140px the row of
                    metadata crowds out the button, which matters more. */}
                <span
                  className={`hidden items-center gap-1 text-[10px] @sm:flex ${SKIN.muted}`}
                >
                  <StarIcon className="h-3 w-3 text-brand" filled />
                  {product.rating}
                </span>
                {/* The CTA at card scale — the smallest place the button text
                    still has to stay readable. */}
                <span
                  className={`mt-auto flex h-6 items-center justify-center rounded-md pt-0 text-[10px] font-bold @2xl:h-7 ${SKIN.cta}`}
                >
                  Add to Cart
                </span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Brand tick + Oswald title — the storefront's own heading rule. */
function SectionHeading({ title, action }: { title: string; action?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <span className="block h-0.5 w-6 rounded-full bg-brand" />
        <h3
          className={`mt-1.5 truncate font-heading text-base font-semibold @2xl:text-lg @4xl:text-xl ${SKIN.text}`}
        >
          {title}
        </h3>
      </div>
      {action && (
        <span className="shrink-0 text-[11px] font-semibold text-brand @sm:text-xs">
          {action} →
        </span>
      )}
    </div>
  )
}

/** An offer line — the flat brand color on text, next to the CTA treatment. */
function PromoStrip() {
  return (
    <section
      className={`flex flex-col gap-3 border-b @sm:flex-row @sm:items-center @sm:justify-between ${BAND} ${SKIN.border}`}
    >
      <div className="min-w-0">
        <p className={`font-heading text-sm font-semibold @2xl:text-base ${SKIN.text}`}>
          Get 10% off your first order
        </p>
        <p className={`mt-0.5 text-[11px] @sm:text-xs ${SKIN.muted}`}>
          Use code <span className="font-semibold text-brand">WELCOME10</span> at
          checkout.
        </p>
      </div>
      {/* Full width while stacked so it reads as a button, not a stray chip. */}
      <span
        className={`shrink-0 rounded-md px-4 py-2 text-center text-[11px] font-bold @sm:text-xs ${SKIN.cta}`}
      >
        Claim Offer
      </span>
    </section>
  )
}

function Footer({ storeName }: { storeName: string }) {
  return (
    <footer className={`px-3 py-3.5 @sm:px-4 @2xl:px-5 @2xl:py-4 ${SKIN.text}`}>
      <div className="flex flex-col gap-2 @md:flex-row @md:items-center @md:justify-between @md:gap-4">
        <span className={`truncate text-[11px] @sm:text-xs ${SKIN.muted}`}>
          © {new Date().getFullYear()} {storeName}
        </span>
        <span
          className={`flex flex-wrap gap-x-3 gap-y-1 text-[11px] @sm:text-xs ${SKIN.muted}`}
        >
          {['About', 'Contact', 'Shipping', 'Returns'].map((label) => (
            <span key={label}>{label}</span>
          ))}
        </span>
      </div>
    </footer>
  )
}

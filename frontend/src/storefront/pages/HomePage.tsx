import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useSeo } from '../../shared/seo'
import { ThemeToggle } from '../../shared/theme/ThemeToggle'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { SessionProvider } from '../app/SessionProvider'
import { useMarketSession } from '../app/marketSession'
import { AccountMenu } from '../layout/AccountMenu'
import {
  BoxIcon,
  CartIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  StoreIcon,
  TagIcon,
  TruckIcon,
} from '../layout/icons'
import { openAuthDialog } from '../features/auth/authDialogStore'
import { useCart } from '../features/cart/cart'
import { BannerCarousel } from '../features/banners/BannerCarousel'
import { discoveryApi } from '../features/discovery/discoveryApi'
import type {
  MarketBanner,
  MarketProduct,
  MarketStore,
  BrowsableCategory,
  SearchResults,
} from '../features/discovery/discoveryApi'
import {
  rememberSearch,
  useRecentSearches,
  useRecentStores,
} from '../features/discovery/recentActivity'
import { storesApi, formatPrice } from '../features/stores/storesApi'
import type { Store } from '../features/stores/storesApi'
import {
  CONTENT_COLUMN,
  SECTION_PADDING,
} from '../layout/contentWidth'
import { buttonClass } from '../../shared/ui/Button'

/**
 * Marketplace homepage (`/`) — the platform's public entry point. Not a
 * shopping page: it helps visitors find stores (global search, New Stores,
 * Recently Viewed), gives owners a shortcut to theirs, and sells the
 * "become a seller" story. Shopping happens inside `/store/{slug}`.
 *
 * Public by design: guests see everything except My Stores; the header
 * adapts (Sign in ↔ account menu) once the session probe resolves. Every
 * section loads independently — one failing API never blanks the page.
 *
 * ## Built for a young marketplace
 *
 * Two rules run through every section here, because the platform is small and
 * a homepage that only looks right when it is full is a homepage that looks
 * broken today:
 *
 *  - **Nothing counts itself out loud.** Trust is built on what the platform
 *    guarantees — buy direct from the seller, cash on delivery, secure
 *    payment — not on how many stores it has. A counter reading "3" argues
 *    against the page it sits on.
 *  - **No grid can end in holes.** Columns are capped by the number of items
 *    actually present (`gridFor`), and anything that arrives in an awkward
 *    count is a rail rather than a grid, so three stores read as a deliberate
 *    three-up instead of a four-up with a gap in it.
 *
 * ## Width
 *
 * Every band is full-bleed and everything inside it sits in `CONTENT_COLUMN` —
 * the same 1440px column the storefront uses. See `layout/contentWidth`.
 */

const NEW_STORES_PAGE_SIZE = 12
const SEARCH_DEBOUNCE_MS = 300
const SEARCH_MIN_CHARS = 2

/*
 * A search-intent bus used to live here: the Shop-by-Category chips pushed a
 * term into the global search box without threading state through the tree.
 * It went when the chips became links to `/c/{slug}` — a chip that lands on a
 * real category page beats one that fills in a search field, and the bus had
 * no other publisher. `GlobalSearchBox` owns its own state again.
 */

export function HomePage() {
  // The one page on the platform that competes for "UnieMax" itself, so its
  // title leads with what the site IS rather than with what this view shows.
  // `WebSite` + `SearchAction` is what can earn a sitelinks search box — it
  // needs a crawlable results URL to point at, which is why it names a target
  // this router does not serve yet and stays commented out rather than
  // shipping a promise Google would find broken.
  useSeo({
    title: [],
    description:
      'Discover independent online shops on UnieMax and order directly from the seller — clothing, sports gear, electronics, groceries and more, with cash on delivery or secure online payment.',
    canonical: '/',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'UnieMax',
      url: window.location.origin,
    },
  })
  const { state } = useMarketSession()
  const authed = state.status === 'authed'

  // One fetch feeds both My Stores and the Become-a-Seller CTA label.
  const [myStores, setMyStores] = useState<Store[] | null>(null)
  useEffect(() => {
    if (!authed) {
      setMyStores(null)
      return
    }
    let cancelled = false
    storesApi
      .list()
      .then((stores) => {
        if (!cancelled) setMyStores(stores)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [authed])

  const newProducts = useNewProducts()

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <MarketHeader />
      {/* Sections are full-bleed alternating bands (base/alt tone + bottom
          divider) — separation comes from background changes, not gaps. */}
      <main className="flex-1">
        <MarketBanners />
        <MarketIdentityBar />
        <NewStoresSection />
        <FreshFindsSection {...newProducts} />
        <RecentlyViewedSection />
        {authed && myStores && myStores.length > 0 && (
          <MyStoresSection stores={myStores} />
        )}
        <BecomeSellerSection ownsStores={(myStores?.length ?? 0) > 0} />
      </main>
      <MarketFooter />
    </div>
  )
}

/** Newest discoverable products platform-wide — the Fresh Finds rail. */
function useNewProducts() {
  const [products, setProducts] = useState<MarketProduct[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setProducts(null)
    discoveryApi
      .listNewProducts(12)
      .then((items) => {
        if (!cancelled) setProducts(items)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { products, failed, retry }
}

// ---------------------------------------------------------------------------
// Header — brand · global search · theme toggle · cart · session
// ---------------------------------------------------------------------------

export function MarketHeader() {
  const { state, signOut } = useMarketSession()
  const items = useCart()
  const cartCount = items.reduce((sum, item) => sum + item.qty, 0)

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      {/* Airy, but inside the same column as the page. Left full-width, the
          four zones (brand · search · sell · utilities) drifted apart until a
          2560 monitor put the logo and the account menu a screen apart with
          the search box marooned between them. */}
      {/* The gaps and the brand step DOWN at the smallest widths as well as up
          at the largest. Fixed at their comfortable desktop values, the logo,
          the theme toggle, the cart and Sign in together needed 339px of a
          320px screen — and the group overflowed the bar rather than any of it
          giving way. */}
      <div className={`flex h-16 items-center gap-3 sm:gap-6 md:h-20 md:gap-8 lg:gap-10 ${CONTENT_COLUMN}`}>
        {/* Brand never wraps or shrinks — it's the anchor of the bar. */}
        <Link to="/" aria-label="UnieMax home" className="flex shrink-0 items-center">
          <AppLogoLockup className="h-8 sm:h-9 md:h-11" />
        </Link>

        {/* Global search lives in the toolbar (md+); below md it gets its
            own row underneath. Wide on purpose — search is the page's
            primary action, so it owns the header's center. */}
        <div className="mx-auto hidden w-full max-w-3xl md:block">
          <GlobalSearchBox />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3 md:ml-0 md:gap-4 lg:gap-6">
          <CreateStoreLink className="hidden whitespace-nowrap text-sm font-semibold text-muted transition-colors hover:text-fg lg:block">
            Sell on UnieMax
          </CreateStoreLink>
          <ThemeToggle className="h-9 w-9 sm:h-10 sm:w-10" />
          {/* Plain <a>: /cart lives in the public router (full page load). */}
          <a
            href="/cart"
            aria-label={`Cart${cartCount > 0 ? ` (${cartCount} items)` : ''}`}
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-fg sm:h-10 sm:w-10"
          >
            <CartIcon className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand px-1 text-[10px] font-bold text-brand-contrast">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </a>

          {state.status === 'loading' && (
            <div className="h-9 w-9 animate-pulse rounded-full bg-surface-alt sm:h-10 sm:w-10" />
          )}
          {state.status === 'guest' && (
            <button
              type="button"
              onClick={() => openAuthDialog()}
              className="shrink-0 rounded-md bg-brand-gradient px-3.5 py-2 text-sm font-semibold text-brand-contrast transition hover:opacity-90 sm:px-5 sm:py-2.5"
            >
              Sign in
            </button>
          )}
          {state.status === 'authed' && (
            <SessionProvider customer={state.user} signOut={signOut}>
              <AccountMenu />
            </SessionProvider>
          )}
        </div>
      </div>

      {/* Mobile search row — same component, own state; the md+ instance
          above is display-hidden so only one is ever interacted with. */}
      <div className={`pb-3 md:hidden ${CONTENT_COLUMN}`}>
        <GlobalSearchBox />
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Banners — the platform's own promo carousel, uploaded by admins in the
// console, so the marketplace's campaign artwork is something the platform
// team can change without a deploy.
//
// It renders nothing at all until a banner exists, so a morning with no
// campaign simply opens on New Stores rather than on an empty frame.
// ---------------------------------------------------------------------------

function MarketBanners() {
  const [banners, setBanners] = useState<MarketBanner[]>([])

  useEffect(() => {
    let cancelled = false
    discoveryApi
      .listBanners()
      .then((items) => {
        if (!cancelled) setBanners(items)
      })
      // A decorative strip never earns an error state — on failure the page
      // simply opens one section higher.
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <BannerCarousel
      banners={banners}
      id="banners"
      className="bg-bg"
      // Framed inside the content column, exactly as the storefront frames
      // its own. Edge-to-edge, a 16:5 banner is a function of the SCREEN: 600px
      // tall on a 1920 monitor and 800px on a 2560 one, so the platform's
      // advert became the tallest thing on the page for the people with the
      // most screen to fill.
      containerClassName={`${CONTENT_COLUMN} py-6 sm:py-8`}
      frameClassName="overflow-hidden rounded-lg border border-line"
    />
  )
}

function GlobalSearchBox() {
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)
  const [results, setResults] = useState<SearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const requestId = useRef(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const recent = useRecentSearches()

  const query = q.trim()
  const active = query.length >= SEARCH_MIN_CHARS

  // Debounced grouped search with an out-of-order guard (same idiom as
  // useProductQuery): only the latest request may write state.
  useEffect(() => {
    if (!active) {
      setResults(null)
      setSearching(false)
      setFailed(false)
      return
    }
    setSearching(true)
    const id = ++requestId.current
    const timer = window.setTimeout(() => {
      discoveryApi
        .search(query)
        .then((found) => {
          if (requestId.current !== id) return
          setResults(found)
          setFailed(false)
          setSearching(false)
        })
        .catch(() => {
          if (requestId.current !== id) return
          setFailed(true)
          setSearching(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query, active])

  // Outside tap / Escape close the panel (input blur alone would race the
  // result clicks).
  useEffect(() => {
    if (!focused) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocused(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setFocused(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [focused])

  /** First hit in display order — the Enter target. */
  const firstHitUrl = useCallback((): string | null => {
    if (!results) return null
    const store = results.stores[0]
    if (store) return `/store/${store.slug}`
    const category = results.categories[0]
    if (category)
      return `/store/${category.store.slug}/category/${category.slug}`
    const product = results.products[0]
    if (product) return `/store/${product.store.slug}/product/${product.slug}`
    return null
  }, [results])

  const go = (url: string) => {
    rememberSearch(query)
    // Storefront pages live in the public router — a full navigation
    // crosses the router boundary exactly like the store header's cart link.
    window.location.href = url
  }

  // Focused + empty shows recent searches, so the panel opens as soon as
  // there is anything useful to show.
  const showPanel = focused && (active || recent.length > 0)

  return (
    <div ref={rootRef} className="relative text-left">
      <div className="flex items-center gap-3 rounded-pill border border-line bg-input px-5 py-3 transition-colors focus-within:border-accent">
        <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const url = firstHitUrl()
            if (url) go(url)
          }}
          placeholder="Search stores, products, or categories..."
          aria-label="Search stores, products, or categories"
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQ('')}
            className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-surface-alt hover:text-fg"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full z-30 mt-3 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-surface py-2 shadow-floating">
          {!active ? (
            /* Recent searches — local only; shown while the field is empty. */
            <div className="px-4 py-2">
              <p className="pb-2 text-xs font-semibold uppercase tracking-widest text-muted">
                Recent searches
              </p>
              <div className="flex flex-wrap gap-2">
                {recent.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => setQ(term)}
                    className="rounded-pill border border-line bg-surface-alt px-3 py-1 text-xs font-medium text-fg transition-colors hover:border-accent"
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {searching && !results && (
                <p className="px-5 py-4 text-sm text-muted">Searching…</p>
              )}
              {failed && (
                <p className="px-5 py-4 text-sm text-danger">
                  Something went wrong. Please try again.
                </p>
              )}
              {results && !failed && (
                <SearchResultsPanel results={results} onPick={go} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SearchResultsPanel({
  results,
  onPick,
}: {
  results: SearchResults
  onPick: (url: string) => void
}) {
  const empty =
    results.stores.length === 0 &&
    results.categories.length === 0 &&
    results.products.length === 0

  if (empty) {
    return (
      <p className="px-5 py-4 text-sm text-muted">
        No matching stores, products or categories found.
      </p>
    )
  }

  // Always grouped, never interleaved (spec's Search Requirements).
  return (
    <div className="divide-y divide-line">
      {results.stores.length > 0 && (
        <ResultGroup label="Stores">
          {results.stores.map((store) => (
            <ResultRow
              key={store.id}
              onPick={() => onPick(`/store/${store.slug}`)}
              icon={
                store.logoUrl ? (
                  <img
                    src={store.logoUrl}
                    alt=""
                    className="h-9 w-9 rounded-md object-cover"
                  />
                ) : (
                  <IconTile>
                    <StoreIcon className="h-4 w-4" />
                  </IconTile>
                )
              }
              title={store.name}
              subtitle={`/store/${store.slug}`}
            />
          ))}
        </ResultGroup>
      )}

      {results.categories.length > 0 && (
        <ResultGroup label="Categories">
          {results.categories.map((category) => (
            <ResultRow
              key={category.id}
              onPick={() =>
                onPick(
                  `/store/${category.store.slug}/category/${category.slug}`,
                )
              }
              icon={
                <IconTile>
                  <TagIcon className="h-4 w-4" />
                </IconTile>
              }
              title={
                category.parentName
                  ? `${category.parentName} › ${category.name}`
                  : category.name
              }
              subtitle={`in ${category.store.name}`}
            />
          ))}
        </ResultGroup>
      )}

      {results.products.length > 0 && (
        <ResultGroup label="Products">
          {results.products.map((product) => (
            <ResultRow
              key={product.id}
              onPick={() =>
                onPick(`/store/${product.store.slug}/product/${product.slug}`)
              }
              icon={
                product.image?.url ? (
                  <img
                    src={product.image.url}
                    alt={product.image.altText ?? ''}
                    className="h-9 w-9 rounded-md object-cover"
                  />
                ) : (
                  <IconTile>
                    <BoxIcon className="h-4 w-4" />
                  </IconTile>
                )
              }
              title={product.name}
              subtitle={`${product.categoryName} · ${product.store.name}`}
              trailing={
                product.price !== null ? (
                  <span className="text-sm font-semibold text-brand">
                    {formatPrice(product.price)}
                  </span>
                ) : undefined
              }
            />
          ))}
        </ResultGroup>
      )}
    </div>
  )
}

function ResultGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="py-2">
      <p className="px-5 pb-1 pt-2 text-xs font-semibold uppercase tracking-widest text-muted">
        {label}
      </p>
      {children}
    </div>
  )
}

function ResultRow({
  icon,
  title,
  subtitle,
  trailing,
  onPick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  trailing?: React.ReactNode
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors hover:bg-surface-alt"
    >
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-fg">
          {title}
        </span>
        <span className="block truncate text-xs text-muted">{subtitle}</span>
      </span>
      {trailing ?? <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />}
    </button>
  )
}

function IconTile({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand/10 text-brand">
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Section scaffolding — heading row + independent load/error/skeleton states
// ---------------------------------------------------------------------------

/**
 * Full-bleed section band. Sections alternate `tone` ("base" = page canvas,
 * "alt" = surface) and carry a bottom divider, so each one reads as its own
 * zone — background + border do the separating instead of big empty gaps.
 * Because the band lives INSIDE each section component, a section that
 * returns null never leaves an empty band behind.
 */
function Section({
  id,
  title,
  subtitle,
  tone = 'base',
  action,
  children,
}: {
  id?: string
  title: string
  subtitle?: string
  tone?: 'base' | 'alt'
  /** Optional control parked opposite the heading — a rail's arrows. */
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 border-b border-line ${tone === 'alt' ? 'bg-surface' : ''}`}
    >
      <div className={`${CONTENT_COLUMN} ${SECTION_PADDING}`}>
        <div className="mb-5 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-heading text-2xl font-semibold text-fg sm:text-3xl">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
        {children}
      </div>
    </section>
  )
}

function SectionError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-10 text-center shadow-floating">
      <p className="text-sm font-medium text-fg">Something went wrong.</p>
      <p className="mt-1 text-sm text-muted">Please try again.</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-md border border-line bg-surface-alt px-5 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent"
      >
        Retry
      </button>
    </div>
  )
}

/**
 * A card grid whose column count is capped by **what is actually in it**, and
 * whose row is capped by how wide those cards should be.
 *
 * Store cards are **portrait** (9:16 artwork), so they are narrow — ~220px —
 * and a 1440px row holds six of them rather than four. Each rung therefore
 * carries a `max-w` as well as a column count: `n` cards at ~220px plus the
 * 20px gaps between them. Without it, three stores in a `grid-cols-3` would
 * each be 440px wide at 1440 — the cap is what keeps a short row looking like
 * a deliberate three-up instead of three stretched tiles.
 *
 * Capping columns at the item count is the other half: it is why three stores
 * never render as a six-up row with three holes in it.
 *
 * Literal class strings, because Tailwind scans source text — an interpolated
 * `lg:grid-cols-${n}` is never generated.
 */
const CARD_RAMP = [
  'grid-cols-1 max-w-[220px]',
  'grid-cols-2 max-w-[460px]',
  'grid-cols-2 sm:grid-cols-3 sm:max-w-[700px]',
  'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 md:max-w-[940px]',
  'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:max-w-[1180px]',
  'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
] as const

/** The grid classes for `count` cards — never more columns than there are. */
function gridFor(count: number): string {
  const step = CARD_RAMP[Math.min(Math.max(count, 1), CARD_RAMP.length) - 1]
  return `grid gap-4 sm:gap-5 ${step}`
}

/** The full ramp — what a placeholder grid uses before any count is known. */
const CARD_GRID = gridFor(CARD_RAMP.length)

/**
 * Product rows are rails, not grids (see Fresh Finds), so there is no product
 * ramp: the card width lives in the rail's own percentage classes.
 */

/**
 * A horizontal rail — the shape for a row whose length nobody controls.
 *
 * A grid has to end somewhere, and eleven products in a five-column grid end
 * in four holes. A rail has no such problem at any count: cards are a
 * percentage of the scroller, so the last one is always part-cut at the right
 * edge, which is also what tells a thumb there is more. Arrows appear from
 * `lg` where there is no swipe, and grey out at each end rather than
 * disappearing, so the heading row never reflows as you scroll.
 */
function useRail() {
  const scroller = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ atStart: true, atEnd: true })

  const sync = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({
      atStart: el.scrollLeft <= 4,
      // A rail too short to scroll is at BOTH ends, which correctly greys
      // out both arrows rather than offering a control that does nothing.
      atEnd: el.scrollLeft >= max - 4,
    })
  }, [])

  const nudge = (direction: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  const arrows = (
    <span className="hidden shrink-0 items-center gap-1.5 lg:flex">
      <RailArrow direction={-1} disabled={edges.atStart} onClick={() => nudge(-1)} />
      <RailArrow direction={1} disabled={edges.atEnd} onClick={() => nudge(1)} />
    </span>
  )

  return { scroller, sync, arrows }
}

function RailArrow({
  direction,
  disabled,
  onClick,
}: {
  direction: 1 | -1
  disabled: boolean
  onClick: () => void
}) {
  const Icon = direction === -1 ? ChevronLeftIcon : ChevronRightIcon
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === -1 ? 'Scroll left' : 'Scroll right'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-fg transition-colors hover:border-brand hover:text-brand disabled:opacity-35 disabled:hover:border-line disabled:hover:text-fg"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

/**
 * A chip row that scrolls rather than wraps. Same edge-bleed trick as the
 * rail: on a phone the last chip is visibly cut off, which is the cue that
 * there is more to the right.
 */
const CHIP_SCROLLER =
  'pb-1 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

/**
 * The scroller itself. Bleeds to the screen edge on phones (so the last card
 * is visibly cut off) and tucks back into the content column from `sm`.
 */
const RAIL_SCROLLER =
  'flex gap-4 pb-1 sm:gap-5 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 snap-x snap-proximity [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

/**
 * Loading placeholders shaped like the real card: `media="banner"` mirrors the
 * store card (banner + centred logo), `media="square"` the product card.
 *
 * **`count` is the minimum the section will occupy, not the maximum it might.**
 * A section that asks the API for twelve and draws twelve placeholders looks
 * right on a full marketplace and collapses upward on this one, where three
 * stores arrive — and a page that shrinks under the cursor moves whatever the
 * visitor was about to click. One row's worth only ever grows downward.
 *
 * `layout="rail"` renders the same cards in the scroller the section will
 * become, so Fresh Finds does not visibly change shape when its data lands.
 */
function CardSkeletons({
  count,
  grid = CARD_GRID,
  media = 'banner',
  layout = 'grid',
}: {
  count: number
  grid?: string
  media?: 'banner' | 'square'
  layout?: 'grid' | 'rail'
}) {
  const rail = layout === 'rail'
  return (
    <div className={rail ? RAIL_SCROLLER : grid}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`animate-pulse overflow-hidden rounded-lg border border-line bg-surface ${
            rail
              ? 'w-[46%] shrink-0 sm:w-[31%] lg:w-[23%] xl:w-[19%]'
              : ''
          }`}
        >
          <div
            className={`w-full bg-surface-alt ${media === 'banner' ? 'aspect-[9/14]' : 'aspect-square'}`}
          />
          {media === 'banner' ? (
            <div className="flex flex-col gap-3 px-3.5 pb-3.5 pt-3">
              <div className="flex items-start gap-2.5">
                <div className="h-9 w-9 shrink-0 rounded-md bg-surface-alt" />
                <div className="min-w-0 flex-1">
                  <div className="h-4 w-2/3 rounded bg-surface-alt" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-surface-alt" />
                </div>
              </div>
              <div className="h-9 w-full rounded-md bg-surface-alt" />
            </div>
          ) : (
            <div className="space-y-2 p-4">
              <div className="h-3 w-1/2 rounded bg-surface-alt" />
              <div className="h-4 w-3/4 rounded bg-surface-alt" />
              <div className="h-3 w-1/3 rounded bg-surface-alt" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Store logo or the store glyph — cards never break on a missing logo.
 *
 * **`object-contain`, not `object-cover`.** A seller's logo is as often a
 * wordmark as a square mark, and cover-cropping one into a small tile keeps the
 * middle three letters and throws the rest away — on the live marketplace that
 * turned ZUNO HUB, Poorvika and Unicon Solutions into unreadable fragments.
 * Contained on a bordered surface tile it reads as an app icon: whatever shape
 * the logo is, all of it survives.
 */
function StoreLogoTile({
  logoUrl,
  className = 'h-12 w-12',
}: {
  logoUrl: string | null
  className?: string
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        // `bg-surface-alt`, not `bg-surface`: contained on the card's own
        // white the tile has no edge of its own and a pale logo dissolves
        // into the card. A faint grey plate gives every mark the same
        // footprint whatever its own background.
        className={`${className} rounded-md border border-line bg-surface-alt object-contain p-1`}
      />
    )
  }
  return (
    <span
      className={`${className} flex items-center justify-center rounded-md border border-line bg-surface-alt text-muted`}
    >
      <StoreIcon className="h-1/2 w-1/2" />
    </span>
  )
}

// ---------------------------------------------------------------------------
// New Stores — newest published stores (the platform is young; this replaces
// Trending until real activity data exists)
// ---------------------------------------------------------------------------

function NewStoresSection() {
  const [stores, setStores] = useState<MarketStore[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setStores(null)
    discoveryApi
      .listStores({ pageSize: NEW_STORES_PAGE_SIZE })
      .then(({ items }) => {
        if (!cancelled) setStores(items)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  return (
    <Section
      id="new-stores"
      title="New Stores"
      subtitle="Recently opened on the marketplace — take a look around."
    >
      {failed ? (
        <SectionError onRetry={() => setAttempt((n) => n + 1)} />
      ) : stores === null ? (
        <CardSkeletons count={4} />
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-line bg-surface px-6 py-12 text-center shadow-floating">
          <IconTile>
            <StoreIcon className="h-4 w-4" />
          </IconTile>
          <p className="mt-3 text-sm font-medium text-fg">
            No stores have been published yet.
          </p>
          <p className="mt-1 text-sm text-muted">Be the first seller!</p>
          <CreateStoreLink className={buttonClass({ size: 'md', className: 'mt-4' })}>
            Create Store →
          </CreateStoreLink>
        </div>
      ) : (
        <div className={gridFor(stores.length)}>
          {stores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>
      )}
    </Section>
  )
}

/** Published within this window → the card wears a "New" chip. */
const NEW_STORE_DAYS = 30

function isNewlyOpened(publishedAt: string | null): boolean {
  if (!publishedAt) return false
  const opened = new Date(publishedAt).getTime()
  if (Number.isNaN(opened)) return false
  return Date.now() - opened < NEW_STORE_DAYS * 24 * 60 * 60 * 1000
}

/**
 * Marketplace store card — a **storefront preview**, not a list row: a large
 * banner cut from the store's newest product cover, the store's logo
 * straddling the banner edge, then name · rating · product count · a "Visit
 * Store" CTA.
 *
 * The whole card remains one link; "Visit Store →" is a styled `<span>`, not a
 * nested `<a>` — that would be invalid HTML and a second tab stop for the same
 * destination.
 *
 * Hover is the premium cue: 4px lift, deeper halo (`shadow-lifted`), the
 * banner zooms, and the CTA fills with the brand color.
 */
function StoreCard({ store }: { store: MarketStore }) {
  return (
    <a
      href={`/store/${store.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-floating transition duration-200 hover:-translate-y-1 hover:border-accent hover:shadow-lifted"
    >
      {/* The New badge rides the ARTWORK rather than the text block. It is a
          fact about the shop, not about its name, and overlaid it costs no
          height at all. */}
      <div className="relative">
        <StorePreview images={store.previewImages} />
        {isNewlyOpened(store.publishedAt) && (
          <span className="absolute left-2 top-2 rounded-pill bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-contrast shadow-floating">
            New
          </span>
        )}
      </div>

      {/* `flex-1` + `mt-auto` on the button: a card whose name runs to two
          lines is taller than its neighbour, and the grid stretches both to
          match — without this the buttons in a row would sit at two different
          heights, which is the tell that a grid was laid out by accident. */}
      <div className="flex flex-1 flex-col gap-3 px-3.5 pb-3.5 pt-3">
        <div className="flex items-start gap-2.5">
          {/* One logo size at every width: the tile is ~220px at its widest,
              so the footer never has the room for a bigger badge. */}
          <StoreLogoTile logoUrl={store.logoUrl} className="h-9 w-9 shrink-0" />

          <span className="min-w-0 flex-1">
            {/* Two lines, not an ellipsis. `truncate` fits a name to whatever
                room is left, which on a narrow tile is about 130px — every
                shop read as "Retail S…", "Abhi's O…". */}
            <span className="line-clamp-2 block font-heading text-[15px] font-semibold leading-tight text-fg">
              {store.name}
            </span>

            {/* What the shop actually sells, from its own top-level shelves.
                "Poorvika", "MotoCore", "ZUNO HUB" are names a shopper cannot
                decode; "Mobiles · Accessories" underneath one is the whole
                difference between a card worth opening and a logo. Absent
                when a store has no active categories, rather than a
                placeholder — and deliberately NOT a product count, which is
                the shop's number rather than a reason to visit it. */}
            {store.categories.length > 0 && (
              <span className="mt-1 block truncate text-xs text-muted">
                {store.categories.join(' · ')}
              </span>
            )}
          </span>
        </div>

        {/* A real button, pinned to the bottom. The whole card is still one
            link — this is a styled `<span>`, never a nested `<a>`, so there is
            no second tab stop for the same destination. */}
        <span className="mt-auto flex h-9 w-full items-center justify-center gap-1 rounded-md border border-line text-xs font-bold text-fg transition-colors group-hover:border-brand group-hover:bg-brand group-hover:text-brand-contrast">
          Visit store
          <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </a>
  )
}

/**
 * The card's artwork: **a mosaic of the shop's own product covers**.
 *
 * The API has always sent up to four (`previewImages`) and the card used
 * exactly one of them, cover-cropped to 16:9 and treated as if it were store
 * branding. It is not — it is a photograph of one product, and a zoomed crop of
 * one product tells a shopper nothing about the shop. On the live marketplace
 * two neighbouring cards showed near-identical crops of the same brownie and
 * read as a duplicate render.
 *
 * A shop is a *collection*, so the artwork is a collection: a lead cover beside
 * a stack of two, hairline-separated. It degrades by count rather than by
 * breakpoint — four or three covers make the mosaic, two split the frame, one
 * fills it — so a brand-new shop with a single product still gets a deliberate
 * tile instead of a grid with holes in it.
 */
function StorePreview({ images }: { images: string[] }) {
  const shots = images.slice(0, 4)

  return (
    <div className="aspect-[9/14] w-full overflow-hidden bg-surface-alt">
      {/* The zoom lives on the inner layer so the hairlines and the frame stay
          put while the photographs move. */}
      <div className="h-full w-full transition-transform duration-500 ease-out group-hover:scale-[1.04]">
        {shots.length === 0 ? (
          // A soft brand-tinted panel, not a grey glyph on grey. A shop with no
          // products yet is the one most in need of looking deliberate.
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/12 to-surface-alt">
            <StoreIcon className="h-9 w-9 text-brand opacity-40" />
          </div>
        ) : shots.length === 1 ? (
          <Cover url={shots[0]!} />
        ) : shots.length === 2 ? (
          // Split across the SHORT axis: in a portrait frame two side-by-side
          // cells would be slivers, while two stacked ones are each a normal
          // landscape crop.
          <div className="grid h-full grid-rows-2 gap-px bg-line">
            {shots.map((url) => (
              <Cover key={url} url={url} />
            ))}
          </div>
        ) : (
          // Lead across the top two thirds, two beneath it — the portrait
          // equivalent of the lead-plus-stack this used to be in landscape.
          <div className="grid h-full grid-rows-3 gap-px bg-line">
            <div className="row-span-2 overflow-hidden">
              <Cover url={shots[0]!} />
            </div>
            <div className="grid grid-cols-2 gap-px bg-line">
              <Cover url={shots[1]!} />
              <Cover url={shots[2]!} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Cover({ url }: { url: string }) {
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-full w-full bg-surface object-cover"
    />
  )
}

// ---------------------------------------------------------------------------
// Identity bar — who this is and why it can be trusted, in one slim row
// ---------------------------------------------------------------------------

/**
 * What the marketplace promises a shopper.
 *
 * Every line is a property of the product, checkable in the code: orders go to
 * the seller's own dashboard, `StoreCheckoutPage` offers cash on delivery, and
 * online payment runs through the gateway. **Nothing here is a number**, and
 * that is the point — a young marketplace that leads with "3 stores" argues
 * against itself, while what it guarantees is as true on its third store as on
 * its three hundredth.
 *
 * Labels only, no explanatory sentence each. At this size a second line of
 * grey text under every item read as fine print, which is the opposite of
 * what a trust row is for.
 */
/**
 * The taxonomy has 154 nodes and the browsable set is ordered biggest-first,
 * so the row is capped rather than left to grow into a scroller nobody
 * reaches the end of. Twelve is what fits two comfortable phone swipes.
 */
const CATEGORY_CHIPS = 12

const TRUST_POINTS = [
  { icon: StoreIcon, label: 'Straight from the seller' },
  { icon: TruckIcon, label: 'Cash on delivery' },
  { icon: LockIcon, label: 'Secure online payment' },
] as const

/**
 * The bar under the banner: the page's `<h1>`, the trust row and the popular
 * categories — three things that each need one line, in one band.
 *
 * **The banner is the hero.** An earlier revision put a full text hero above
 * it — headline, sub-line, chips and a three-column trust grid — which gave
 * the page two openings competing for the same job and left a wide, plainly
 * empty band above the one piece of designed artwork on the site. This says
 * the same things in about a fifth of the height, and it says them *after* the
 * visitor has seen what the platform looks like.
 *
 * The heading is real rather than visually hidden. A page with no `<h1>` at
 * all loses both the landmark and the strongest on-page signal there is, and
 * an `<h1>` does not have to be the largest thing on screen to be the
 * heading — it has to be the true one.
 */
function MarketIdentityBar() {
  const [categories, setCategories] = useState<BrowsableCategory[]>([])

  useEffect(() => {
    let cancelled = false
    discoveryApi
      .browsableCategories()
      // A nice-to-have strip never earns an error state — on failure the
      // chips simply do not appear.
      .then((items) => {
        if (!cancelled) setCategories(items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="border-b border-line bg-surface">
      {/* One band, two rows — not two bands. Stacked, each with its own
          divider, three hairlines landed in 150px of page and the top of the
          document read as ruled paper. */}
      <div className={`${CONTENT_COLUMN} py-3.5`}>
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2">
          <h1 className="text-sm font-semibold text-fg sm:text-[15px]">
            UnieMax — shop directly from independent stores
          </h1>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {TRUST_POINTS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-1.5 text-xs text-muted"
              >
                <Icon className="h-4 w-4 shrink-0 text-brand" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        {categories.length > 0 && (
          // ONE scrolling line at every width, never a wrapping block. The
          // platform decides how many category names are popular, and eleven of
          // them wrapped to four rows on a phone. A row that scrolls holds any
          // number in the same height, and sideways is the natural gesture
          // there anyway.
          <div className={`mt-3 flex items-center gap-2.5 ${CHIP_SCROLLER}`}>
            <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-muted">
              Popular
            </span>
            {/*
              Links, not buttons. These were `onClick → prefill the search
              box`, which is invisible to a crawler: the row sat in the most
              prominent place on the site and passed nothing to anything. As
              `<Link to="/c/{slug}">` the same row becomes the internal link
              graph that gets the global category pages crawled — and the chip
              now lands on a real page instead of a filled-in search field.
            */}
            {categories.slice(0, CATEGORY_CHIPS).map((category) => (
              <Link
                key={category.slug}
                to={`/c/${category.slug}`}
                className="shrink-0 rounded-pill border border-line bg-bg px-4 py-1.5 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-brand"
              >
                {category.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Fresh Finds — newest products platform-wide (recency-based, like New
// Stores). Hidden entirely while the platform has no products to show.
//
// A RAIL, not a grid: the platform decides how many products are new, and a
// number nobody controls cannot be laid out in fixed columns without
// eventually ending in a row of holes (eleven products, five columns).
// ---------------------------------------------------------------------------

function FreshFindsSection({
  products,
  failed,
  retry,
}: {
  products: MarketProduct[] | null
  failed: boolean
  retry: () => void
}) {
  const { scroller, sync, arrows } = useRail()

  // Nothing to merchandise yet — the New Stores empty state already carries
  // the "be the first seller" message, so this section simply steps aside.
  if (products !== null && products.length === 0) return null

  return (
    <Section
      title="Fresh Finds"
      subtitle="The latest products added across all stores."
      tone="alt"
      action={products !== null && products.length > 0 ? arrows : undefined}
    >
      {failed ? (
        <SectionError onRetry={retry} />
      ) : products === null ? (
        <CardSkeletons count={5} media="square" layout="rail" />
      ) : (
        <ul ref={scroller} onScroll={sync} className={RAIL_SCROLLER}>
          {products.map((product) => (
            <li
              key={product.id}
              // Percentages, so the last card is always part-cut at the right
              // edge — the cue that tells a thumb there is more to the right.
              className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%] xl:w-[19%]"
            >
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/**
 * Marketplace product card — image, store, name, price. One link, no CTA.
 * Shares the store card's hover language (4px lift, deeper halo, image zoom)
 * so the two grids on this page feel like one system.
 */
function ProductCard({ product }: { product: MarketProduct }) {
  return (
    <a
      href={`/store/${product.store.slug}/product/${product.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-floating transition duration-200 hover:-translate-y-1 hover:border-accent hover:shadow-lifted"
    >
      {/* Own overflow context, so the zoom is clipped by the image frame and
          the divider below it doesn't scale along. */}
      <div className="aspect-square w-full overflow-hidden border-b border-line bg-surface-alt">
        {product.image?.url ? (
          <img
            src={product.image.url}
            alt={product.image.altText ?? product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <BoxIcon className="h-8 w-8 opacity-40" />
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="truncate text-xs text-muted">{product.store.name}</p>
        <p className="mt-1 truncate font-heading text-lg font-medium leading-tight text-fg transition-colors group-hover:text-brand">
          {product.name}
        </p>
        {product.price !== null && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-brand">
            {formatPrice(product.price)}
            {product.compareAtPrice && (
              <>
                <s className="text-xs font-normal text-muted">
                  {formatPrice(product.compareAtPrice)}
                </s>
                <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-contrast">
                  Sale
                </span>
              </>
            )}
          </p>
        )}
      </div>
    </a>
  )
}

// ---------------------------------------------------------------------------
// Recently Viewed — local snapshots; hidden when empty
// ---------------------------------------------------------------------------

/** Cards shown at most — storage caps at the same number, this makes the
    limit explicit even if older localStorage carries more entries. */
const RECENT_STORES_DISPLAY_LIMIT = 12

function RecentlyViewedSection() {
  const recent = useRecentStores().slice(0, RECENT_STORES_DISPLAY_LIMIT)
  const { scroller, sync, arrows } = useRail()
  if (recent.length === 0) return null

  return (
    <Section
      title="Recently Viewed"
      subtitle="Pick up where you left off."
      action={arrows}
    >
      {/* A rail rather than a grid: this is a "where was I" strip, not
          merchandising, and it holds however many shops this browser happens
          to remember. One scrolling line costs a single row of height at any
          count, where a grid of twelve logo chips became the tallest section
          on the page for a returning visitor. */}
      <ul ref={scroller} onScroll={sync} className={RAIL_SCROLLER}>
        {recent.map((store) => (
          <li
            key={store.slug}
            className="w-[66%] shrink-0 snap-start sm:w-[42%] md:w-[31%] lg:w-[23%] xl:w-[19%]"
          >
            <a
              href={`/store/${store.slug}`}
              className="flex items-center gap-3.5 rounded-lg border border-line bg-surface p-4 shadow-floating transition-colors hover:border-accent"
            >
              <StoreLogoTile logoUrl={store.logoUrl} className="h-11 w-11 shrink-0" />
              <span className="min-w-0 truncate font-heading text-base font-medium leading-tight text-fg">
                {store.name}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// My Stores — owners only (hidden entirely otherwise)
// ---------------------------------------------------------------------------

/**
 * Owner shortcut, deliberately compact — a slim scrollable row rather than a
 * full card grid, so the consumer sections keep the page's prime real estate
 * (the account menu already covers this journey too).
 */
function MyStoresSection({ stores }: { stores: Store[] }) {
  return (
    <Section
      title="My Stores"
      subtitle="Jump straight into managing a store."
      tone="alt"
    >
      {/* Same auto-fill grid as Recently Viewed — no dead space at row end. */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {stores.map((store) => (
          <Link
            key={store.id}
            to={`/mystores/${store.slug}`}
            className="flex items-center gap-3 rounded-lg border border-line bg-surface py-3 pl-3 pr-4 shadow-floating transition-colors hover:border-accent"
          >
            <StoreLogoTile logoUrl={store.logoUrl} className="h-9 w-9 shrink-0" />
            {/* User-typed name → body face (convention). */}
            <span className="min-w-0 flex-1 truncate font-body text-sm font-semibold tracking-normal text-fg">
              {store.name}
            </span>
            <span
              className={`shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${
                store.isPublished
                  ? 'bg-success/10 text-success'
                  : 'bg-warning/10 text-warning'
              }`}
            >
              {store.isPublished ? 'Published' : 'Draft'}
            </span>
          </Link>
        ))}

        <Link
          to="/mystores/new"
          className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line px-4 py-3 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-fg"
        >
          <PlusIcon className="h-4 w-4" />
          Create New Store
        </Link>
      </div>
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Become a Seller — the growth pitch (one of the largest sections by design)
// ---------------------------------------------------------------------------

const SELLER_PROOF_POINTS = [
  'Free to start — publish when you are ready',
  'Your own branding, theme and web address',
  'Cash on Delivery and online payments built in',
] as const

/**
 * What actually happens, in the order it happens. Three steps because that is
 * how many there are: the Create Store wizard, the product wizard, and the
 * Publish switch in the Store Builder.
 */
const SELLER_STEPS = [
  {
    title: 'Create your store',
    body: 'Name it, add your logo and business details. A few minutes.',
  },
  {
    title: 'Add your products',
    body: 'Photos, prices and stock, guided one product at a time.',
  },
  {
    title: 'Publish',
    body: 'Your shop goes live at its own address, ready to share.',
  },
] as const

/**
 * The growth pitch — the page's closing argument, and the largest panel on it.
 *
 * Split: the offer and the CTA on the left, **how it actually works** on the
 * right. That right-hand column used to hold live platform counters, and on a
 * marketplace this young they argued against the pitch they were decorating:
 * "3 Stores · 11 Products · 0 Orders" is not what a prospective seller should
 * read first. Three steps are true on day one and still true at ten thousand
 * stores, and they answer the question a seller actually has — what am I
 * signing up to do?
 *
 * The counters are not gone from the platform, only from this panel:
 * `GET /public/stats` still serves them for a surface where a number helps.
 */
function BecomeSellerSection({ ownsStores }: { ownsStores: boolean }) {
  return (
    <section className="scroll-mt-20">
      <div className={`${CONTENT_COLUMN} ${SECTION_PADDING}`}>
        <div className="overflow-hidden rounded-lg bg-brand-gradient text-brand-contrast shadow-floating">
          {/* Two real columns from `lg`, each `minmax(0,1fr)` — the old
              `1fr auto` sized the right column to three short numbers and left
              the middle of a 1400px panel empty. */}
          <div className="grid gap-10 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand-contrast/80">
                Become a Seller
              </p>
              <h2 className="mt-3 font-heading text-3xl font-bold leading-[1.1] sm:text-4xl lg:text-5xl">
                Start selling online
              </h2>
              <p className="mt-3 max-w-md text-sm text-brand-contrast/90 sm:text-base">
                Create your own professional online store in minutes. No
                technical knowledge required.
              </p>
              <ul className="mt-6 space-y-2.5">
                {SELLER_PROOF_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    {point}
                  </li>
                ))}
              </ul>
              {/* Inverted button — it paints in the panel's own label color
                  with the brand as its text, so it separates from the brand
                  gradient in either scheme (white/purple in light,
                  near-black/purple in dark) without a third color. */}
              <CreateStoreLink className="mt-8 inline-block rounded-md bg-brand-contrast px-8 py-3 text-sm font-bold text-brand transition hover:opacity-90">
                {ownsStores ? 'Create another store' : 'Create your store'}
              </CreateStoreLink>
            </div>

            <ol className="space-y-4 border-t border-brand-contrast/25 pt-8 lg:border-l lg:border-t-0 lg:pl-16 lg:pt-0">
              {SELLER_STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-contrast/40 font-heading text-sm font-bold"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {step.title}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-brand-contrast/80">
                      {step.body}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * "Create a store" CTA that works for everyone: guests get the auth dialog
 * and land on the creation page once signed in.
 */
function CreateStoreLink({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const { state } = useMarketSession()
  const navigate = useNavigate()
  if (state.status === 'authed') {
    return (
      <Link to="/mystores/new" className={className}>
        {children}
      </Link>
    )
  }
  // Guest (or still probing): sign in right here, then carry on to the
  // wizard — the dialog can't navigate itself (it sits outside the router),
  // so the follow-up is passed in.
  return (
    <button
      type="button"
      onClick={() =>
        openAuthDialog({
          intent: 'sell',
          initialView: 'register',
          onSignedIn: () => navigate('/mystores/new'),
        })
      }
      className={className}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

const FOOTER_COLUMNS = [
  {
    title: 'Marketplace',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Support', to: '/support' },
      { label: 'Contact', to: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms & Conditions', to: '/terms' },
    ],
  },
] as const

export function MarketFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className={`${CONTENT_COLUMN} py-12 lg:py-14`}>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="max-w-xs">
            <Link to="/" aria-label="UnieMax home" className="flex items-center">
              <AppLogoLockup className="h-8" />
            </Link>
            <p className="mt-3 text-sm text-muted">
              One marketplace of independent stores — discover, shop, or open
              your own.
            </p>
          </div>

          {FOOTER_COLUMNS.map(({ title, links }) => (
            <nav key={title} aria-label={title}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">
                {title}
              </p>
              <ul className="mt-3 space-y-2">
                {links.map(({ label, to }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className="text-sm text-fg transition-colors hover:text-brand"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              Sell on UnieMax
            </p>
            <p className="mt-3 text-sm text-muted">
              Open your own store in minutes — no technical knowledge required.
            </p>
            <CreateStoreLink className="mt-4 inline-block rounded-md border border-line px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent">
              Become a Seller
            </CreateStoreLink>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            © {new Date().getFullYear()} UnieMax · All rights reserved
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5" />
              Cash on Delivery available
            </span>
            <span className="flex items-center gap-1.5">
              <LockIcon className="h-3.5 w-3.5" />
              Secure checkout
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}

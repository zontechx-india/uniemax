import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
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
import {
  CreateStoreLink,
  SELLER_PROOF_POINTS,
  SELLER_STEPS,
} from '../features/selling/sellerPitch'
import { groupByStore, useCart } from '../features/cart/cart'
import { BackToTop } from '../layout/BackToTop'
import { SaveButton } from '../features/wishlist/SaveButton'
import { BannerCarousel } from '../features/banners/BannerCarousel'
import { discoveryApi } from '../features/discovery/discoveryApi'
import { CategoryIcon } from '../features/discovery/CategoryIcon'
import type {
  PlatformStats,
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
import {
  CARD_GRID,
  CardSkeletons,
  gridFor,
  RAIL_SCROLLER,
  StoreCard,
  StoreLogoTile,
  wholeRowsClass,
} from '../features/discovery/MarketCards'
import { storesApi, formatPrice } from '../features/stores/storesApi'
import type { Store } from '../features/stores/storesApi'
import {
  CONTENT_COLUMN,
  SECTION_PADDING,
} from '../layout/contentWidth'
import { buttonClass } from '../../shared/ui/Button'
import { MediaImg } from '../../shared/media/MediaImg'
import { Button } from '../../shared/ui/Button'
import { Card } from '../../shared/ui/Card'
import { ErrorState } from '../../shared/ui/states'

/**
 * Marketplace homepage (`/`) — the platform's public entry point. Not a
 * shopping page: it helps visitors find stores (global search, Top Stores,
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
 *    actually present (`gridFor`), or the grid shows only whole rows (Fresh
 *    Finds), or the row is a rail, so three stores read as a deliberate
 *    three-up instead of a four-up with a gap in it.
 *
 * ## Width
 *
 * Every band is full-bleed and everything inside it sits in `CONTENT_COLUMN` —
 * the same 1440px column the storefront uses. See `layout/contentWidth`.
 */

const TOP_STORES_PAGE_SIZE = 12
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
  // Title and description are the platform defaults from `index.html` — the
  // same values its server twin (`homePage` in pageShell.service.ts) leaves
  // in place, so the two can never disagree.
  useSeo({
    title: [],
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
        <ContinueShoppingStrip />
        <TopStoresSection />
        <FreshFindsSection {...newProducts} />
        <ShopByCategorySection />
        <MoreToExploreSection />
        <RecentlyViewedSection />
        {authed && myStores && myStores.length > 0 && (
          <MyStoresSection stores={myStores} />
        )}
        <BecomeSellerSection ownsStores={(myStores?.length ?? 0) > 0} />
      </main>
      <MarketFooter />
      <BackToTop />
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
      .listNewProducts(FRESH_FINDS_COUNT)
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
  // Phone only: the search row is hidden behind an icon in the bar, so the
  // pinned header costs one row, not two. Open by default on `/search`,
  // where the box shows the term the results are for.
  const onSearchPage = useLocation().pathname === '/search'
  const [searchOpen, setSearchOpen] = useState(onSearchPage)

  return (
    <>
      {/* Sticky at every width. On a phone the bar is the only row — search
          opens under it from the icon, and closes again from the same icon. */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg">
        {/* Airy, but inside the same column as the page. Left full-width, the
            four zones (brand · search · sell · utilities) drifted apart until a
            2560 monitor put the logo and the account menu a screen apart with
            the search box marooned between them. */}
        {/* The gaps and the brand step DOWN at the smallest widths as well as up
            at the largest. Fixed at their comfortable desktop values, the logo,
            the theme toggle, the cart and Sign in together needed 339px of a
            320px screen — and the group overflowed the bar rather than any of it
            giving way. */}
        <div className={`flex h-14 items-center gap-3 sm:h-16 sm:gap-6 md:h-20 md:gap-8 lg:gap-10 ${CONTENT_COLUMN}`}>
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
            <CreateStoreLink placement="home_header" className="hidden whitespace-nowrap text-sm font-semibold text-muted transition-colors hover:text-fg lg:block">
              Sell on UnieMax
            </CreateStoreLink>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchOpen((open) => !open)}
              aria-label={searchOpen ? 'Close search' : 'Search'}
              aria-expanded={searchOpen}
              aria-controls="mobile-search"
              className="w-9 px-0! text-muted hover:text-fg sm:h-10 sm:w-10 md:hidden"
            >
              {searchOpen ? <CloseIcon className="h-5 w-5" /> : <SearchIcon className="h-5 w-5" />}
            </Button>
            <ThemeToggle className="h-9 w-9 sm:h-10 sm:w-10" />
            {/* Plain <a>: /cart lives in the public router (full page load). */}
            <a
              href="/cart"
              aria-label={`Cart${cartCount > 0 ? ` (${cartCount} items)` : ''}`}
              className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-fg sm:h-10 sm:w-10"
            >
              <CartIcon className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand px-1 text-xs font-bold text-brand-contrast">
                  {cartCount > 99 ? '99+' : cartCount}
                </span>
              )}
            </a>

            {state.status === 'loading' && (
              <div className="h-9 w-9 animate-pulse rounded-full bg-surface-alt sm:h-10 sm:w-10" />
            )}
            {state.status === 'guest' && (
              <Button variant="primary" size="sm"
                onClick={() => openAuthDialog()}
                className="sm:h-tap sm:px-5"
              >
                Sign in
              </Button>
            )}
            {state.status === 'authed' && (
              <SessionProvider customer={state.user} signOut={signOut}>
                <AccountMenu />
              </SessionProvider>
            )}
          </div>
        </div>

        {/* Mobile search row — same component, own state; the md+ instance
            above is display-hidden so only one is ever interacted with.
            Inside the header so it stays pinned with the bar. Focused on
            open, so one tap on the icon brings up the keyboard. */}
        {searchOpen && (
          <div id="mobile-search" className="pb-3 md:hidden">
            <div className={CONTENT_COLUMN}>
              <GlobalSearchBox autoFocus={!onSearchPage} />
            </div>
          </div>
        )}
      </header>
    </>
  )
}

// ---------------------------------------------------------------------------
// Banners — the platform's own promo carousel, uploaded by admins in the
// console, so the marketplace's campaign artwork is something the platform
// team can change without a deploy.
//
// It renders nothing at all until a banner exists, so a morning with no
// campaign simply opens on Top Stores rather than on an empty frame.
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
      // most screen to fill. Tight on a phone, where every row of air pushes
      // the stores further down.
      containerClassName={`${CONTENT_COLUMN} py-3 sm:py-6 lg:py-8`}
      frameClassName="overflow-hidden rounded-lg border border-line"
    />
  )
}

function GlobalSearchBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const location = useLocation()
  const navigate = useNavigate()
  // On `/search` the box shows the term the page is showing results for.
  const [q, setQ] = useState(() =>
    location.pathname === '/search'
      ? (new URLSearchParams(location.search).get('q') ?? '')
      : '',
  )
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

  /**
   * Enter and "See all results" open the full results page. Enter used to
   * jump to the first hit, which took a shopper typing "shoes" straight into
   * whichever shop happened to be named Shoe-something.
   */
  const seeAll = () => {
    if (!active) return
    rememberSearch(query)
    setFocused(false)
    inputRef.current?.blur()
    navigate(`/search?q=${encodeURIComponent(query)}`)
  }

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
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') seeAll()
          }}
          enterKeyHint="search"
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
                <>
                  <SearchResultsPanel results={results} onPick={go} />
                  <div className="mt-1 border-t border-line px-3 pt-2">
                    <Button variant="ghost" size="sm" full onClick={seeAll}>
                      See all results for “{query}”
                    </Button>
                  </div>
                </>
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
                  <MediaImg
                    sizes="36px"
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
                  <MediaImg
                    sizes="36px"
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
                  <span className="font-figure text-sm font-semibold text-brand">
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
        <div className="mb-4 flex items-end justify-between gap-4 sm:mb-5">
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
    <Card>
      <ErrorState compact message="This section could not load. Check your connection and try again." onRetry={onRetry} />
    </Card>
  )
}

/**
 * A horizontal rail — the shape for a row whose length nobody controls.
 *
 * A grid has to end somewhere, and eleven products in a five-column grid end
 * in four holes. A rail has no such problem at any count: cards are a
 * percentage of the scroller, so the last one is always part-cut at the right
 * edge, which is also what tells a thumb there is more. Arrows appear from
 * `lg` where there is no swipe, and grey out at each end rather than
 * disappearing, so the heading row never reflows as you scroll.
 *
 * `scroller` is a **callback ref**: the rail mounts late (after its data) and
 * is measured the moment it does, then again whenever it is resized. Measured
 * only on scroll, both arrows sat greyed out on a desktop — where the hidden
 * scrollbar leaves the arrows as the only way to move — so a mouse user could
 * never get past the first screenful.
 */
function useRail() {
  const node = useRef<HTMLUListElement | null>(null)
  const [edges, setEdges] = useState({ atStart: true, atEnd: true })

  const sync = useCallback(() => {
    const el = node.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({
      atStart: el.scrollLeft <= 4,
      // A rail too short to scroll is at BOTH ends, which correctly greys
      // out both arrows rather than offering a control that does nothing.
      atEnd: el.scrollLeft >= max - 4,
    })
  }, [])

  const scroller = useCallback(
    (el: HTMLUListElement | null) => {
      node.current = el
      if (!el) return
      sync()
      const observer = new ResizeObserver(sync)
      observer.observe(el)
      return () => {
        observer.disconnect()
        node.current = null
      }
    },
    [sync],
  )

  const nudge = (direction: 1 | -1) => {
    const el = node.current
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
 * A chip row that scrolls rather than wraps. It sits between a fixed label and
 * the row's own controls, so it clips at its own edge rather than bleeding to
 * the screen's — the last chip is visibly cut off, which is the cue that
 * there is more to the right.
 *
 * Two chip rows on a phone (one row showed only two names there), one line
 * from `sm`. Either way it scrolls sideways and never wraps.
 */
const CHIP_SCROLLER_TWO_ROWS =
  'grid min-w-0 flex-1 basis-full auto-cols-max grid-flow-col grid-rows-2 gap-2 overflow-x-auto py-1 sm:flex sm:basis-auto sm:items-center sm:gap-2.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

/**
 * "View all →" beside a section heading — the way out of a row that only
 * shows the first few. Same look as the storefront's `SectionHeading` action.
 * `label` is the visible text; `name` the full accessible name, because a
 * screen reader listing the page's links hears every "View all" alike.
 */
function ViewAllLink({
  to,
  name,
  label = 'View all',
}: {
  to: string
  name: string
  label?: React.ReactNode
}) {
  return (
    <Link
      to={to}
      aria-label={name}
      className="group inline-flex min-h-tap shrink-0 items-center gap-1 whitespace-nowrap text-sm font-semibold text-fg underline decoration-line decoration-1 underline-offset-[6px] transition-colors hover:text-brand hover:decoration-current"
    >
      {label}
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Top Stores — the server's ranking, not ours: only stores with at least two
// photographed products, verified then real deliveries first (see
// `GET /public/stores`). A
// shop opened "just to try it" never leads the homepage.
// ---------------------------------------------------------------------------

function TopStoresSection() {
  const [stores, setStores] = useState<MarketStore[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setStores(null)
    discoveryApi
      .listStores({ pageSize: TOP_STORES_PAGE_SIZE })
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
      id="top-stores"
      title="Top Stores"
      subtitle="Stocked shops, ready to order from — take a look around."
      action={
        stores && stores.length > 0 ? (
          <ViewAllLink to="/shops" name="View all shops" />
        ) : undefined
      }
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
            No stores to show yet.
          </p>
          <p className="mt-1 text-sm text-muted">Be the first seller!</p>
          <CreateStoreLink placement="home_new_stores_empty" className={buttonClass({ size: 'md', className: 'mt-4' })}>
            Create Store →
          </CreateStoreLink>
        </div>
      ) : (
        <div className={gridFor(stores.length)}>
          {stores.map((store, index) => (
            // Whole rows only: twelve stores in five columns show ten.
            <div key={store.id} className={wholeRowsClass(index, stores.length)}>
              <StoreCard store={store} />
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Continue shopping — the visitor's own cart, one card per store
// ---------------------------------------------------------------------------

/** Stores the strip shows; the rest are one tap away in the cart. */
const CONTINUE_STORES = 4

/**
 * A slim band under the identity bar for someone who left items in their
 * cart: one card per store (thumbnails, item count, subtotal) leading
 * straight to that store's basket (`/cart/{store}`), where Place Order is.
 * Reads the local cart (`groupByStore` — active lines only, sold-out lines
 * not counted), so it costs no request and is absent for an empty cart. The
 * subtotal is the cart's own display figure; checkout re-prices as always.
 */
function ContinueShoppingStrip() {
  const groups = groupByStore(useCart()).filter((group) => group.itemCount > 0)
  if (groups.length === 0) return null

  return (
    <section aria-labelledby="continue-shopping" className="border-b border-line bg-bg">
      <div className={`${CONTENT_COLUMN} py-4`}>
        <div className="flex items-center justify-between gap-4">
          <h2 id="continue-shopping" className="text-base font-semibold text-fg">
            Continue shopping
          </h2>
          {/* Plain <a>: /cart lives in the public router (full page load). */}
          <a
            href="/cart"
            className="inline-flex min-h-tap items-center gap-1 text-sm font-semibold text-fg underline decoration-line decoration-1 underline-offset-[6px] transition-colors hover:text-brand hover:decoration-current"
          >
            View cart <span aria-hidden>→</span>
          </a>
        </div>
        <ul className={`mt-2 flex gap-3 ${CHIP_SCROLLER_BLEED}`}>
          {groups.slice(0, CONTINUE_STORES).map((group) => (
            <li key={group.storeSlug} className="w-[85%] shrink-0 sm:w-80">
              <a
                href={`/cart/${group.storeSlug}`}
                className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-accent"
              >
                <span className="flex shrink-0 -space-x-3">
                  {group.items.slice(0, 3).map((item) =>
                    item.imageUrl ? (
                      <MediaImg
                        key={`${item.productId}:${item.variantId ?? ''}`}
                        sizes="44px"
                        src={item.imageUrl}
                        alt=""
                        className="h-11 w-11 rounded-md border-2 border-surface bg-surface-alt object-contain"
                      />
                    ) : (
                      <span
                        key={`${item.productId}:${item.variantId ?? ''}`}
                        className="flex h-11 w-11 items-center justify-center rounded-md border-2 border-surface bg-surface-alt text-muted"
                      >
                        <BoxIcon className="h-4 w-4" />
                      </span>
                    ),
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">
                    {group.storeName}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {group.itemCount} item{group.itemCount === 1 ? '' : 's'} ·{' '}
                    <span className="font-figure">{formatPrice(group.subtotal)}</span>
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-brand">
                  Checkout <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** A card row that scrolls on a phone (edge-bleed, last card cut) and fits on wider screens. */
const CHIP_SCROLLER_BLEED =
  '-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

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
  // `null` while loading — the row holds its height with placeholder chips,
  // so the sections below do not jump down when the names arrive.
  const [categories, setCategories] = useState<BrowsableCategory[] | null>(null)
  const { scroller, sync, arrows } = useRail()

  useEffect(() => {
    let cancelled = false
    discoveryApi
      .browsableCategoriesShared()
      // A nice-to-have strip never earns an error state — on failure the
      // chips simply do not appear.
      .then((items) => {
        if (!cancelled) setCategories(items)
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
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
          <h1 className="text-sm font-semibold text-fg sm:text-base">
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

        {categories === null ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap" aria-hidden>
            <span className="flex min-h-tap shrink-0 items-center text-xs font-semibold uppercase tracking-widest text-muted sm:min-h-0">
              Popular
            </span>
            <div className={CHIP_SCROLLER_TWO_ROWS}>
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className="h-8 w-24 shrink-0 animate-pulse rounded-pill bg-surface-alt"
                />
              ))}
            </div>
          </div>
        ) : categories.length > 0 && (
          // A scrolling row, never a wrapping block. The platform decides how
          // many category names are popular, and eleven of them wrapped to
          // four rows on a phone. A row that scrolls holds any number in the
          // same height, and sideways is the natural gesture there anyway.
          // On a phone it is TWO scrolling rows under a "Popular … All" line
          // (one row showed only two names); one line from `sm`. Arrows from
          // `lg` (a mouse cannot swipe), and "All" at every width — the row
          // is capped, the taxonomy is not.
          <nav aria-label="Popular categories" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap">
            <span className="shrink-0 text-xs font-semibold uppercase tracking-widest text-muted">
              Popular
            </span>
            <ul ref={scroller} onScroll={sync} className={`order-last sm:order-none ${CHIP_SCROLLER_TWO_ROWS}`}>
              {/*
                Links, not buttons. These were `onClick → prefill the search
                box`, which is invisible to a crawler: the row sat in the most
                prominent place on the site and passed nothing to anything. As
                `<Link to="/c/{slug}">` the same row becomes the internal link
                graph that gets the global category pages crawled — and the chip
                now lands on a real page instead of a filled-in search field.
              */}
              {categories.slice(0, CATEGORY_CHIPS).map((category) => (
                <li key={category.slug} className="shrink-0">
                  <Link
                    to={`/c/${category.slug}`}
                    className="block rounded-pill border border-line bg-bg px-4 py-1.5 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-brand"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
            {arrows}
            <span className="ml-auto sm:ml-0">
              <ViewAllLink
                to="/categories"
                name="All categories"
                label={
                  <>
                    <span className="sm:hidden">All</span>
                    <span className="hidden sm:inline">All categories</span>
                  </>
                }
              />
            </span>
          </nav>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Fresh Finds — newest products platform-wide (recency-based, like New
// Stores). Hidden entirely while the platform has no products to show.
//
// A GRID that shows only WHOLE rows. A one-line rail showed five products on
// a desktop and two on a phone; this shows two rows on a wide screen (10–12)
// and a 2-column, three-row block on a phone (6) — the usual shopping-app
// home feed — with "View all" for the rest. The rail existed to avoid a grid
// ending in holes (eleven products, five columns); trimming each breakpoint
// to whole rows (`wholeRowsClass`) solves that without the rail.
// ---------------------------------------------------------------------------

/** Enough for two full rows at the widest (six-column) breakpoint. */
const FRESH_FINDS_COUNT = 12

/** Rows per breakpoint (phone first): a phone row is only two cards wide. */
const FRESH_FINDS_ROWS = [3, 2, 2, 2, 2] as const

function FreshFindsSection({
  products,
  failed,
  retry,
}: {
  products: MarketProduct[] | null
  failed: boolean
  retry: () => void
}) {
  // Nothing to merchandise yet — the Top Stores empty state already carries
  // the "be the first seller" message, so this section simply steps aside.
  if (products !== null && products.length === 0) return null

  return (
    <Section
      title="Fresh Finds"
      subtitle="The latest products added across all stores."
      tone="alt"
      action={
        products !== null && products.length > 0 ? (
          <ViewAllLink to="/new" name="View all new products" />
        ) : undefined
      }
    >
      {failed ? (
        <SectionError onRetry={retry} />
      ) : products === null ? (
        <CardSkeletons count={6} media="square" />
      ) : (
        <>
          <ul className={CARD_GRID}>
            {products.map((product, index) => (
              <li
                key={product.id}
                className={wholeRowsClass(index, products.length, FRESH_FINDS_ROWS)}
              >
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
          {/* On a phone the heading link sits far above the end of a
              three-row block; this is where the thumb is when it runs out. */}
          <Link
            to="/new"
            className={buttonClass({
              variant: 'secondary',
              size: 'md',
              full: true,
              className: 'mt-5 sm:hidden',
            })}
          >
            View all new products
          </Link>
        </>
      )}
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Shop by Category + More to Explore — the global taxonomy, in pictures and
// in rails. Two bands (base, then alt) so the page keeps alternating between
// Fresh Finds (alt) and Recently Viewed (base). Both read the one shared
// `GET /public/browse` fetch the Popular row makes, and both step aside
// silently when there is too little to show — a decorative band never earns
// an error state.
// ---------------------------------------------------------------------------

/** Most category tiles shown — two rows of four. */
const CATEGORY_TILES_MAX = 8

/** Top-level categories, biggest first — "Sports", never also "Team Sports". */
function useTopCategories(): BrowsableCategory[] | null {
  const [top, setTop] = useState<BrowsableCategory[] | null>(null)
  useEffect(() => {
    let cancelled = false
    discoveryApi
      .browsableCategoriesShared()
      .then((items) => {
        if (!cancelled) setTop(items.filter((item) => item.parentSlug === null))
      })
      .catch(() => {
        if (!cancelled) setTop([])
      })
    return () => {
      cancelled = true
    }
  }, [])
  return top
}

/**
 * How many tiles make only whole rows: the grid is 2 columns on a phone and 4
 * from `sm`, so 4 or 8 tiles; under four, all of them in a row of their own.
 * One tile is not a section — the Popular row already links it.
 */
function tileCount(available: number): number {
  const n = Math.min(available, CATEGORY_TILES_MAX)
  if (n < 2) return 0
  return n < 4 ? n : Math.floor(n / 4) * 4
}

const SHORT_TILE_GRID: Record<number, string> = {
  2: 'grid-cols-2 sm:max-w-[50%]',
  3: 'grid-cols-3 sm:max-w-[75%]',
}

function ShopByCategorySection() {
  const top = useTopCategories()
  const count = top === null ? 0 : tileCount(top.length)
  if (top !== null && count === 0) return null

  return (
    <Section
      title="Shop by category"
      subtitle="Every shop that sells it, on one page."
      action={<ViewAllLink to="/categories" name="All categories" />}
    >
      {top === null ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="category-well grid justify-items-center gap-4 px-3 pt-5 pb-4">
              <div className="aspect-square w-[72%] max-w-44 animate-pulse rounded-full bg-surface-alt" />
              <div className="h-4 w-2/3 animate-pulse rounded-full bg-surface-alt" />
            </div>
          ))}
        </div>
      ) : (
        <ul className={`grid gap-4 sm:gap-5 ${SHORT_TILE_GRID[count] ?? 'grid-cols-2 sm:grid-cols-4'}`}>
          {top.slice(0, count).map((category) => (
            <li key={category.slug}>
              {/* The "pressed well" tile: see `.category-well` in index.css. */}
              <Link
                to={`/c/${category.slug}`}
                className="category-well group grid h-full content-start justify-items-center gap-4 px-3 pt-5 pb-4 text-center"
              >
                {/* The category's own picture (uploaded in admin → Categories),
                    filling the plate; a contained one shows as a hard square
                    inside the circle. Without one, the category's icon — never
                    a seller's product photo, which read as random here. */}
                <span className="category-plate grid aspect-square w-[72%] max-w-44 place-items-center overflow-hidden">
                  {category.imageUrl ? (
                    <MediaImg
                      sizes="(min-width: 640px) 176px, 36vw"
                      src={category.imageUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <CategoryIcon slug={category.slug} className="h-[38%] w-[38%] text-brand" />
                  )}
                </span>
                <span className="line-clamp-2 max-w-full text-sm font-semibold text-balance text-fg transition-colors group-hover:text-brand">
                  {category.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Category rails in the More to Explore band. */
const EXPLORE_RAILS = 3
/** Products per rail, and the fewest a category needs to get one. */
const EXPLORE_RAIL_SIZE = 12
const EXPLORE_RAIL_MIN = 6

/**
 * One rail per big top-level category: its newest products from every shop.
 * A category with fewer than `EXPLORE_RAIL_MIN` products gets no rail — a
 * rail that cannot scroll is a short row pretending to be a carousel.
 */
function MoreToExploreSection() {
  const top = useTopCategories()
  const picks = (top ?? [])
    .filter((category) => category.productCount >= EXPLORE_RAIL_MIN)
    .slice(0, EXPLORE_RAILS)
  if (top !== null && picks.length === 0) return null

  return (
    <Section
      title="More to explore"
      subtitle="The newest from each top category."
      tone="alt"
    >
      {top === null ? (
        <CardSkeletons count={5} media="square" layout="rail" />
      ) : (
        <div className="space-y-8">
          {picks.map((category) => (
            <CategoryRail key={category.slug} category={category} />
          ))}
        </div>
      )}
    </Section>
  )
}

function CategoryRail({ category }: { category: BrowsableCategory }) {
  const { scroller, sync, arrows } = useRail()
  const [products, setProducts] = useState<MarketProduct[] | null>(null)

  useEffect(() => {
    let cancelled = false
    discoveryApi
      .browseCategory(category.slug, { pageSize: EXPLORE_RAIL_SIZE })
      .then((page) => {
        if (!cancelled) setProducts(page.products)
      })
      .catch(() => {
        if (!cancelled) setProducts([])
      })
    return () => {
      cancelled = true
    }
  }, [category.slug])

  if (products !== null && products.length === 0) return null

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className="truncate font-heading text-lg font-semibold text-fg sm:text-xl">
          {category.name}
        </h3>
        <span className="flex shrink-0 items-center gap-3">
          {products !== null && arrows}
          <ViewAllLink to={`/c/${category.slug}`} name={`View all ${category.name}`} />
        </span>
      </div>
      {products === null ? (
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
    </div>
  )
}

/**
 * Marketplace product card — image, store, name, price. One link, no CTA,
 * plus the save heart on the photo (a sibling of the link, not inside it).
 * Shares the store card's hover language (4px lift, deeper halo, image zoom)
 * so the two grids on this page feel like one system — the lift is on the
 * wrapper, so the heart rides up with the card.
 */
function ProductCard({ product }: { product: MarketProduct }) {
  return (
    <div className="relative h-full min-w-0 transition duration-200 hover:-translate-y-1">
      <SaveButton
        productId={product.id}
        productName={product.name}
        className="absolute right-2 top-2 z-10"
      />
      <a
        href={`/store/${product.store.slug}/product/${product.slug}`}
        className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-floating transition duration-200 hover:border-accent hover:shadow-lifted"
      >
        {/* Own overflow context, so the zoom is clipped by the image frame and
            the divider below it doesn't scale along. */}
        <div className="aspect-square w-full overflow-hidden border-b border-line bg-surface-alt">
          {product.image?.url ? (
            <MediaImg
              sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
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
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 font-figure text-sm font-semibold text-brand">
              {formatPrice(product.price)}
              {product.compareAtPrice && (
                <>
                  <s className="text-xs font-normal text-muted">
                    {formatPrice(product.compareAtPrice)}
                  </s>
                  <span className="rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-contrast">
                    Sale
                  </span>
                </>
              )}
            </p>
          )}
        </div>
      </a>
    </div>
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
              className={`shrink-0 rounded-pill px-2 py-0.5 text-xs font-semibold ${
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

const compactCountFormat = new Intl.NumberFormat('en-IN', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Short form for a big count: 1,240 → "1.2K", 18,500 → "18.5K". */
function compactCount(value: number): string {
  return compactCountFormat.format(value)
}

/**
 * The growth pitch — the page's closing argument, and the largest panel on it.
 *
 * Split: the offer and the CTA on the left; on the right, live platform
 * counters (Stores · Products · Users, in short form — "1.2K") above **how it
 * actually works**. The counters come from `GET /public/stats`, fail silently
 * and hide any zero. Orders are deliberately not shown. The three steps stay
 * because they are true on day one and still at ten thousand stores.
 */
function BecomeSellerSection({ ownsStores }: { ownsStores: boolean }) {
  const [stats, setStats] = useState<PlatformStats | null>(null)

  useEffect(() => {
    let cancelled = false
    discoveryApi
      .stats()
      .then((data) => {
        if (!cancelled) setStats(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // A pitch never shows an error state, and a zero would undermine the trust
  // the numbers exist to build — so failures and zeros simply drop out.
  const counters = stats
    ? [
        { value: stats.stores, label: 'Stores' },
        { value: stats.products, label: 'Products' },
        { value: stats.users, label: 'Users' },
      ].filter((counter) => counter.value > 0)
    : []

  return (
    <section className="scroll-mt-20">
      <div className={`${CONTENT_COLUMN} ${SECTION_PADDING}`}>
        {/* The aurora panel — fixed colours (see `seller-aurora` in index.css),
            so the panel and its white text look the same in either scheme. */}
        <div className="seller-aurora rounded-lg">
          {/* Two real columns from `lg`, each `minmax(0,1fr)` — the old
              `1fr auto` sized the right column to three short numbers and left
              the middle of a 1400px panel empty. */}
          <div className="grid gap-10 px-5 py-12 sm:px-10 sm:py-14 lg:grid-cols-2 lg:items-center lg:gap-14 lg:px-14">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/80">
                Become a Seller
              </p>
              <h2 className="mt-3 font-heading text-3xl font-bold leading-[1.1] sm:text-4xl lg:text-5xl">
                Start selling online
              </h2>
              <p className="mt-3 max-w-md text-sm text-white/90 sm:text-base">
                Create your own professional online store in minutes. No
                technical knowledge required.
              </p>
              <ul className="mt-6 space-y-2.5">
                {SELLER_PROOF_POINTS.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm text-white/90">
                    <span className="aurora-frost mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full">
                      <CheckIcon className="h-3 w-3" />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              {/* The shared primary button — `seller-aurora` re-points
                  `--cta` to white with brand text, so it stays flat and
                  still separates from the colour field. */}
              <CreateStoreLink
                placement="home_seller_panel"
                className={buttonClass({ size: 'lg', className: 'mt-8' })}
              >
                {ownsStores ? 'Create another store' : 'Create your store'}
              </CreateStoreLink>
            </div>

            <div className="aurora-pane min-w-0 rounded-lg p-4 sm:p-6">
              {counters.length > 0 && (
                <dl className="mb-7 grid auto-cols-fr grid-flow-col gap-2 sm:gap-3">
                  {counters.map(({ value, label }) => (
                    <div key={label} className="aurora-frost min-w-0 rounded-lg px-2.5 py-3.5 sm:px-4 sm:py-4">
                      <dd className="aurora-figure font-figure text-xl font-bold leading-tight sm:text-3xl">
                        {compactCount(value)}
                      </dd>
                      <dt className="mt-1 truncate text-xs font-semibold text-white/80 sm:uppercase sm:tracking-wider">
                        {label}
                      </dt>
                    </div>
                  ))}
                </dl>
              )}
              <ol className="space-y-4">
                {SELLER_STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="aurora-frost flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold"
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {step.title}
                      </span>
                      <span className="mt-0.5 block text-sm leading-relaxed text-white/80">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

const FOOTER_COLUMNS = [
  {
    title: 'Marketplace',
    links: [
      { label: 'All categories', to: '/categories' },
      { label: 'All shops', to: '/shops' },
      { label: 'Fresh Finds', to: '/new' },
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
      { label: 'Refund & Returns', to: '/refund-policy' },
      { label: 'Shipping Policy', to: '/shipping-policy' },
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
            <CreateStoreLink placement="home_footer" className="mt-4 inline-block rounded-md border border-line px-4 py-2 text-sm font-semibold text-fg transition-colors hover:border-accent">
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

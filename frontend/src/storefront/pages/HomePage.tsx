import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../../shared/usePageTitle'
import { ThemeToggle } from '../../shared/theme/ThemeToggle'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { SessionProvider } from '../app/SessionProvider'
import { useMarketSession } from '../app/marketSession'
import { AccountMenu } from '../layout/AccountMenu'
import {
  BoxIcon,
  CartIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  StoreIcon,
  TagIcon,
} from '../layout/icons'
import { useCart } from '../features/cart/cart'
import { discoveryApi } from '../features/discovery/discoveryApi'
import type {
  MarketProduct,
  MarketStore,
  PlatformStats,
  PopularCategory,
  SearchResults,
} from '../features/discovery/discoveryApi'
import {
  rememberSearch,
  useRecentSearches,
  useRecentStores,
} from '../features/discovery/recentActivity'
import { storesApi, formatPrice } from '../features/stores/storesApi'
import type { Store } from '../features/stores/storesApi'

/**
 * Marketplace homepage (`/`) — the platform's public entry point. Not a
 * shopping page: it helps visitors find stores (global search, New Stores,
 * Recently Viewed), gives owners a shortcut to theirs, and sells the
 * "become a seller" story. Shopping happens inside `/store/{slug}`.
 *
 * Public by design: guests see everything except My Stores; the header
 * adapts (Sign in ↔ account menu) once the session probe resolves. Every
 * section loads independently — one failing API never blanks the page.
 */

const NEW_STORES_PAGE_SIZE = 12
const SEARCH_DEBOUNCE_MS = 300
const SEARCH_MIN_CHARS = 2

/**
 * Tiny search-intent bus: the Shop-by-Category chips pre-fill the global
 * search without threading state through the tree. Both `GlobalSearchBox`
 * instances (toolbar + mobile row) subscribe; only the visible one grabs
 * keyboard focus, and the hidden one's panel can't render anyway (its
 * container is display-hidden at that breakpoint).
 */
const searchIntentListeners = new Set<(term: string) => void>()

function requestGlobalSearch(term: string) {
  searchIntentListeners.forEach((listener) => listener(term))
}

export function HomePage() {
  usePageTitle('Discover Stores')
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

  // One fetch feeds both the hero collage and the Fresh Finds rail. The rail
  // owns the error/retry UI; the hero simply skips its collage on failure.
  const newProducts = useNewProducts()

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <MarketHeader />
      {/* Sections are full-bleed alternating bands (base/alt tone + bottom
          divider) — separation comes from background changes, not gaps. */}
      <main className="flex-1">
        <MarketHero products={newProducts.products} />
        <ShopByCategoryStrip />
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

/**
 * Newest discoverable products platform-wide — shared by the hero collage
 * and the Fresh Finds rail so the page costs one request, not two.
 */
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

function MarketHeader() {
  const { state, signOut } = useMarketSession()
  const items = useCart()
  const cartCount = items.reduce((sum, item) => sum + item.qty, 0)

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
      {/* Deliberately airy: a tall bar and large gaps between the four zones
          (brand · search · sell · utilities) so nothing reads as crowded. */}
      <div className="mx-auto flex h-16 w-full max-w-[1920px] items-center gap-5 px-4 sm:gap-8 sm:px-6 md:h-20 lg:gap-12 lg:px-10">
        {/* Brand never wraps or shrinks — it's the anchor of the bar. */}
        <Link to="/" className="flex shrink-0 items-center">
          <AppLogoLockup className="h-9 md:h-11" />
        </Link>

        {/* Global search lives in the toolbar (md+); below md it gets its
            own row underneath. Wide on purpose — search is the page's
            primary action, so it owns the header's center. */}
        <div className="mx-auto hidden w-full max-w-3xl md:block">
          <GlobalSearchBox />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-3 sm:gap-4 md:ml-0 lg:gap-6">
          <CreateStoreLink className="hidden whitespace-nowrap text-sm font-semibold text-muted transition-colors hover:text-fg lg:block">
            Sell on UnieMax
          </CreateStoreLink>
          <ThemeToggle className="h-10 w-10" />
          {/* Plain <a>: /cart lives in the public router (full page load). */}
          <a
            href="/cart"
            aria-label={`Cart${cartCount > 0 ? ` (${cartCount} items)` : ''}`}
            className="relative flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-alt hover:text-fg"
          >
            <CartIcon className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-brand px-1 text-[10px] font-bold text-brand-contrast">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </a>

          {state.status === 'loading' && (
            <div className="h-10 w-10 animate-pulse rounded-full bg-surface-alt" />
          )}
          {state.status === 'guest' && (
            <Link
              to="/login"
              className="rounded-md bg-brand-gradient px-5 py-2.5 text-sm font-semibold text-brand-contrast transition hover:opacity-90"
            >
              Sign in
            </Link>
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
      <div className="px-4 pb-3 sm:px-6 md:hidden">
        <GlobalSearchBox />
      </div>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Hero — left-aligned pitch band; the right side proves the marketplace is
// alive with a collage of REAL product covers (skipped while there aren't
// enough). The global search sits in the sticky toolbar.
// ---------------------------------------------------------------------------

const HERO_COLLAGE_SIZE = 4

function MarketHero({ products }: { products: MarketProduct[] | null }) {
  const covers = (products ?? [])
    .map((product) => product.image?.url)
    .filter((url): url is string => Boolean(url))
    .slice(0, HERO_COLLAGE_SIZE)
  // Adapts to what the catalog has: 2 covers → one per column, 3 → 2+1,
  // 4 → 2+2. Below 2 the collage isn't worth drawing.
  const split = Math.ceil(covers.length / 2)

  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto flex w-full max-w-[1920px] items-center gap-12 px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
        {/* Display copy is select-none: a stray drag otherwise highlights the
            headline, which reads as glitchy. */}
        <div className="max-w-2xl select-none">
          <h1 className="font-heading text-3xl font-bold text-fg sm:text-5xl sm:leading-none">
            Discover stores.{' '}
            <span className="text-brand-gradient">Shop anything.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
            Independent stores on one marketplace — search across all of them,
            or open your own in minutes.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <a
              href="#new-stores"
              className="rounded-md bg-brand-gradient px-6 py-2.5 text-sm font-semibold text-brand-contrast transition hover:opacity-90"
            >
              Start Shopping
            </a>
            <CreateStoreLink className="rounded-md border border-line px-6 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-accent">
              Open Your Store
            </CreateStoreLink>
          </div>
        </div>

        {/* Two offset columns read editorial rather than grid-of-thumbnails.
            Purely decorative (alt="") — the shoppable cards are below. */}
        {covers.length >= 2 && (
          <div className="ml-auto hidden shrink-0 select-none grid-cols-2 items-start gap-4 lg:grid">
            <div className="space-y-4">
              {covers.slice(0, split).map((url) => (
                <HeroCollageImage key={url} url={url} />
              ))}
            </div>
            <div className="mt-8 space-y-4">
              {covers.slice(split).map((url) => (
                <HeroCollageImage key={url} url={url} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function HeroCollageImage({ url }: { url: string }) {
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-32 w-32 rounded-lg border border-line object-cover shadow-floating xl:h-40 xl:w-40"
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

  // Shop-by-Category chips (and any future caller) push a term into the box.
  useEffect(() => {
    const onIntent = (term: string) => {
      setQ(term)
      setFocused(true)
      const input = inputRef.current
      // offsetParent is null while a display-hidden ancestor hides this
      // instance — only the visible box should steal keyboard focus.
      if (input && input.offsetParent !== null) input.focus()
    }
    searchIntentListeners.add(onIntent)
    return () => {
      searchIntentListeners.delete(onIntent)
    }
  }, [])

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
  children,
}: {
  id?: string
  title: string
  subtitle?: string
  tone?: 'base' | 'alt'
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 border-b border-line ${tone === 'alt' ? 'bg-surface' : ''}`}
    >
      <div className="mx-auto w-full max-w-[1920px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
        <div className="mb-5">
          <h2 className="font-heading text-2xl font-semibold text-fg sm:text-3xl">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
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

/** Open-ended card grid — same column ramp as the storefront (2→3→4→5). */
const CARD_GRID =
  'grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'

/** Product cards are leaner than store cards, so they pack one column
    denser at every breakpoint (Fresh Finds: 4-up from lg). */
const PRODUCT_GRID =
  'grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'

/**
 * Loading placeholders shaped like the real card: `media="banner"` mirrors the
 * store card (banner + centred logo), `media="square"` the product card.
 */
function CardSkeletons({
  count,
  grid = CARD_GRID,
  media = 'banner',
}: {
  count: number
  grid?: string
  media?: 'banner' | 'square'
}) {
  return (
    <div className={grid}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-lg border border-line bg-surface"
        >
          <div
            className={`w-full bg-surface-alt ${media === 'banner' ? 'aspect-[16/9]' : 'aspect-square'}`}
          />
          {media === 'banner' ? (
            <div className="relative flex flex-col px-4 pb-4">
              <div className="-mt-8 h-16 w-16 self-start rounded-full bg-surface-alt ring-4 ring-surface" />
              <div className="mt-2.5 h-4 w-2/3 rounded bg-surface-alt" />
              <div className="mb-4 mt-2 h-3 w-1/2 rounded bg-surface-alt" />
              <div className="flex items-center justify-between border-t border-line pt-3">
                <div className="h-3 w-16 rounded bg-surface-alt" />
                <div className="h-7 w-24 rounded-pill bg-surface-alt" />
              </div>
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

/** Store logo or the store glyph — cards never break on a missing logo. */
function StoreLogoTile({
  logoUrl,
  className = 'h-12 w-12',
  rounded = 'rounded-md',
}: {
  logoUrl: string | null
  className?: string
  /** Corner treatment — the store card's overlapping badge goes full-round. */
  rounded?: string
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        loading="lazy"
        className={`${className} ${rounded} border border-line bg-surface object-cover`}
      />
    )
  }
  return (
    <span
      className={`${className} ${rounded} flex items-center justify-center bg-surface-alt text-muted`}
    >
      <StoreIcon className="h-1/3 w-1/3" />
    </span>
  )
}

/**
 * Star rating slot. **There is no review system yet**, so `rating` is `null`
 * and the row renders as an explicit "No reviews yet" placeholder — it holds
 * the exact space the real thing will occupy without fabricating stars for
 * shoppers. Once the API returns a rating + count, pass them and the row lights
 * up with no other change.
 */
function StoreRating({
  rating = null,
  reviewCount = 0,
  className = '',
}: {
  rating?: number | null
  reviewCount?: number
  className?: string
}) {
  const rounded = rating === null ? 0 : Math.round(rating)
  return (
    <span className={`flex items-center gap-1.5 ${className}`}>
      <span
        className={`flex ${rating === null ? 'text-muted/35' : 'text-brand'}`}
        aria-hidden="true"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <StarIcon key={star} className="h-3.5 w-3.5" filled={star <= rounded} />
        ))}
      </span>
      <span className="text-[11px] text-muted">
        {rating === null
          ? 'No reviews yet'
          : `${rating.toFixed(1)} (${reviewCount.toLocaleString('en-IN')})`}
      </span>
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
          <CreateStoreLink className="mt-4 rounded-md bg-brand-gradient px-5 py-2 text-sm font-semibold text-brand-contrast transition hover:opacity-90">
            Create Store →
          </CreateStoreLink>
        </div>
      ) : (
        <div className={CARD_GRID}>
          {stores.map((store) => (
            <StoreCard key={store.id} store={store} />
          ))}
        </div>
      )}
    </Section>
  )
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
  const banner = store.previewImages[0] ?? null

  return (
    <a
      href={`/store/${store.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-floating transition duration-200 hover:-translate-y-1 hover:border-accent hover:shadow-lifted"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-surface-alt">
        {banner ? (
          <>
            <img
              src={banner}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
            {/* Only over a real photo — on the icon fallback a scrim reads as
                a grey smear across an otherwise clean tile. */}
            <div
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent"
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <StoreIcon className="h-10 w-10 opacity-40" />
          </div>
        )}
      </div>

      {/* `relative` is load-bearing: the banner above is positioned, so without
          it this block (and the overlapping logo) paints UNDERNEATH the image. */}
      <div className="relative flex flex-1 flex-col px-4 pb-4">
        <StoreLogoTile
          logoUrl={store.logoUrl}
          rounded="rounded-full"
          className="-mt-8 h-16 w-16 shrink-0 self-start ring-4 ring-surface"
        />

        {/* Left-aligned and full-bleed to the card's padding — a centred column
            left both margins empty. Stays `text-fg` on hover: the lift, halo
            and banner zoom already carry the hover state. */}
        <p className="mt-2.5 line-clamp-1 font-heading text-lg font-medium leading-tight text-fg">
          {store.name}
        </p>

        <StoreRating className="mb-4 mt-1.5" />

        {/* Footer spans the full width: count anchored left, CTA right. */}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
          <span className="truncate text-xs font-semibold text-muted">
            {store.productCount > 0
              ? `${store.productCount.toLocaleString('en-IN')} Product${store.productCount === 1 ? '' : 's'}`
              : 'Just opened'}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-line px-3.5 py-1.5 text-xs font-bold text-fg transition-colors group-hover:border-brand group-hover:bg-brand group-hover:text-brand-contrast">
            Visit Store
            <ChevronRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </a>
  )
}

// ---------------------------------------------------------------------------
// Shop by Category — Flipkart-style entry points. Categories are per-store
// (no global taxonomy), so the chips are the most common category NAMES
// across published stores; tapping one runs it through the global search.
// Renders nothing until loaded and nothing on failure — a nice-to-have strip
// never earns an error state.
// ---------------------------------------------------------------------------

function ShopByCategoryStrip() {
  const [categories, setCategories] = useState<PopularCategory[]>([])

  useEffect(() => {
    let cancelled = false
    discoveryApi
      .popularCategories()
      .then((items) => {
        if (!cancelled) setCategories(items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (categories.length === 0) return null

  return (
    <div className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center gap-2.5 px-4 py-3.5 sm:px-6 lg:px-10">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">
          Shop by category
        </span>
        {categories.map((category) => (
          <button
            key={category.name.toLowerCase()}
            type="button"
            onClick={() => requestGlobalSearch(category.name)}
            className="shrink-0 rounded-pill border border-line bg-surface px-4 py-1.5 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-brand"
          >
            {category.name}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fresh Finds — newest products platform-wide (recency-based, like New
// Stores). Hidden entirely while the platform has no products to show.
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
  // Nothing to merchandise yet — the New Stores empty state already carries
  // the "be the first seller" message, so this section simply steps aside.
  if (products !== null && products.length === 0) return null

  return (
    <Section
      title="Fresh Finds"
      subtitle="The latest products added across all stores."
      tone="alt"
    >
      {failed ? (
        <SectionError onRetry={retry} />
      ) : products === null ? (
        <CardSkeletons count={8} grid={PRODUCT_GRID} media="square" />
      ) : (
        <div className={PRODUCT_GRID}>
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
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
      className="group overflow-hidden rounded-lg border border-line bg-surface shadow-floating transition duration-200 hover:-translate-y-1 hover:border-accent hover:shadow-lifted"
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
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
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
          <p className="mt-1.5 text-sm font-semibold text-brand">
            {formatPrice(product.price)}
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
  if (recent.length === 0) return null

  return (
    <Section title="Recently Viewed" subtitle="Pick up where you left off.">
      {/* auto-fill grid: wraps AND stretches cards to fill each row, so a
          partial row never leaves dead space on the right. */}
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {recent.map((store) => (
          <a
            key={store.slug}
            href={`/store/${store.slug}`}
            className="group flex items-center gap-3.5 rounded-lg border border-line bg-surface p-4 shadow-floating transition duration-200 hover:-translate-y-1 hover:border-accent hover:shadow-lifted"
          >
            <StoreLogoTile logoUrl={store.logoUrl} className="h-11 w-11 shrink-0" />
            <span className="min-w-0 truncate font-heading text-lg font-medium leading-tight text-fg">
              {store.name}
            </span>
          </a>
        ))}
      </div>
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
            to={`/stores/${store.slug}`}
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
          to="/stores/new"
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
 * The growth pitch (spec: one of the largest sections). Split layout: the
 * offer + proof points on the left, the live platform counters on the right
 * as social proof — stats belong inside the pitch, not floating alone. The
 * counters fail silently (a pitch never shows an error state) and hide any
 * zero, which would undermine the trust they exist to build.
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

  const counters = stats
    ? ([
        { value: stats.stores, label: 'Stores' },
        { value: stats.products, label: 'Products' },
        { value: stats.orders, label: 'Orders' },
      ].filter((counter) => counter.value > 0))
    : []

  return (
    <section className="scroll-mt-20">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
        <div className="overflow-hidden rounded-lg bg-brand-gradient text-brand-contrast shadow-floating">
          <div className="grid gap-10 px-6 py-12 sm:px-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-contrast/80">
            Become a Seller
          </p>
          <h2 className="mt-3 max-w-2xl font-heading text-3xl font-bold sm:text-5xl">
            Start Selling Online
          </h2>
          <p className="mt-3 max-w-xl text-sm text-brand-contrast/90 sm:text-base">
            Create your own professional online store in minutes. No technical
            knowledge required.
          </p>
          <ul className="mt-6 space-y-2.5">
            {SELLER_PROOF_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-sm">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {point}
              </li>
            ))}
          </ul>
          {/* Inverted button — it paints in the panel's own label color with
              the brand as its text, so it separates from the brand gradient
              in either scheme (white/purple in light, near-black/purple in
              dark) without a third color. */}
          <CreateStoreLink className="mt-8 inline-block rounded-md bg-brand-contrast px-8 py-3 text-sm font-bold text-brand transition hover:opacity-90">
            {ownsStores ? 'Create Another Store' : 'Create Store'}
          </CreateStoreLink>
        </div>

            {counters.length > 0 && (
              <div className="flex gap-10 border-t border-brand-contrast/25 pt-8 sm:gap-14 lg:flex-col lg:gap-8 lg:border-l lg:border-t-0 lg:pl-16 lg:pt-0">
                {counters.map(({ value, label }) => (
                  <div key={label}>
                    <p className="font-heading text-3xl font-bold sm:text-4xl">
                      {value.toLocaleString('en-IN')}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-brand-contrast/80">
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * "Create a store" CTA that works for everyone: guests are routed through
 * /login with the creation page as the return destination.
 */
function CreateStoreLink({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  const { state } = useMarketSession()
  const to =
    state.status === 'authed'
      ? '/stores/new'
      : `/login?next=${encodeURIComponent('/stores/new')}`
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
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

function MarketFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-10">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="max-w-xs">
            <Link to="/" className="flex items-center">
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

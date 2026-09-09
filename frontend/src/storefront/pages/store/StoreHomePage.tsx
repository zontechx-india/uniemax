import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  publicStoreApi,
  storeCategoryUrl,
  storeShopUrl,
  type PublicCategory,
  type PublicProduct,
  type PublicSection,
  type PublicStore,
  type PublicStoreHome,
} from '../../features/stores/storesApi'
import {
  StorePageShell,
  usePublicStore,
} from '../../features/publicStore/PublicStoreLayout'
import { usePageTitle } from '../../../shared/usePageTitle'
import { ProductCard } from '../../features/publicStore/ProductCard'
import {
  EmptyCatalog,
  GridSkeleton,
  SectionHeading,
} from '../../features/publicStore/ListingControls'
import { ChevronRightIcon } from '../../layout/icons'
import type { Skin } from '../../features/publicStore/storeTheme'

/**
 * Products fetched per homepage row. Only as many as fill the current
 * breakpoint's row are actually shown — see `ROW_VISIBILITY`.
 */
const ROW_SIZE = 6

/**
 * Per-index visibility for a homepage row, so **every** breakpoint renders one
 * exactly-full row and never strands an orphan card on a second line:
 * 2 → 3 (md) → 4 (lg) → 5 (xl) → 6 (2xl) columns, matching `ROW_GRID`.
 */
const ROW_VISIBILITY = [
  '',
  '',
  'hidden md:list-item',
  'hidden lg:list-item',
  'hidden xl:list-item',
  'hidden 2xl:list-item',
]

/** Same column ramp as the open-ended listings, capped at one row. */
const ROW_GRID =
  'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'

/** Covers used by the hero collage (lg+ only). */
const HERO_COLLAGE_SIZE = 4

/**
 * `/store/{storeSlug}` — the storefront homepage.
 *
 * It *introduces* the store rather than dumping a filtered product grid:
 * hero, Shop by Category, then the owner's merchandising sections.
 * Browsing happens on the category pages; discovery happens here and through
 * search.
 *
 * **Layout** — sections render as full-bleed **bands** (alternating surface
 * tone + a bottom divider) exactly like the marketplace homepage: separation
 * comes from the background change, not from large empty gaps, and the band
 * lives inside each section so a hidden one leaves nothing behind. Each
 * product row shows a single row's worth with a "View all" link into the Shop
 * page scoped to that section (`?section=…`), so the homepage stays a summary.
 * Rows are strictly flag-driven — a section with nothing flagged renders
 * nothing (there is deliberately no fallback).
 */
export function StoreHomePage() {
  const { store, skin } = usePublicStore()
  usePageTitle(store.name)
  const [home, setHome] = useState<PublicStoreHome | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    setHome(undefined)
    publicStoreApi
      .getHome(store.slug)
      .then((data) => {
        if (!cancelled) setHome(data)
      })
      .catch(() => {
        if (!cancelled) setHome(null)
      })
    return () => {
      cancelled = true
    }
  }, [store.slug])

  if (store.categories.length === 0) {
    return (
      <StorePageShell>
        <EmptyCatalog storeName={store.name} skin={skin} />
      </StorePageShell>
    )
  }

  if (home === undefined) {
    return (
      <>
        <Hero store={store} skin={skin} covers={[]} categoriesAnchor={false} />
        <StorePageShell>
          <GridSkeleton skin={skin} />
        </StorePageShell>
      </>
    )
  }

  if (home === null) {
    return (
      <>
        <Hero store={store} skin={skin} covers={[]} categoriesAnchor={false} />
        <StorePageShell>
          <p className={`py-10 text-center text-sm ${skin.muted}`}>
            Could not load this store's products. Please refresh.
          </p>
        </StorePageShell>
      </>
    )
  }

  // Only sections that will actually paint something, in the ORDER the owner
  // arranged. Filtering BEFORE indexing keeps the alternating band tones
  // strictly alternating — an empty section never burns a tone slot.
  const visible = home.sections
    .filter((section) => section.enabled)
    .filter((section) => hasContent(section.key, home))

  const showsCategories = visible.some((section) => section.key === 'categories')
  const covers = heroCovers(home)

  return (
    <>
      {visible.map((section, index) => (
        <HomeSection
          key={section.key}
          sectionKey={section.key}
          store={store}
          home={home}
          skin={skin}
          // Alternating bands, starting on the raised surface tone.
          tone={index % 2 === 0 ? 'alt' : 'base'}
          covers={covers}
          categoriesAnchor={showsCategories}
        />
      ))}
    </>
  )
}

/** Does this section have anything to render? Drives band alternation. */
function hasContent(
  key: PublicStoreHome['sections'][number]['key'],
  home: PublicStoreHome,
): boolean {
  switch (key) {
    case 'hero':
      return true
    case 'categories':
      return home.featuredCategories.length > 0
    case 'featured':
      return home.featured.length > 0
    case 'newArrivals':
      return home.newArrivals.length > 0
    case 'bestSellers':
      return home.bestSellers.length > 0
  }
}

/** Real product covers for the hero collage — deduped, newest rows first. */
function heroCovers(home: PublicStoreHome): string[] {
  const urls = [...home.newArrivals, ...home.featured, ...home.bestSellers]
    .map((product) => product.image?.url)
    .filter((url): url is string => Boolean(url))
  return [...new Set(urls)].slice(0, HERO_COLLAGE_SIZE)
}

/** Renders one homepage section by key. */
function HomeSection({
  sectionKey,
  store,
  home,
  skin,
  tone,
  covers,
  categoriesAnchor,
}: {
  sectionKey: PublicStoreHome['sections'][number]['key']
  store: PublicStore
  home: PublicStoreHome
  skin: Skin
  tone: BandTone
  covers: string[]
  categoriesAnchor: boolean
}) {
  switch (sectionKey) {
    case 'hero':
      return (
        <Hero
          store={store}
          skin={skin}
          tone={tone}
          covers={covers}
          categoriesAnchor={categoriesAnchor}
        />
      )
    case 'categories':
      return (
        <FeaturedCategories
          store={store}
          categories={home.featuredCategories}
          skin={skin}
          tone={tone}
        />
      )
    case 'featured':
      return (
        <ProductRow
          store={store}
          title="Featured Products"
          section="featured"
          products={home.featured}
          skin={skin}
          tone={tone}
        />
      )
    case 'newArrivals':
      return (
        <ProductRow
          store={store}
          title="New Arrivals"
          section="newArrivals"
          products={home.newArrivals}
          skin={skin}
          tone={tone}
        />
      )
    case 'bestSellers':
      return (
        <ProductRow
          store={store}
          title="Best Sellers"
          section="bestSellers"
          products={home.bestSellers}
          skin={skin}
          tone={tone}
        />
      )
  }
}

type BandTone = 'base' | 'alt'

/**
 * Full-bleed section band: the page canvas or the raised surface tone plus a
 * bottom divider, with the standard 1920px-capped column inside. The band is
 * part of the section, so a section that renders nothing leaves no empty strip.
 */
function Band({
  id,
  tone = 'base',
  skin,
  className = '',
  children,
}: {
  id?: string
  tone?: BandTone
  skin: Skin
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 border-b ${skin.border} ${tone === 'alt' ? skin.surface : ''} ${className}`}
    >
      <div className="mx-auto w-full max-w-[1920px] px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
        {children}
      </div>
    </section>
  )
}

/**
 * Hero band — the store's own introduction, sized like the marketplace hero
 * (a compact left-aligned pitch, not a tall empty box). On lg+ an offset
 * collage of the store's REAL product covers proves the shop is stocked;
 * it is decorative (`alt=""`) and simply absent while there are fewer than
 * two covers.
 */
function Hero({
  store,
  skin,
  tone = 'alt',
  covers,
  categoriesAnchor,
}: {
  store: PublicStore
  skin: Skin
  tone?: BandTone
  covers: string[]
  categoriesAnchor: boolean
}) {
  const productCount = store.categories.reduce(
    (sum, c) => sum + c.productCount,
    0,
  )
  // 2 covers → one per column, 3 → 2+1, 4 → 2+2. Below 2 it isn't worth drawing.
  const split = Math.ceil(covers.length / 2)

  return (
    <Band tone={tone} skin={skin} className="relative overflow-hidden">
      {/* Brand wash — keeps the hero from reading as an empty slab. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          background:
            'radial-gradient(120% 120% at 85% 15%, var(--brand) 0%, transparent 60%)',
        }}
      />
      <div className="relative flex items-center gap-10">
        {/* Display copy is select-none: a stray drag otherwise highlights the
            headline, which reads as glitchy. */}
        <div className="max-w-2xl select-none">
          {/* Wide-tracked eyebrow (prototype: "UnieMax · SPORTS FACTORY"). */}
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand">
            Welcome to
          </span>
          {/* Prototype hero scale: Oswald 700, near-flush leading. */}
          <h1
            className={`mt-2 font-heading text-3xl font-bold leading-none sm:text-5xl ${skin.text}`}
          >
            {store.name}
          </h1>
          <p className={`mt-3 max-w-xl text-sm sm:text-base ${skin.muted}`}>
            Browse our full range — {productCount}{' '}
            {productCount === 1 ? 'product' : 'products'} across{' '}
            {store.categories.length}{' '}
            {store.categories.length === 1 ? 'category' : 'categories'},
            delivered to your door.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              to={storeShopUrl(store.slug)}
              className={`inline-flex items-center gap-1.5 rounded-md px-6 py-2.5 text-sm font-bold transition ${skin.cta}`}
            >
              Start Shopping
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
            {/* Only offered when the categories band is actually on the page. */}
            {categoriesAnchor && (
              <a
                href="#shop-by-category"
                className={`rounded-md border px-6 py-2.5 text-sm font-semibold transition-colors hover:border-brand ${skin.border} ${skin.text}`}
              >
                Shop by Category
              </a>
            )}
          </div>
        </div>

        {/* Two offset columns read editorial rather than grid-of-thumbnails. */}
        {covers.length >= 2 && (
          <div className="ml-auto hidden shrink-0 select-none grid-cols-2 items-start gap-4 lg:grid">
            <div className="space-y-4">
              {covers.slice(0, split).map((url) => (
                <HeroCollageImage key={url} url={url} skin={skin} />
              ))}
            </div>
            <div className="mt-8 space-y-4">
              {covers.slice(split).map((url) => (
                <HeroCollageImage key={url} url={url} skin={skin} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Band>
  )
}

function HeroCollageImage({ url, skin }: { url: string; skin: Skin }) {
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      className={`h-28 w-28 rounded-lg border object-cover shadow-floating xl:h-36 xl:w-36 ${skin.border}`}
    />
  )
}

/**
 * Shop by Category — text-only entry points. Deliberately **no icon and no
 * decorative padding**: the category name is the content, so the tiles are
 * compact rows that pack a full-bleed band six across instead of four tall
 * boxes with a badge in the middle.
 */
function FeaturedCategories({
  store,
  categories,
  skin,
  tone,
}: {
  store: PublicStore
  categories: PublicCategory[]
  skin: Skin
  tone: BandTone
}) {
  if (categories.length === 0) return null
  return (
    <Band id="shop-by-category" tone={tone} skin={skin}>
      <SectionHeading title="Shop by Category" skin={skin} />
      <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              to={storeCategoryUrl(store.slug, category.slug)}
              className={`group flex h-full items-center justify-between gap-3 rounded-lg border px-3.5 py-3 metal-lift ${skin.border} ${skin.surface}`}
            >
              <span className="min-w-0">
                <span
                  className={`block truncate font-heading text-base font-medium leading-tight transition-colors group-hover:text-brand ${skin.text}`}
                >
                  {category.name}
                </span>
                {category.subcategories.length > 0 && (
                  <span
                    className={`mt-0.5 block truncate text-[11px] ${skin.muted}`}
                  >
                    {namesBelow(category).join(' · ')}
                  </span>
                )}
              </span>
              <span className="shrink-0 whitespace-nowrap text-[10px] font-bold text-brand">
                {category.productCount}{' '}
                {category.productCount === 1 ? 'product' : 'products'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Band>
  )
}

/**
 * One merchandising row — capped at a single row of cards, with "View all"
 * (into the Shop page scoped to THIS section, not the whole catalog) when the
 * section holds more than the row shows. Renders nothing when empty.
 */
function ProductRow({
  store,
  title,
  section,
  products,
  skin,
  tone,
}: {
  store: PublicStore
  title: string
  section: PublicSection
  products: PublicProduct[]
  skin: Skin
  tone: BandTone
}) {
  if (products.length === 0) return null
  const shown = products.slice(0, ROW_SIZE)
  return (
    <Band tone={tone} skin={skin}>
      <SectionHeading
        title={title}
        // The narrowest breakpoint only shows two cards, so anything beyond
        // that can be hidden — offer the full section whenever it might be.
        action={
          products.length > 2
            ? { label: 'View all', to: storeShopUrl(store.slug, { section }) }
            : undefined
        }
        skin={skin}
      />
      <ul className={`mt-4 ${ROW_GRID}`}>
        {shown.map((product, index) => (
          <ProductCard
            key={product.id}
            store={store}
            product={product}
            skin={skin}
            className={ROW_VISIBILITY[index] ?? ''}
          />
        ))}
      </ul>
    </Band>
  )
}

/** Every shelf beneath a category, however deep, as a flat list of names. */
function namesBelow(category: PublicCategory): string[] {
  return category.subcategories.flatMap((sub) => [sub.name, ...namesBelow(sub)])
}

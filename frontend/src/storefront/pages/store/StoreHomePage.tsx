import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  publicStoreApi,
  SECTION_TITLES,
  storeCategoryUrl,
  storeShopUrl,
  type PublicCategory,
  type PublicCategoryRow,
  type PublicProduct,
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
import { BannerCarousel } from '../../features/banners/BannerCarousel'

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

type HomeSectionKey = PublicStoreHome['sections'][number]['key']

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
 *
 * The three curated rows are strictly flag-driven — one with nothing flagged
 * renders nothing (there is deliberately no fallback). What keeps an uncurated
 * shop from being a hero over empty space is the two rows below them, which
 * need no flags: **Shop by Category** rows (one per category, "View all" into
 * that category's own page) and **All Products** (newest, "View all" into
 * Shop). Both are ordinary sections the owner can reorder or hide.
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
  const tones = bandTones(visible, home)

  return (
    <>
      {visible.map((section, index) => (
        <HomeSection
          key={section.key}
          sectionKey={section.key}
          store={store}
          home={home}
          skin={skin}
          tone={tones[index]}
          covers={covers}
          categoriesAnchor={showsCategories}
        />
      ))}
    </>
  )
}

/** Does this section have anything to render? Drives band alternation. */
function hasContent(key: HomeSectionKey, home: PublicStoreHome): boolean {
  switch (key) {
    case 'banners':
      return home.banners.length > 0
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
    case 'categoryRows':
      return home.categoryRows.length > 0
    case 'catalog':
      return home.catalog.length > 0
  }
}

/**
 * How many bands a section paints. Every section is one band except the
 * category rows, which paint one each — the tone ramp has to count them, or
 * an odd number of rows would hand the next section the tone it just used.
 */
function bandCount(key: HomeSectionKey, home: PublicStoreHome): number {
  return key === 'categoryRows' ? home.categoryRows.length : 1
}

/** Alternating band tones, starting on the raised surface tone. */
function bandTones(
  sections: PublicStoreHome['sections'],
  home: PublicStoreHome,
): BandTone[] {
  let band = 0
  return sections.map((section) => {
    const tone: BandTone = band % 2 === 0 ? 'alt' : 'base'
    band += bandCount(section.key, home)
    return tone
  })
}

/** Real product covers for the hero collage — deduped, newest rows first. */
function heroCovers(home: PublicStoreHome): string[] {
  // `catalog` last: it is the fallback that gives an uncurated shop a collage
  // at all, but a curated row's covers are the ones the owner chose.
  const urls = [
    ...home.newArrivals,
    ...home.featured,
    ...home.bestSellers,
    ...home.catalog,
  ]
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
  sectionKey: HomeSectionKey
  store: PublicStore
  home: PublicStoreHome
  skin: Skin
  tone: BandTone
  covers: string[]
  categoriesAnchor: boolean
}) {
  switch (sectionKey) {
    case 'banners':
      return (
        <BannerCarousel
          banners={home.banners}
          id="shop-banners"
          className={`border-b ${skin.border} ${tone === 'alt' ? skin.surface : ''}`}
          wellClassName={skin.well}
        />
      )
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
    case 'newArrivals':
    case 'bestSellers':
      return (
        <ProductRow
          store={store}
          title={SECTION_TITLES[sectionKey]}
          viewAllTo={storeShopUrl(store.slug, { section: sectionKey })}
          products={home[sectionKey]}
          skin={skin}
          tone={tone}
        />
      )
    case 'categoryRows':
      return (
        <CategoryRows
          store={store}
          rows={home.categoryRows}
          skin={skin}
          tone={tone}
        />
      )
    case 'catalog':
      return (
        <ProductRow
          store={store}
          title="All Products"
          viewAllTo={storeShopUrl(store.slug)}
          products={home.catalog}
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
  dense = false,
  className = '',
  children,
}: {
  id?: string
  tone?: BandTone
  skin: Skin
  /** Strip height instead of section height — one row of controls, no heading. */
  dense?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 border-b ${skin.border} ${tone === 'alt' ? skin.surface : ''} ${className}`}
    >
      <div
        className={`mx-auto w-full max-w-[1920px] px-4 sm:px-6 lg:px-10 ${dense ? 'py-3.5 sm:py-4' : 'py-8 sm:py-10'}`}
      >
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
 * Shop by Category — the marketplace homepage's single-row strip, per store:
 * a small inline label followed by one pill per top-level category, wrapping
 * only when a store has more categories than fit the line.
 *
 * It is a **strip, not a section**: no display heading, no tiles, `dense` band
 * padding. Earlier revisions grew this into a grid of tiles carrying counts
 * and subcategory links, which turned a wayfinding row into the tallest thing
 * on the homepage and left a lone tile stranded in six columns whenever a shop
 * had one category. Drilling into shelves belongs on the category page, which
 * already lists them.
 *
 * The pill fill is picked against the band tone so it never sits on its own
 * color: the raised tone gets page-canvas pills, the canvas tone gets raised
 * ones.
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
    <Band id="shop-by-category" tone={tone} skin={skin} dense>
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className={`text-xs font-semibold uppercase tracking-widest ${skin.muted}`}
        >
          Shop by category
        </span>
        {categories.map((category) => (
          <Link
            key={category.id}
            to={storeCategoryUrl(store.slug, category.slug)}
            className={`shrink-0 rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors hover:border-brand hover:text-brand ${skin.border} ${skin.text} ${tone === 'alt' ? 'bg-bg' : skin.surface}`}
          >
            {category.name}
          </Link>
        ))}
      </div>
    </Band>
  )
}

/**
 * One product row headed by `title` — capped at a single row of cards, with
 * "View all" into `viewAllTo` when the row holds more than it shows. The
 * target is always the narrowest listing that still holds everything in the
 * row: the Shop page scoped to a section, or a category's own page. Renders
 * nothing when empty.
 */
function ProductRow({
  store,
  title,
  viewAllTo,
  products,
  skin,
  tone,
}: {
  store: PublicStore
  title: string
  viewAllTo: string
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
            ? { label: 'View all', to: viewAllTo }
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

/**
 * Shop by Category, as products rather than links — one row per category,
 * each "View all" landing on that category's own page.
 *
 * This is what a shop with no merchandising flags ticked has on its homepage,
 * so it has to look deliberate rather than like a fallback: the rows are
 * ordinary product rows, and they keep the page's alternating band rhythm by
 * continuing it from the tone this section was handed.
 */
function CategoryRows({
  store,
  rows,
  skin,
  tone,
}: {
  store: PublicStore
  rows: PublicCategoryRow[]
  skin: Skin
  tone: BandTone
}) {
  const flip = (t: BandTone): BandTone => (t === 'alt' ? 'base' : 'alt')
  return (
    <>
      {rows.map((row, index) => (
        <ProductRow
          key={row.id}
          store={store}
          title={row.name}
          viewAllTo={storeCategoryUrl(store.slug, row.slug)}
          products={row.products}
          skin={skin}
          tone={index % 2 === 0 ? tone : flip(tone)}
        />
      ))}
    </>
  )
}

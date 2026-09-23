import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  publicStoreApi,
  storeCategoryUrl,
  storeHomeUrl,
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
import {
  EDGE_SCROLLER,
  SCROLL_UNDER_HEADER,
  STORE_CONTAINER,
} from '../../features/publicStore/storeLayout'
import { useSeo } from '../../../shared/seo'
import { storeJsonLd } from '../../features/publicStore/structuredData'
import { PRODUCT_GRID, ProductCard } from '../../features/publicStore/ProductCard'
import {
  EmptyCatalog,
  GridSkeleton,
  SectionHeading,
} from '../../features/publicStore/ListingControls'
import { ChevronLeftIcon, ChevronRightIcon } from '../../layout/icons'
import type { Skin } from '../../features/publicStore/storeTheme'
import { BannerCarousel } from '../../features/banners/BannerCarousel'
import {
  builderSectionProps,
  useBuilderRefresh,
} from '../../features/publicStore/builderBridge'
import {
  defaultLayout,
  HERO_DEFAULT_CTA,
  sectionCopy,
} from '../../features/publicStore/sectionCopy'

/**
 * Products shown in a capped single-row section. Only as many as fill the
 * current breakpoint's row are visible — see `ROW_VISIBILITY`.
 */
const ROW_SIZE = 5

/**
 * Per-index visibility for a capped row, so **every** breakpoint renders one
 * exactly-full row and never strands an orphan card on a second line:
 * 2 → 3 (md) → 4 (lg) → 5 (xl) columns, matching `PRODUCT_GRID`.
 */
const ROW_VISIBILITY = [
  '',
  '',
  'hidden md:list-item',
  'hidden lg:list-item',
  'hidden xl:list-item',
]

/**
 * Below this a rail would not scroll at the widest breakpoint (5 across), so
 * it would just be a short row pretending to be a carousel — those sections
 * fall back to the capped grid row instead.
 */
const RAIL_MIN = 6

/**
 * A spotlight is a lead card plus exactly six supporting ones; with fewer
 * products than that the grid behind the lead would go ragged, so the section
 * falls back to the capped row.
 */
const SPOTLIGHT_MIN = 7

/** Supporting cards beside a spotlight's lead — 2 × 3 or 3 × 2, always full. */
const SPOTLIGHT_SUPPORT = 6

/** Covers used by the hero art. */
const HERO_ART_SIZE = 3

/** Products shown beside a category shelf panel — one full row at every size. */
const SHELF_ROW_SIZE = 3

/**
 * How a shelf band splits into panel + products on `lg`, by how many products
 * the shelf actually has. **The panel absorbs whatever the shelf does not
 * need**, so a category holding two products fills its band instead of leaving
 * a card-shaped hole where a third would go — and because the product region's
 * own column count shrinks with it, the cards stay exactly the width they are
 * everywhere else on the page. Below `lg` the region is full width and simply
 * runs 2 → 3 columns like any other grid.
 *
 * Literal class strings: Tailwind scans source text, so an interpolated
 * `lg:col-span-${n}` would never be generated.
 */
const SHELF_SPLIT = {
  2: { panel: 'lg:col-span-2', products: 'lg:col-span-2 lg:grid-cols-2' },
  3: { panel: 'lg:col-span-1', products: 'lg:col-span-3 lg:grid-cols-3' },
} as const

/** Below this a shelf renders as a plain titled row instead — see below. */
const SHELF_PANEL_MIN = 2

type HomeSectionKey = PublicStoreHome['sections'][number]['key']
type HomeSectionEntry = PublicStoreHome['sections'][number]

/**
 * `/store/{storeSlug}` — the storefront homepage.
 *
 * It *introduces* the store rather than dumping a filtered product grid:
 * hero, Shop by Category, then the owner's merchandising sections. Browsing
 * happens on the category pages; discovery happens here and through search.
 *
 * **Layout** — sections render as full-bleed **bands** (alternating surface
 * tone + a bottom divider), each putting the shared `STORE_CONTAINER` back
 * inside: full-width backgrounds, centered max-width content. Separation comes
 * from the background change, not from large empty gaps, and the band lives
 * inside each section so a hidden one leaves nothing behind.
 *
 * **Every section looks different on purpose.** A homepage that repeats one
 * grid six times reads as a dashboard listing inventory, so each section gets
 * the composition that matches what it is for:
 *
 * | Section                | Composition                                      |
 * | ---------------------- | ------------------------------------------------ |
 * | Banners                | the owner's carousel                             |
 * | Hero                   | store identity + pitch, with real product art     |
 * | Shop by Category       | one scrolling row of chips — wayfinding, not a section |
 * | Featured Products      | spotlight: one large lead card + six supporting   |
 * | New Arrivals / Best Sellers | horizontal rails — more stock than a row holds |
 * | Category Highlights    | a shelf panel + that shelf's newest, one per category |
 * | All Products           | the plain capped grid row                        |
 *
 * Each composition **falls back to the capped row when the section is too
 * small for it** (`RAIL_MIN`, `SPOTLIGHT_MIN`), because a rail that cannot
 * scroll and a spotlight with a hole in its grid both look broken. A store
 * with three products therefore gets tidy short rows, not empty scaffolding.
 *
 * Those are the **defaults**, not the only shapes. The owner picks another
 * composition for a section in the Store Builder (Featured can be a rail, New
 * Arrivals a plain row, the hero art-free, the categories a block of cards)
 * and renames any heading, all through the optional `settings` each section
 * carries — see `sectionCopy`. A section with none, which is every section of
 * every store that has never been customised, renders exactly as it always
 * has.
 *
 * The three curated rows are strictly flag-driven — one with nothing flagged
 * renders nothing (there is deliberately no fallback). What keeps an uncurated
 * shop from being a hero over empty space is the two rows below them, which
 * need no flags: **Category Highlights** (one shelf per category, "View all"
 * into that category's own page) and **All Products** (newest, "View all" into
 * Shop). Both are ordinary sections the owner can reorder or hide.
 */
/**
 * The storefront's front door, and the URL a seller actually shares — so it
 * is the one page that has to win a search for the shop's own name.
 *
 * Its snippet is the seller's own About text when they wrote one; otherwise a
 * line composed from what every store has (its name and its shelves), because
 * "UnieMax" repeated under every result teaches Google nothing about which
 * shop is which.
 *
 * The `Store` / `Organization` block is what carries the address, phone, map
 * pin and social profiles the owner already filled into Footer management
 * into Google's hands — the only part of this that can earn local results.
 */
function useStoreHomeSeo(store: PublicStore) {
  const shelves = store.categories
    .slice(0, 6)
    .map((category) => category.name)
    .join(', ')

  useSeo({
    title: [store.name],
    description:
      store.footer.info.about ||
      (shelves
        ? `Shop ${shelves} at ${store.name} on UnieMax. Order online with delivery or store pickup.`
        : `Shop ${store.name} on UnieMax — order online with delivery or store pickup.`),
    canonical: storeHomeUrl(store.slug),
    image: store.logoUrl,
    // An unpublished store is a private draft its owner is previewing. It
    // resolves for them and 404s for everyone else, so it must never be a
    // result — and it is the one storefront page a signed-in owner reaches
    // most often, so the guard belongs here as much as on the product page.
    robots: store.isPublished ? null : 'noindex, follow',
    jsonLd: store.isPublished ? storeJsonLd(store) : null,
  })
}

export function StoreHomePage() {
  const { store, skin } = usePublicStore()
  useStoreHomeSeo(store)
  const [home, setHome] = useState<PublicStoreHome | null | undefined>(undefined)
  // A save in the Store Builder repaints the preview in place — see
  // `builderBridge`. Outside the builder this never fires.
  const [reload, setReload] = useState(0)
  useBuilderRefresh(() => setReload((n) => n + 1))

  useEffect(() => {
    let cancelled = false
    // Keep the current page on screen while a builder refetch is in flight:
    // blanking to a skeleton every time a switch is flipped makes the preview
    // feel like it is reloading rather than updating.
    if (reload === 0) setHome(undefined)
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
  }, [store.slug, reload])

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
          section={section}
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

/** Real product covers for the hero art — deduped, newest rows first. */
function heroCovers(home: PublicStoreHome): string[] {
  // `catalog` last: it is the fallback that gives an uncurated shop art at
  // all, but a curated row's covers are the ones the owner chose.
  const urls = [
    ...home.newArrivals,
    ...home.featured,
    ...home.bestSellers,
    ...home.catalog,
  ]
    .map((product) => product.image?.url)
    .filter((url): url is string => Boolean(url))
  return [...new Set(urls)].slice(0, HERO_ART_SIZE)
}

/**
 * Renders one homepage section, in the shape the owner asked for.
 *
 * The owner's choice is applied HERE, in one place, rather than inside each
 * composition: every section already took `title` / `eyebrow` / `layout` as
 * props, so honouring the Store Builder is a matter of which value goes in,
 * not of new rendering paths. A section the seller has never touched passes
 * the same literals it always did.
 */
function HomeSection({
  section,
  store,
  home,
  skin,
  tone,
  covers,
  categoriesAnchor,
}: {
  section: HomeSectionEntry
  store: PublicStore
  home: PublicStoreHome
  skin: Skin
  tone: BandTone
  covers: string[]
  categoriesAnchor: boolean
}) {
  // The owner's choice, or the section's own default — never a literal
  // repeated here, which is how a builder button and a storefront drift apart.
  const copy = sectionCopy(section)
  const layout = copy.layout ?? defaultLayout(section.key)
  // Hit-target for click-to-edit; `undefined` on the public storefront.
  const builder = builderSectionProps(section.key)

  switch (section.key) {
    case 'banners':
      return (
        <BannerCarousel
          banners={home.banners}
          id="shop-banners"
          className={`border-b ${skin.border} ${tone === 'alt' ? skin.surface : ''}`}
          // Artwork stays inside the same column as everything else: left
          // edge-to-edge it grew to 800px tall on a 2560px monitor.
          containerClassName={`${STORE_CONTAINER} py-6 sm:py-8`}
          frameClassName={`overflow-hidden rounded-lg border ${skin.border}`}
          wellClassName={skin.well}
          {...builder}
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
          heading={section.settings?.title ?? null}
          tagline={section.settings?.subtitle ?? null}
          ctaLabel={copy.ctaLabel}
          layout={layout === 'minimal' ? 'minimal' : 'split'}
          builder={builder}
        />
      )
    case 'categories':
      return (
        <CategoryStrip
          store={store}
          categories={home.featuredCategories}
          title={copy.title}
          layout={layout === 'tiles' ? 'tiles' : 'chips'}
          skin={skin}
          tone={tone}
          builder={builder}
        />
      )
    case 'featured':
      return (
        <ProductSection
          store={store}
          title={copy.title}
          eyebrow={copy.subtitle}
          viewAllTo={storeShopUrl(store.slug, { section: 'featured' })}
          products={home.featured}
          layout={productLayout(layout)}
          skin={skin}
          tone={tone}
          builder={builder}
        />
      )
    case 'newArrivals':
    case 'bestSellers':
      return (
        <ProductSection
          store={store}
          title={copy.title}
          eyebrow={copy.subtitle}
          viewAllTo={storeShopUrl(store.slug, { section: section.key })}
          products={home[section.key]}
          layout={productLayout(layout)}
          skin={skin}
          tone={tone}
          builder={builder}
        />
      )
    case 'categoryRows':
      return (
        <CategoryShelves
          store={store}
          rows={home.categoryRows}
          skin={skin}
          tone={tone}
          builder={builder}
        />
      )
    case 'catalog':
      return (
        <ProductSection
          store={store}
          title={copy.title}
          eyebrow={copy.subtitle}
          viewAllTo={storeShopUrl(store.slug)}
          products={home.catalog}
          layout={productLayout(layout)}
          skin={skin}
          tone={tone}
          builder={builder}
        />
      )
  }
}

/**
 * A resolved layout narrowed to the three compositions this component draws.
 * Anything else is impossible — `resolveSectionSettings` drops unknown values
 * and `defaultLayout` reads the same list the API validates against — so the
 * fallback is a type guard, not a behaviour.
 */
function productLayout(layout: string | null): SectionLayout {
  return layout === 'grid' || layout === 'rail' || layout === 'spotlight'
    ? layout
    : 'grid'
}

type BandTone = 'base' | 'alt'

/**
 * Full-bleed section band: the page canvas or the raised surface tone plus a
 * bottom divider, with the shared content column inside. The band is part of
 * the section, so a section that renders nothing leaves no empty strip.
 */
function Band({
  id,
  tone = 'base',
  skin,
  pad = 'normal',
  className = '',
  builder,
  children,
}: {
  id?: string
  tone?: BandTone
  skin: Skin
  /** `dense` = one row of controls, no heading. `hero` = the opening pitch. */
  pad?: 'dense' | 'normal' | 'hero'
  className?: string
  /** Store Builder hit-target; absent on the public storefront. */
  builder?: Record<string, string> | undefined
  children: React.ReactNode
}) {
  const padding =
    pad === 'dense'
      ? 'py-3.5 sm:py-4'
      : pad === 'hero'
        ? 'py-10 sm:py-14 lg:py-16'
        : 'py-8 sm:py-10'
  return (
    <section
      id={id}
      className={`${SCROLL_UNDER_HEADER} border-b ${skin.border} ${tone === 'alt' ? skin.surface : ''} ${className}`}
      {...builder}
    >
      <div className={`${STORE_CONTAINER} ${padding}`}>{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

/**
 * Hero band — the store's own introduction.
 *
 * **Two shapes, and the empty one is deliberate.** With real product covers to
 * show it is a two-column composition: the pitch on the left, an editorial
 * mosaic of the shop's actual stock on the right (a triptych below `lg`, where
 * a column would be a stack of dead space). With fewer than two covers there
 * is no right-hand column at all — the copy centres instead of leaving half
 * the band empty, which is what a brand-new shop used to look like.
 *
 * The description is the owner's own "About" text from their Footer settings
 * when they wrote one, and a generated summary of the catalog when they did
 * not. The art is `alt=""` — it is decoration, and every product in it is
 * reachable from the rows below.
 */
function Hero({
  store,
  skin,
  tone = 'alt',
  covers,
  categoriesAnchor,
  heading = null,
  tagline = null,
  ctaLabel = null,
  layout = 'split',
  builder,
}: {
  store: PublicStore
  skin: Skin
  tone?: BandTone
  covers: string[]
  categoriesAnchor: boolean
  /** Owner's headline. Null = the store's own name. */
  heading?: string | null
  /** Owner's intro line. Null = their About text, then a catalog summary. */
  tagline?: string | null
  /** Owner's button label. Null = "Start Shopping". */
  ctaLabel?: string | null
  /**
   * `split` shows the product mosaic when there is stock to show it with;
   * `minimal` is the centred, art-free pitch — the shape a shop with strong
   * words and weak photography should be able to choose deliberately, rather
   * than only getting it by having too few covers.
   */
  layout?: 'split' | 'minimal'
  builder?: Record<string, string> | undefined
}) {
  const productCount = store.categories.reduce(
    (sum, c) => sum + c.productCount,
    0,
  )
  const summary = `${productCount} ${productCount === 1 ? 'product' : 'products'} across ${store.categories.length} ${store.categories.length === 1 ? 'category' : 'categories'}`
  const about = store.footer.info.about?.trim()
  const art = covers.slice(0, HERO_ART_SIZE)
  const hasArt = layout === 'split' && art.length >= 2
  const intro = tagline ?? about

  return (
    <Band
      tone={tone}
      skin={skin}
      pad="hero"
      className="relative overflow-hidden"
      builder={builder}
    >
      {/* Brand wash — keeps the hero from reading as an empty slab. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          background:
            'radial-gradient(120% 120% at 85% 15%, var(--brand) 0%, transparent 60%)',
        }}
      />
      <div
        className={`relative ${hasArt ? 'grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.78fr)] lg:gap-14' : ''}`}
      >
        {/* Display copy is select-none: a stray drag otherwise highlights the
            headline, which reads as glitchy. */}
        <div
          className={`select-none ${hasArt ? '' : 'mx-auto max-w-2xl text-center'}`}
        >
          <div
            className={`flex items-center gap-3 ${hasArt ? '' : 'justify-center'}`}
          >
            {store.logoUrl && (
              <img
                src={store.logoUrl}
                alt=""
                className={`h-11 w-11 shrink-0 rounded-md border object-cover ${skin.border}`}
              />
            )}
            {/* Wide-tracked eyebrow (prototype: "UnieMax · SPORTS FACTORY"). */}
            <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-brand">
              Welcome to
            </span>
          </div>

          {/* Prototype hero scale: heading face at 700, near-flush leading.
              `break-words` so a long single-word shop name wraps instead of
              widening the band past the viewport. */}
          <h1
            className={`mt-3 break-words font-heading text-3xl font-bold leading-[1.05] sm:text-4xl lg:text-5xl ${skin.text}`}
          >
            {heading ?? store.name}
          </h1>

          <p
            className={`mt-3 max-w-xl text-sm sm:text-base ${hasArt ? '' : 'mx-auto'} ${skin.muted}`}
          >
            {intro ?? `Browse our full range — ${summary}, delivered to your door.`}
          </p>
          {intro && <p className={`mt-1.5 text-sm ${skin.muted}`}>{summary}</p>}

          <div
            className={`mt-6 flex flex-wrap items-center gap-3 ${hasArt ? '' : 'justify-center'}`}
          >
            <Link
              to={storeShopUrl(store.slug)}
              className={`inline-flex h-11 items-center gap-1.5 rounded-md px-6 text-sm font-bold transition ${skin.cta}`}
            >
              {ctaLabel ?? HERO_DEFAULT_CTA}
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
            {/* Only offered when the categories band is actually on the page. */}
            {categoriesAnchor && (
              <a
                href="#shop-by-category"
                className={`inline-flex h-11 items-center rounded-md border px-6 text-sm font-semibold transition-colors hover:border-brand ${skin.border} ${skin.text}`}
              >
                Shop by Category
              </a>
            )}
          </div>
        </div>

        {hasArt && <HeroArt covers={art} skin={skin} />}
      </div>
    </Band>
  )
}

/**
 * The shop's own stock as hero art. One grid, two shapes: a triptych of
 * squares below `lg` (a strip of life under the copy, costing almost no
 * height) and a lead-plus-stack mosaic beside it from `lg`, where the lead
 * takes its height from the two squares rather than an aspect ratio, so the
 * two columns always end level.
 */
function HeroArt({ covers, skin }: { covers: string[]; skin: Skin }) {
  const trio = covers.length >= 3
  return (
    <div
      className={`grid select-none gap-3 lg:gap-4 ${trio ? 'grid-cols-3 lg:grid-cols-2' : 'grid-cols-2'}`}
    >
      {covers.map((url, index) => (
        <img
          key={url}
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          className={`w-full rounded-lg border object-cover shadow-floating ${skin.border} ${
            trio && index === 0
              ? 'aspect-square lg:aspect-auto lg:row-span-2 lg:h-full'
              : 'aspect-square'
          }`}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shop by Category
// ---------------------------------------------------------------------------

/**
 * Shop by Category — **one scrolling row of chips, never a wrapping block**.
 *
 * It is wayfinding, not merchandising: a store with twenty categories must not
 * turn the tallest thing on its homepage into a list of links, and a store
 * with one must not strand a lone tile in a six-column grid. A single row that
 * scrolls sideways is the only shape that holds for both, and on a phone it is
 * also the natural gesture. Drilling into shelves belongs on the category
 * page, which already lists them.
 *
 * The chip fill is picked against the band tone so it never sits on its own
 * color: the raised tone gets page-canvas chips, the canvas tone gets raised
 * ones.
 */
function CategoryStrip({
  store,
  categories,
  title,
  layout,
  skin,
  tone,
  builder,
}: {
  store: PublicStore
  categories: PublicCategory[]
  title: string
  /**
   * `chips` is the scrolling row above — wayfinding that costs one line of
   * height whatever the count. `tiles` gives the shelves real estate, for a
   * shop whose categories ARE the pitch (a grocer, a parts supplier), and is
   * capped so twenty of them cannot turn the homepage into a directory.
   */
  layout: 'chips' | 'tiles'
  skin: Skin
  tone: BandTone
  builder?: Record<string, string> | undefined
}) {
  if (categories.length === 0) return null
  return (
    <Band
      id="shop-by-category"
      tone={tone}
      skin={skin}
      builder={builder}
    >
      <SectionHeading
        title={title}
        size="sm"
        action={{ label: 'Browse all', to: storeShopUrl(store.slug) }}
        skin={skin}
      />
      {layout === 'tiles' ? (
        <CategoryTiles store={store} categories={categories} skin={skin} />
      ) : (
        <ul className={`mt-4 flex gap-2.5 pb-1 ${EDGE_SCROLLER}`}>
          {categories.map((category) => (
            <li key={category.id} className="shrink-0">
              <Link
                to={storeCategoryUrl(store.slug, category.slug)}
                className={`flex h-10 items-center gap-2 whitespace-nowrap rounded-pill border px-4 text-sm font-semibold transition-colors hover:border-brand hover:text-brand ${skin.border} ${skin.text} ${tone === 'alt' ? 'bg-bg' : skin.surface}`}
              >
                {category.name}
                <span className={`text-[11px] font-bold ${skin.muted}`}>
                  {category.productCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Band>
  )
}

/** How many tiles a band shows before the rest live on the Shop page. */
const CATEGORY_TILE_CAP = 12

/**
 * Categories as cards — name, count and a monogram cut from the owner's brand.
 *
 * There is no category artwork in the data model, so a tile does NOT pretend
 * to have a photo: it is typographic, which is honest and also what keeps the
 * row looking identical whether a seller has uploaded anything or not. Two
 * across on a phone and up to six on a wide monitor, so a tile never stretches
 * into a billboard on a 2560px screen.
 */
function CategoryTiles({
  store,
  categories,
  skin,
}: {
  store: PublicStore
  categories: PublicCategory[]
  skin: Skin
}) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
      {categories.slice(0, CATEGORY_TILE_CAP).map((category) => (
        <li key={category.id}>
          <Link
            to={storeCategoryUrl(store.slug, category.slug)}
            className={`group flex h-full flex-col justify-between gap-4 rounded-lg border p-4 metal-lift ${skin.border} ${skin.surface}`}
          >
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-soft font-heading text-lg font-bold text-brand"
            >
              {category.name.trim().charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span
                className={`block truncate text-sm font-semibold ${skin.text}`}
              >
                {category.name}
              </span>
              <span className={`mt-0.5 block text-xs ${skin.muted}`}>
                {category.productCount}{' '}
                {category.productCount === 1 ? 'product' : 'products'}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Product sections — one component, three compositions
// ---------------------------------------------------------------------------

type SectionLayout = 'grid' | 'rail' | 'spotlight'

/**
 * A titled product section in whichever composition suits it, **degrading to
 * the capped grid row whenever the section is too small for the one asked
 * for**. That fallback is the whole reason the three live in one component:
 * the choice is made once, from the product count, rather than at each call
 * site guessing what a store will have in stock.
 */
function ProductSection({
  store,
  title,
  eyebrow,
  viewAllTo,
  products,
  layout,
  skin,
  tone,
  builder,
}: {
  store: PublicStore
  title: string
  eyebrow?: string
  viewAllTo: string
  products: PublicProduct[]
  layout: SectionLayout
  skin: Skin
  tone: BandTone
  builder?: Record<string, string> | undefined
}) {
  if (products.length === 0) return null

  const effective: SectionLayout =
    layout === 'spotlight' && products.length >= SPOTLIGHT_MIN
      ? 'spotlight'
      : layout === 'rail' && products.length >= RAIL_MIN
        ? 'rail'
        : 'grid'

  if (effective === 'rail') {
    return (
      <ProductRail
        store={store}
        title={title}
        eyebrow={eyebrow}
        viewAllTo={viewAllTo}
        products={products}
        skin={skin}
        tone={tone}
        builder={builder}
      />
    )
  }

  return (
    <Band tone={tone} skin={skin} builder={builder}>
      <SectionHeading
        title={title}
        eyebrow={eyebrow}
        // The narrowest breakpoint only shows two cards, so anything beyond
        // that can be hidden — offer the full section whenever it might be.
        action={
          products.length > 2 ? { label: 'View all', to: viewAllTo } : undefined
        }
        skin={skin}
      />
      {effective === 'spotlight' ? (
        <Spotlight store={store} products={products} skin={skin} />
      ) : (
        <ul className={`mt-5 ${PRODUCT_GRID}`}>
          {products.slice(0, ROW_SIZE).map((product, index) => (
            <ProductCard
              key={product.id}
              store={store}
              product={product}
              skin={skin}
              className={ROW_VISIBILITY[index] ?? ''}
            />
          ))}
        </ul>
      )}
    </Band>
  )
}

/**
 * Spotlight — one large lead card beside a block of six supporting ones.
 *
 * The section that means "the shop chose these" should not look like the
 * section that means "everything we stock", so Featured Products gets the
 * editorial shape: the lead fills a third of the width on `lg` with a wider
 * cover, a bigger name and its description, and the other six fill the rest.
 * Six is exact at every breakpoint it appears in (2 × 3 on a phone, 3 × 2 from
 * `sm`), so there is never a half-empty last line under the lead.
 */
function Spotlight({
  store,
  products,
  skin,
}: {
  store: PublicStore
  products: PublicProduct[]
  skin: Skin
}) {
  const [lead, ...rest] = products
  return (
    <ul className="mt-5 grid gap-3 sm:gap-4 lg:grid-cols-3">
      <ProductCard store={store} product={lead} skin={skin} size="lg" />
      {/* A list item holding the supporting grid, so the whole section stays
          one well-formed list rather than two side by side. */}
      <li className="lg:col-span-2">
        <ul className="grid h-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {rest.slice(0, SPOTLIGHT_SUPPORT).map((product) => (
            <ProductCard
              key={product.id}
              store={store}
              product={product}
              skin={skin}
            />
          ))}
        </ul>
      </li>
    </ul>
  )
}

/**
 * A horizontal rail — the shape for a section with more stock than a row
 * holds. It shows **everything the section returned** (the API sends up to a
 * dozen) rather than the five a capped row fits, so New Arrivals and Best
 * Sellers are browsable without leaving the homepage.
 *
 * Card widths are percentages of the scroller, so the last card is always
 * part-cut at the right edge — which is what tells a thumb there is more.
 * Arrows appear from `lg`, where there is no swipe: they scroll by most of a
 * screenful and grey out at each end rather than disappearing, so the control
 * row does not reflow as you scroll.
 */
function ProductRail({
  store,
  title,
  eyebrow,
  viewAllTo,
  products,
  skin,
  tone,
  builder,
}: {
  store: PublicStore
  title: string
  eyebrow?: string
  viewAllTo: string
  products: PublicProduct[]
  skin: Skin
  tone: BandTone
  builder?: Record<string, string> | undefined
}) {
  const scroller = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ atStart: true, atEnd: false })

  const sync = useCallback(() => {
    const el = scroller.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({
      atStart: el.scrollLeft <= 4,
      // A rail that cannot scroll at this width has both ends at once, which
      // correctly greys out both arrows.
      atEnd: el.scrollLeft >= max - 4,
    })
  }, [])

  useEffect(() => {
    sync()
  }, [sync, products.length])

  const nudge = (direction: 1 | -1) => {
    const el = scroller.current
    if (!el) return
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <Band tone={tone} skin={skin} builder={builder}>
      <SectionHeading
        title={title}
        eyebrow={eyebrow}
        action={{ label: 'View all', to: viewAllTo }}
        aside={
          <span className="ml-1 hidden items-center gap-1.5 lg:flex">
            <RailArrow
              direction={-1}
              disabled={edges.atStart}
              onClick={() => nudge(-1)}
              skin={skin}
            />
            <RailArrow
              direction={1}
              disabled={edges.atEnd}
              onClick={() => nudge(1)}
              skin={skin}
            />
          </span>
        }
        skin={skin}
      />
      <ul
        ref={scroller}
        onScroll={sync}
        className={`mt-5 flex snap-x snap-proximity gap-3 pb-1 sm:gap-4 ${EDGE_SCROLLER}`}
      >
        {products.map((product) => (
          <ProductCard
            key={product.id}
            store={store}
            product={product}
            skin={skin}
            className="w-[43%] shrink-0 snap-start sm:w-[30%] lg:w-[22%] xl:w-[18%]"
          />
        ))}
      </ul>
    </Band>
  )
}

function RailArrow({
  direction,
  disabled,
  onClick,
  skin,
}: {
  direction: 1 | -1
  disabled: boolean
  onClick: () => void
  skin: Skin
}) {
  const Icon = direction === -1 ? ChevronLeftIcon : ChevronRightIcon
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === -1 ? 'Scroll left' : 'Scroll right'}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:border-brand hover:text-brand disabled:opacity-35 disabled:hover:border-line disabled:hover:text-current ${skin.border} ${skin.chip} ${skin.text}`}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Category Highlights
// ---------------------------------------------------------------------------

/**
 * Shop by Category, as products rather than links — one band per category,
 * each a **shelf panel beside that shelf's newest stock**.
 *
 * This is what a shop with no merchandising flags ticked has on its homepage,
 * so it has to look deliberate rather than like a fallback: the panel names
 * the collection, counts it and links into it, which is a different job from
 * the flat rows above it and reads as a collection rather than another grid.
 * The panel is a compact bar on a phone (name and count on one line, the link
 * on the other side) and a full-height card from `lg`.
 *
 * Exactly one row of products either way — three from `sm`, two below — so no
 * band ever ends on a half-empty line, whether the shelf holds three products
 * or three hundred.
 */
function CategoryShelves({
  store,
  rows,
  skin,
  tone,
  builder,
}: {
  store: PublicStore
  rows: PublicCategoryRow[]
  skin: Skin
  tone: BandTone
  builder?: Record<string, string> | undefined
}) {
  const flip = (t: BandTone): BandTone => (t === 'alt' ? 'base' : 'alt')
  return (
    <>
      {rows.map((row, index) => (
        <CategoryShelf
          key={row.id}
          store={store}
          row={row}
          skin={skin}
          tone={index % 2 === 0 ? tone : flip(tone)}
          // Every shelf carries the same key: the section is ONE thing to the
          // seller, however many bands it happens to paint, so clicking any of
          // them opens the same editor.
          builder={builder}
        />
      ))}
    </>
  )
}

function CategoryShelf({
  store,
  row,
  skin,
  tone,
  builder,
}: {
  store: PublicStore
  row: PublicCategoryRow
  skin: Skin
  tone: BandTone
  builder?: Record<string, string> | undefined
}) {
  if (row.products.length === 0) return null
  const to = storeCategoryUrl(store.slug, row.slug)
  const count = categoryProductCount(store.categories, row.id)
  const shown = row.products.slice(0, SHELF_ROW_SIZE)

  // A panel announcing a "collection" of one is theatre, and a full-height
  // card beside a single product is mostly void — so the smallest shelves
  // degrade to a plain titled row, the same way the rails and spotlight do.
  if (shown.length < SHELF_PANEL_MIN) {
    return (
      <Band tone={tone} skin={skin} builder={builder}>
        <SectionHeading
          title={row.name}
          action={{ label: 'View all', to }}
          skin={skin}
        />
        <ul className={`mt-5 ${PRODUCT_GRID}`}>
          {shown.map((product) => (
            <ProductCard
              key={product.id}
              store={store}
              product={product}
              skin={skin}
            />
          ))}
        </ul>
      </Band>
    )
  }

  const split = SHELF_SPLIT[shown.length as 2 | 3]

  return (
    <Band tone={tone} skin={skin} builder={builder}>
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-4">
        <Link
          to={to}
          className={`group flex items-center justify-between gap-4 overflow-hidden rounded-lg border p-4 metal-lift sm:p-5 lg:flex-col lg:items-start lg:justify-between ${split.panel} ${skin.border} ${skin.surface}`}
        >
          <span className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand">
              Collection
            </span>
            <span
              className={`mt-1.5 block truncate font-heading text-xl font-semibold sm:text-2xl lg:whitespace-normal ${skin.text}`}
            >
              {row.name}
            </span>
            {count > 0 && (
              <span className={`mt-1 block text-sm ${skin.muted}`}>
                {count} {count === 1 ? 'product' : 'products'}
              </span>
            )}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-brand lg:mt-6">
            Shop all
            <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <ul
          className={`grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 ${split.products}`}
        >
          {shown.map((product, index) => (
            <ProductCard
              key={product.id}
              store={store}
              product={product}
              skin={skin}
              // A phone fits two; the third joins from `sm`, where the row
              // widens to three.
              className={index === 2 ? 'hidden sm:list-item' : ''}
            />
          ))}
        </ul>
      </div>
    </Band>
  )
}

/**
 * That shelf's product count, from the shell's category tree — the homepage
 * payload's rows carry products but no total. Zero when the category is not
 * in the tree (it is pruned to categories with something shoppable), which
 * simply omits the line.
 */
function categoryProductCount(
  categories: PublicCategory[],
  id: string,
): number {
  for (const category of categories) {
    if (category.id === id) return category.productCount
    const nested = categoryProductCount(category.subcategories, id)
    if (nested > 0) return nested
  }
  return 0
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  publicStoreApi,
  storeCategoryUrl,
  storeHomeUrl,
  storeProductUrl,
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
import {
  discountPercent,
  FillImage,
  NoProductImage,
  PRODUCT_GRID,
  PriceLabel,
  ProductCard,
} from '../../features/publicStore/ProductCard'
import {
  canQuickAdd,
  PurchaseActions,
  StockBadge,
} from '../../features/publicStore/CartControls'
import { ContactActions, shopContact } from '../../features/publicStore/ShopContact'
import {
  browsableCategories,
  categoryPicture,
  displayName,
  shopProductCount,
  shopSize,
  trustFacts,
  type ShopSize,
  type TrustFact,
} from '../../features/publicStore/shopShape'
import {
  EmptyCatalog,
  GridSkeleton,
  SectionHeading,
} from '../../features/publicStore/ListingControls'
import {
  CardIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  RupeeIcon,
  StoreIcon,
  TruckIcon,
} from '../../layout/icons'
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
import { MediaImg } from '../../../shared/media/MediaImg'

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
 * **The page adapts to the size of the shop** (`shopShape.ts`), because most
 * sellers list a handful of products and a page built for a big catalogue
 * shows those few products two or three times:
 *
 * | Shop          | Homepage                                                   |
 * | ------------- | ---------------------------------------------------------- |
 * | one product   | banners + hero, then that product as a big showcase card    |
 * | ≤ 12 products | every product ONCE in "All Products", the owner's Featured / Best / New picks first (no curated rows or per-category shelves, which would repeat them) |
 * | bigger        | everything below; "All Products" skips what earlier rows showed |
 *
 * Category pickers only appear when there are two or more categories to pick
 * between, after single-branch chains are walked down (`browsableCategories`).
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
    image: store.shareImageUrl,
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

  const size = shopSize(store)
  const facts = trustFacts(store)
  const heroCta = HERO_CTA[size]

  if (home === undefined) {
    return (
      <>
        <Hero
          store={store}
          skin={skin}
          covers={[]}
          categoriesAnchor={false}
          facts={facts}
          cta={heroCta}
        />
        <StorePageShell>
          <GridSkeleton skin={skin} />
        </StorePageShell>
      </>
    )
  }

  if (home === null) {
    return (
      <>
        <Hero
          store={store}
          skin={skin}
          covers={[]}
          categoriesAnchor={false}
          facts={facts}
          cta={heroCta}
        />
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
  const shaped = shapeHome(home, size)
  const visible = shaped.home.sections
    .filter((section) => section.enabled)
    .filter((section) => hasContent(section.key, shaped.home))
    // A one-product shop shows its identity and then the product itself.
    .filter(
      (section) =>
        shaped.showcase === null || section.key === 'banners' || section.key === 'hero',
    )

  const showsCategories = visible.some((section) => section.key === 'categories')
  // Art beside the hero only for a big shop: a small one shows every product
  // a few centimetres further down, so the art would only repeat them.
  const covers = size === 'full' ? heroCovers(home) : []
  const tones = bandTones(visible, shaped.home)
  const flip = (tone: BandTone | undefined): BandTone => (tone === 'alt' ? 'base' : 'alt')
  const showcaseTone = flip(tones[tones.length - 1])
  const contactTone = shaped.showcase ? flip(showcaseTone) : flip(tones[tones.length - 1])

  return (
    <>
      {visible.map((section, index) => (
        <HomeSection
          key={section.key}
          section={section}
          store={store}
          home={shaped.home}
          skin={skin}
          tone={tones[index]}
          covers={covers}
          categoriesAnchor={showsCategories}
          facts={facts}
          heroCta={heroCta}
          catalogAll={shaped.catalogAll}
          pictures={shaped.pictures}
        />
      ))}
      {shaped.showcase && (
        <ProductShowcase
          store={store}
          product={shaped.showcase}
          skin={skin}
          tone={showcaseTone}
        />
      )}
      <ContactBand store={store} skin={skin} tone={contactTone} />
    </>
  )
}

/**
 * "Questions? Talk to the shop" — WhatsApp and Call, last on the page where a
 * customer who scrolled everything and is still unsure ends up. Only when the
 * seller entered a number; nothing is shown otherwise.
 */
function ContactBand({
  store,
  skin,
  tone,
}: {
  store: PublicStore
  skin: Skin
  tone: BandTone
}) {
  const { whatsapp, phone, hours } = shopContact(store)
  if (!whatsapp && !phone) return null
  return (
    <Band tone={tone} skin={skin}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className={`font-heading text-xl font-bold sm:text-2xl ${skin.text}`}>
            Questions? Talk to {store.name}
          </h2>
          <p className={`mt-1 text-[15px] ${skin.muted}`}>
            {hours
              ? `Available: ${hours}`
              : 'Ask about sizes, colours, delivery — anything.'}
          </p>
        </div>
        <ContactActions
          store={store}
          skin={skin}
          message={`Hi ${store.name}, I saw your shop on UnieMax.`}
          className="sm:shrink-0"
        />
      </div>
    </Band>
  )
}

/** Where the hero's button goes, by shop size — see `Hero`. */
const HERO_CTA: Record<ShopSize, HeroCta> = {
  one: 'none',
  small: 'products',
  full: 'shop',
}

interface ShapedHome {
  /** The payload with the sections this shop's size makes redundant emptied. */
  home: PublicStoreHome
  /** The single product of a one-product shop, shown as a showcase. */
  showcase: PublicProduct | null
  /** "All Products" holds the whole shop — show all of it, uncapped. */
  catalogAll: boolean
  /** Every product the page has, for category-tile pictures. */
  pictures: PublicProduct[]
}

/**
 * Fits the homepage payload to the shop. Pure: the owner's section order and
 * switches are untouched, only what each section would REPEAT is removed.
 */
function shapeHome(home: PublicStoreHome, size: ShopSize): ShapedHome {
  const pictures = [
    ...home.catalog,
    ...home.featured,
    ...home.newArrivals,
    ...home.bestSellers,
    ...home.categoryRows.flatMap((row) => row.products),
  ]
  const categories = browsableCategories(home.featuredCategories)
  const base: PublicStoreHome = {
    ...home,
    featuredCategories: categories.length >= 2 ? categories : [],
  }

  if (size === 'one') {
    return { home: base, showcase: pictures[0] ?? null, catalogAll: false, pictures }
  }

  const catalogOn =
    home.catalog.length > 0 &&
    home.sections.some((section) => section.key === 'catalog' && section.enabled)

  // A small shop is entirely inside "All Products", so per-category shelves
  // and the curated rows would only show the same few products again (a
  // "New Arrivals" of one card above an "All Products" holding that card).
  // The owner's picks are not lost: they LEAD the grid — Featured, then Best
  // Sellers, then New Arrivals, then everything else newest first.
  if (size === 'small' && catalogOn) {
    const picked = [...home.featured, ...home.bestSellers, ...home.newArrivals]
    const order = new Map<string, number>()
    for (const product of picked) {
      if (!order.has(product.id)) order.set(product.id, order.size)
    }
    const rank = (product: PublicProduct) => order.get(product.id) ?? order.size
    const catalog = home.catalog
      .map((product, index) => ({ product, index }))
      .sort((a, b) => rank(a.product) - rank(b.product) || a.index - b.index)
      .map(({ product }) => product)
    return {
      home: {
        ...base,
        featured: [],
        newArrivals: [],
        bestSellers: [],
        categoryRows: [],
        catalog,
      },
      showcase: null,
      catalogAll: true,
      pictures,
    }
  }

  // A big shop: "All Products" skips anything a row ABOVE it already showed.
  const shown = new Set<string>()
  for (const section of home.sections) {
    if (section.key === 'catalog') break
    if (!section.enabled) continue
    const products =
      section.key === 'featured' || section.key === 'newArrivals' || section.key === 'bestSellers'
        ? home[section.key]
        : section.key === 'categoryRows'
          ? home.categoryRows.flatMap((row) => row.products)
          : []
    for (const product of products) shown.add(product.id)
  }
  return {
    home: { ...base, catalog: home.catalog.filter((product) => !shown.has(product.id)) },
    showcase: null,
    catalogAll: false,
    pictures,
  }
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
  facts,
  heroCta,
  catalogAll,
  pictures,
}: {
  section: HomeSectionEntry
  store: PublicStore
  home: PublicStoreHome
  skin: Skin
  tone: BandTone
  covers: string[]
  categoriesAnchor: boolean
  facts: TrustFact[]
  heroCta: HeroCta
  catalogAll: boolean
  pictures: PublicProduct[]
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
          facts={facts}
          cta={heroCta}
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
          products={pictures}
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
          id="shop-products"
          store={store}
          title={copy.title}
          eyebrow={
            // The default strapline ("the newest across the whole shop") is
            // wrong when this IS the whole shop; the owner's own words stay.
            catalogAll && !section.settings?.subtitle
              ? `${shopProductCount(store)} products`
              : copy.subtitle
          }
          viewAllTo={storeShopUrl(store.slug)}
          products={home.catalog}
          layout={productLayout(layout)}
          all={catalogAll}
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
        ? 'py-8 sm:py-12 lg:py-16'
        : 'py-8 sm:py-10'
  return (
    <section
      id={id}
      className={`${SCROLL_UNDER_HEADER} border-b last:border-b-0 ${skin.border} ${tone === 'alt' ? skin.surface : ''} ${className}`}
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
/**
 * Where the hero's button leads: the products just below (a small shop — they
 * are all on this page), the Shop page (a big one), or nowhere (a
 * one-product shop, whose product is the very next thing on the page).
 */
type HeroCta = 'products' | 'shop' | 'none'

const TRUST_ICONS: Record<TrustFact['key'], typeof TruckIcon> = {
  delivery: TruckIcon,
  cod: RupeeIcon,
  online: CardIcon,
  pickup: StoreIcon,
}

function Hero({
  store,
  skin,
  tone = 'alt',
  covers,
  categoriesAnchor,
  facts,
  cta,
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
  /** Delivery / payment reassurance from this store's real settings. */
  facts: TrustFact[]
  cta: HeroCta
  /** Owner's headline. Null = the store's own name. */
  heading?: string | null
  /** Owner's intro line. Null = their About text, else nothing. */
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
  const about = store.footer.info.about?.trim()
  const art = covers.slice(0, HERO_ART_SIZE)
  const hasArt = layout === 'split' && art.length >= 2
  // Only words someone wrote. The old generated line ("4 products across 1
  // category, delivered to your door") was catalogue arithmetic, not a reason
  // to buy — the trust chips below say what a customer actually needs.
  const intro = tagline ?? about ?? null
  const label = ctaLabel ?? HERO_DEFAULT_CTA
  const ctaClass = `inline-flex h-12 items-center gap-1.5 rounded-md px-6 text-[15px] font-bold transition ${skin.cta}`
  const align = hasArt ? '' : 'justify-center'

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
          {/* The shop's own mark, big enough to recognise — the old 44px logo
              sat beside a "WELCOME TO" eyebrow that said nothing. */}
          {store.logoUrl && (
            <MediaImg
              sizes="64px"
              src={store.logoUrl}
              alt=""
              className={`h-16 w-16 rounded-xl border object-cover shadow-floating ${hasArt ? '' : 'mx-auto'} ${skin.border}`}
            />
          )}

          {/* `break-words` so a long single-word shop name wraps instead of
              widening the band past the viewport. */}
          <h1
            className={`mt-4 break-words font-heading text-3xl font-bold leading-[1.05] sm:text-4xl lg:text-5xl ${skin.text}`}
          >
            {heading ?? store.name}
          </h1>

          {intro && (
            <p
              className={`mt-3 line-clamp-3 max-w-xl text-[15px] sm:line-clamp-none sm:text-base ${hasArt ? '' : 'mx-auto'} ${skin.muted}`}
            >
              {intro}
            </p>
          )}

          {facts.length > 0 && (
            <ul className={`mt-5 flex flex-wrap gap-2 ${align}`}>
              {facts.map((fact) => {
                const Icon = TRUST_ICONS[fact.key]
                return (
                  <li
                    key={fact.key}
                    className={`inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px] font-semibold ${skin.border} ${skin.text} ${tone === 'alt' ? 'bg-bg' : skin.surface}`}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-brand" />
                    {fact.label}
                  </li>
                )
              })}
            </ul>
          )}

          {(cta !== 'none' || categoriesAnchor) && (
            <div className={`mt-6 flex flex-wrap items-center gap-3 ${align}`}>
              {cta === 'shop' && (
                <Link to={storeShopUrl(store.slug)} className={ctaClass}>
                  {label}
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
              )}
              {cta === 'products' && (
                <a href="#shop-products" className={ctaClass}>
                  {label}
                  <ChevronRightIcon className="h-4 w-4" />
                </a>
              )}
              {/* Only offered when the categories band is actually on the page. */}
              {categoriesAnchor && (
                <a
                  href="#shop-by-category"
                  className={`inline-flex h-12 items-center rounded-md border px-6 text-[15px] font-semibold transition-colors hover:border-brand ${skin.border} ${skin.text}`}
                >
                  Shop by Category
                </a>
              )}
            </div>
          )}
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
        <MediaImg
          sizes="(min-width: 1024px) 320px, 50vw"
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
  products,
  title,
  layout,
  skin,
  tone,
  builder,
}: {
  store: PublicStore
  categories: PublicCategory[]
  /** Products already on the page — a shelf with no picture borrows a cover. */
  products: PublicProduct[]
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
        <CategoryTiles
          store={store}
          categories={categories}
          products={products}
          skin={skin}
        />
      ) : (
        // Round pictures with the name underneath — the shape every shopping
        // app on a phone uses for categories, so it needs no explaining.
        <ul className={`mt-4 flex gap-3 pb-1 sm:gap-4 ${EDGE_SCROLLER}`}>
          {categories.map((category) => {
            const picture = categoryPicture(category, products)
            return (
              <li key={category.id} className="w-[84px] shrink-0 sm:w-24">
                <Link
                  to={storeCategoryUrl(store.slug, category.slug)}
                  className="group flex flex-col items-center gap-2 text-center"
                >
                  <span
                    className={`flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full border-2 transition-colors group-hover:border-brand sm:h-20 sm:w-20 ${skin.border} ${skin.well}`}
                  >
                    {picture ? (
                      <MediaImg
                        sizes="80px"
                        src={picture}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <CategoryInitial name={category.name} />
                    )}
                  </span>
                  <span
                    className={`line-clamp-2 text-[13px] font-semibold leading-tight ${skin.text}`}
                  >
                    {category.name}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Band>
  )
}

/** A category with no picture anywhere: its first letter in the brand colour. */
function CategoryInitial({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="font-heading text-xl font-bold text-brand"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** How many tiles a band shows    </Band>
  )
}

/** How many tiles a band shows before the rest live on the Shop page. */
const CATEGORY_TILE_CAP = 12

/**
 * Categories as cards — a picture, the name and the count. The picture is the
 * shelf's own artwork, else a cover of one of its products already on the
 * page (`categoryPicture`), else the name's first letter: always something
 * real. Two across on a phone and up to six on a wide monitor, so a tile
 * never stretches into a billboard on a 2560px screen.
 */
function CategoryTiles({
  store,
  categories,
  products,
  skin,
}: {
  store: PublicStore
  categories: PublicCategory[]
  products: PublicProduct[]
  skin: Skin
}) {
  return (
    <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-6">
      {categories.slice(0, CATEGORY_TILE_CAP).map((category) => {
        const picture = categoryPicture(category, products)
        return (
          <li key={category.id}>
            <Link
              to={storeCategoryUrl(store.slug, category.slug)}
              className={`group flex h-full flex-col overflow-hidden rounded-lg border metal-lift ${skin.border} ${skin.surface}`}
            >
              <span
                className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden ${skin.well}`}
              >
                {picture ? (
                  <FillImage
                    src={picture}
                    alt=""
                    sizes="(min-width: 1024px) 16vw, (min-width: 640px) 33vw, 50vw"
                  />
                ) : (
                  <CategoryInitial name={category.name} />
                )}
              </span>
              <span className="min-w-0 p-3">
                <span
                  className={`block truncate text-[15px] font-semibold ${skin.text}`}
                >
                  {category.name}
                </span>
                <span className={`mt-0.5 block text-[13px] ${skin.muted}`}>
                  {category.productCount}{' '}
                  {category.productCount === 1 ? 'product' : 'products'}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
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
  id,
  store,
  title,
  eyebrow,
  viewAllTo,
  products,
  layout,
  all = false,
  skin,
  tone,
  builder,
}: {
  /** Anchor the hero's button scrolls to. */
  id?: string
  store: PublicStore
  title: string
  eyebrow?: string
  viewAllTo: string
  products: PublicProduct[]
  layout: SectionLayout
  /**
   * These products ARE the whole shop: show every one in a plain grid, with
   * no "View all" (there is nothing more to view).
   */
  all?: boolean
  skin: Skin
  tone: BandTone
  builder?: Record<string, string> | undefined
}) {
  if (products.length === 0) return null

  if (all) {
    return (
      <Band id={id} tone={tone} skin={skin} builder={builder}>
        <SectionHeading title={title} eyebrow={eyebrow} skin={skin} />
        <ul className={`mt-5 ${PRODUCT_GRID}`}>
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              store={store}
              product={product}
              skin={skin}
              // The first row is what a phone shows under the hero.
              eager={index < 2}
            />
          ))}
        </ul>
      </Band>
    )
  }

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
    <Band id={id} tone={tone} skin={skin} builder={builder}>
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

// ---------------------------------------------------------------------------
// One-product shop
// ---------------------------------------------------------------------------

/**
 * A one-product shop's homepage IS that product: one large card — the photo
 * across the full width of a phone, the name, price and saving, stock, the
 * seller's description and the buying controls themselves when there is
 * nothing to choose (else one button to the product page) — instead of a category picker,
 * a "collection" and an "All Products" grid each holding the same lone card.
 * Side by side from `lg`.
 */
function ProductShowcase({
  store,
  product,
  skin,
  tone,
}: {
  store: PublicStore
  product: PublicProduct
  skin: Skin
  tone: BandTone
}) {
  const to = storeProductUrl(store.slug, product.slug)
  const off = discountPercent(product)
  const soldOut = product.stockQuantity <= 0
  return (
    <Band id="shop-products" tone={tone} skin={skin}>
      <article
        className={`overflow-hidden rounded-xl border ${skin.border} ${skin.surface} lg:grid lg:grid-cols-2`}
      >
        <Link
          to={to}
          className={`relative block aspect-square overflow-hidden ${skin.well}`}
        >
          {product.image?.url ? (
            <FillImage
              eager
              src={product.image.url}
              alt={product.image.altText ?? product.name}
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          ) : (
            <NoProductImage />
          )}
          {off !== null && !soldOut && (
            <span className="absolute left-3 top-3 rounded-pill bg-brand px-2.5 py-1 text-[13px] font-bold text-brand-contrast">
              {off}% off
            </span>
          )}
        </Link>

        <div className="flex flex-col p-5 sm:p-7 lg:justify-center lg:p-10">
          <p className={`text-[13px] font-semibold ${skin.muted}`}>
            {product.category.name}
          </p>
          <h2
            className={`mt-1 font-heading text-2xl font-bold leading-tight sm:text-3xl ${skin.text}`}
          >
            {displayName(product.name)}
          </h2>
          <div className="mt-3">
            <PriceLabel product={product} size="lg" />
          </div>
          <div className="mt-2">
            {soldOut ? (
              <span className={`text-sm font-semibold ${skin.muted}`}>Sold out</span>
            ) : (
              <StockBadge stock={product.stockQuantity} />
            )}
          </div>
          {product.description && (
            <p
              className={`mt-4 line-clamp-4 whitespace-pre-line text-[15px] leading-relaxed ${skin.muted}`}
            >
              {product.description}
            </p>
          )}
          {canQuickAdd(product) ? (
            // Nothing to choose: buy right here — quantity, Add to Cart and
            // Buy Now, the same controls as the product page.
            <div className="mt-6 lg:max-w-sm">
              <PurchaseActions
                skin={skin}
                target={{
                  storeSlug: store.slug,
                  storeName: store.name,
                  productId: product.id,
                  productSlug: product.slug,
                  variantId: null,
                  name: product.name,
                  variantName: null,
                  imageUrl: product.image?.url ?? null,
                  price: product.price!,
                  stock: product.stockQuantity,
                }}
              />
              <Link
                to={to}
                className="mt-3 inline-flex min-h-tap items-center gap-1 text-sm font-semibold text-brand hover:underline"
              >
                See all photos and details
                <ChevronRightIcon className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <Link
              to={to}
              className={`mt-6 inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-md px-8 text-base font-bold sm:w-auto sm:self-start ${skin.cta}`}
            >
              {soldOut ? 'See details' : 'Choose & buy'}
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          )}
        </div>
      </article>
    </Band>
  )
}

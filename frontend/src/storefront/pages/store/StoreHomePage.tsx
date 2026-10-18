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
  CARD_PHOTO,
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
  plainLetters,
  shopProductCount,
  shopSize,
  type ShopSize,
} from '../../features/publicStore/shopShape'
import {
  EmptyCatalog,
  GridSkeleton,
  SectionHeading,
} from '../../features/publicStore/ListingControls'
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from '../../layout/icons'
import type { Skin } from '../../features/publicStore/storeTheme'
import { BannerCarousel } from '../../features/banners/BannerCarousel'
import {
  builderSectionProps,
  useBuilderRefresh,
} from '../../features/publicStore/builderBridge'
import {
  defaultLayout,
  sectionCopy,
} from '../../features/publicStore/sectionCopy'
import { MediaImg } from '../../../shared/media/MediaImg'
import { buttonClass } from '../../../shared/ui/Button'

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
  'hidden md:flex',
  'hidden lg:flex',
  'hidden xl:flex',
]

/** Full rows "All Products" draws in a big shop (the others draw one). */
const CATALOG_ROWS = 2

/** Columns of `PRODUCT_GRID` per breakpoint, narrowest first. */
const GRID_COLUMNS = [
  { show: '', hide: 'hidden', cols: 2 },
  { show: 'md:flex', hide: 'md:hidden', cols: 3 },
  { show: 'lg:flex', hide: 'lg:hidden', cols: 4 },
  { show: 'xl:flex', hide: 'xl:hidden', cols: 5 },
] as const

/**
 * `ROW_VISIBILITY` for up to `rows` rows: at every breakpoint the card shows
 * only if it falls inside the FULL rows `total` products can make there, so
 * nine products draw 2 × 4 on `lg` and 1 × 5 on `xl` — never a ragged line.
 * Literal class strings, because Tailwind scans source text.
 */
function fullRowsVisibility(index: number, total: number, rows: number): string {
  const classes: string[] = []
  let shownBefore = true
  for (const { show, hide, cols } of GRID_COLUMNS) {
    const visible =
      total < cols ? index < total : index < cols * Math.min(rows, Math.floor(total / cols))
    if (visible !== shownBefore) classes.push(visible ? show : hide)
    shownBefore = visible
  }
  return classes.join(' ')
}

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

/** Thumbnails of the products past the row, in the shelf panel (2 × 2). */
const SHELF_PEEK_SIZE = 4

/** Below this a shelf renders as a plain titled row instead — see below. */
const SHELF_PANEL_MIN = 2

type HomeSectionKey = PublicStoreHome['sections'][number]['key']
type HomeSectionEntry = PublicStoreHome['sections'][number]

/**
 * `/store/{storeSlug}` — the storefront homepage.
 *
 * It *introduces* the store rather than dumping a filtered product grid:
 * banners, Shop by Category, then the owner's merchandising sections. Browsing
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
 * Arrivals a plain row, the categories a block of cards)
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
 * | one product   | banners, then that product as a big showcase card           |
 * | ≤ 12 products | every product ONCE in "All Products", the owner's Featured / Best / New picks first (no curated rows or per-category shelves, which would repeat them) |
 * | bigger        | everything below; "All Products" skips what earlier rows showed |
 *
 * Category pickers only appear when there are two or more categories to pick
 * between, after single-branch chains are walked down (`browsableCategories`).
 *
 * The three curated rows are strictly flag-driven — one with nothing flagged
 * renders nothing (there is deliberately no fallback). What keeps an uncurated
 * shop from being banners over empty space is the two rows below them, which
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

  return <StoreHomeView store={store} skin={skin} home={home} />
}

/**
 * The homepage for a given payload — `undefined` while it loads, `null` when
 * it failed. Split from the fetch so the page renders (and is tested) from
 * data alone; the public storefront and the Store Builder's preview frame
 * both render exactly this.
 *
 * **A shop with no products yet** is laid out like any other: its banners,
 * header and footer render as their switches say, and only the product area
 * becomes a "Products coming soon" card, before the footer. It used to be that card alone on an otherwise empty page, which
 * looked like a broken shop to visitors and showed a seller in the builder
 * none of what they were designing.
 */
export function StoreHomeView({
  store,
  skin,
  home,
}: {
  store: PublicStore
  skin: Skin
  home: PublicStoreHome | null | undefined
}) {
  // The shell's category tree only holds categories with something to buy,
  // so no categories means nothing to sell yet.
  const empty = store.categories.length === 0
  const size = shopSize(store)
  // The page's one heading. The store's name is already on screen in the
  // header, so it is for search engines and screen readers only.
  const heading = <h1 className="sr-only">{store.name}</h1>

  if (home === undefined || home === null) {
    return (
      <>
        {heading}
        {empty ? (
          // Nothing is loading that could change this — say it straight away.
          <ComingSoonBand store={store} skin={skin} tone="base" />
        ) : (
          <StorePageShell>
            {home === undefined ? (
              <GridSkeleton skin={skin} />
            ) : (
              <p className={`py-10 text-center text-sm ${skin.muted}`}>
                Could not load this store's products. Please refresh.
              </p>
            )}
          </StorePageShell>
        )}
      </>
    )
  }

  // Only sections that will actually paint something, in the ORDER the owner
  // arranged. Filtering BEFORE indexing keeps the alternating band tones
  // strictly alternating — an empty section never burns a tone slot.
  const shaped = shapeHome(home, size)
  const visible = shaped.home.sections
    .filter((section) => section.enabled)
    .filter((section) => hasContent(section.key, shaped.home, empty))
    // A one-product shop shows its banners and then the product itself.
    .filter((section) => shaped.showcase === null || section.key === 'banners')

  // No banner on screen → the page opens on an introduction instead of
  // straight into a product grid: who the shop is, in its own words, and
  // what it offers. With a banner, the banner is the introduction.
  const intro = !visible.some((section) => section.key === 'banners')

  const tones = bandTones(visible, shaped.home)
  const flip = (tone: BandTone | undefined): BandTone => (tone === 'alt' ? 'base' : 'alt')
  // The one-product showcase or the coming-soon card: the product area.
  const productTone = flip(tones[tones.length - 1])
  const contactTone =
    shaped.showcase || empty ? flip(productTone) : flip(tones[tones.length - 1])

  return (
    <>
      {intro ? <StoreIntro store={store} skin={skin} /> : heading}
      {visible.map((section, index) => (
        <HomeSection
          key={section.key}
          section={section}
          store={store}
          home={shaped.home}
          skin={skin}
          tone={tones[index]}
          catalogAll={shaped.catalogAll}
          pictures={shaped.pictures}
        />
      ))}
      {shaped.showcase && (
        <ProductShowcase
          store={store}
          product={shaped.showcase}
          skin={skin}
          tone={productTone}
        />
      )}
      {empty && <ComingSoonBand store={store} skin={skin} tone={productTone} />}
      <ContactBand store={store} skin={skin} tone={contactTone} />
    </>
  )
}

/**
 * The shop's introduction, for a homepage with no banner on screen: logo,
 * name (the page's visible `<h1>`), the seller's About line, and a row of
 * facts. Every fact is a setting the seller made, phrased to be true for the
 * whole shop — products can override delivery charges and cash on delivery,
 * so it says "Home delivery" rather than "Free delivery", and "Cash on
 * delivery available" rather than promising it on everything. Nothing is
 * shown that the seller did not set.
 */
function StoreIntro({ store, skin }: { store: PublicStore; skin: Skin }) {
  const facts = storeFacts(store)
  const about = store.footer.info.about
  return (
    <section className={STORE_CONTAINER}>
      <div className="py-6 sm:py-10">
        <div className="flex items-center gap-4 sm:gap-5">
          {store.logoUrl ? (
            <MediaImg
              sizes="80px"
              src={store.logoUrl}
              alt=""
              className="size-16 shrink-0 rounded-lg object-cover sm:size-20"
            />
          ) : (
            <span
              aria-hidden
              className={`flex size-16 shrink-0 items-center justify-center rounded-lg text-2xl font-semibold sm:size-20 ${skin.cta}`}
            >
              {store.name.trim().charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <h1
              className={`font-display text-2xl font-semibold leading-tight sm:text-3xl ${skin.text}`}
            >
              {store.name}
            </h1>
            {about && (
              <p
                className={`mt-1 line-clamp-2 max-w-2xl text-sm sm:text-base ${skin.muted}`}
              >
                {plainLetters(about)}
              </p>
            )}
          </div>
        </div>
        {facts.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2">
            {facts.map((fact) => (
              <li
                key={fact}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-alt px-3 py-1.5 text-xs font-medium text-fg"
              >
                <CheckIcon className="h-3.5 w-3.5 text-success" />
                {fact}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** The shop-wide facts `StoreIntro` may state — all from seller settings. */
function storeFacts(store: PublicStore): string[] {
  const facts: string[] = []
  const { mode } = store.shipping
  if (mode === 'DELIVERY' || mode === 'BOTH') facts.push('Home delivery')
  if (mode === 'PICKUP' || mode === 'BOTH') facts.push('Store pickup')
  if (store.payments.acceptCod) facts.push('Cash on delivery available')
  if (store.payments.acceptOnlinePayment) facts.push('UPI & cards')
  if (store.footer.info.establishedYear) {
    facts.push(`Since ${store.footer.info.establishedYear}`)
  }
  return facts
}

/**
 * The product area of a shop with nothing to sell yet: where its products
 * will appear, so the rest of the page can be exactly what shoppers will see.
 */
function ComingSoonBand({
  store,
  skin,
  tone,
}: {
  store: PublicStore
  skin: Skin
  tone: BandTone
}) {
  return (
    <Band id="shop-products" tone={tone} skin={skin}>
      <EmptyCatalog storeName={store.name} skin={skin} />
    </Band>
  )
}

/** A banners section with nothing uploaded yet — see `HomeSection`. */
const PLACEHOLDER_BANNER = {
  id: 'placeholder',
  title: null,
  imageUrl: null,
  href: null,
  external: false,
}

/**
 * "Need help before you order?" — WhatsApp and Call, last on the page where a
 * customer who scrolled everything and is still unsure ends up. Only when the
 * seller entered a number; nothing is shown otherwise. WhatsApp is the filled
 * action only because the seller gave a WhatsApp number (`ContactActions`);
 * the hours line appears only when the seller wrote one — nothing is promised
 * on their behalf.
 *
 * A compact strip, not a showpiece: one heading, one line, two buttons —
 * text left and buttons right from `sm`, stacked on a phone.
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
    <Band tone={tone} skin={skin} pad="compact">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <h2 className={`font-display text-xl font-semibold ${skin.text}`}>
            Need help before you order?
          </h2>
          <p className={`mt-1 text-sm ${skin.muted}`}>
            {hours
              ? `Message or call ${store.name} · ${hours}`
              : `Message or call ${store.name} with any question.`}
          </p>
        </div>
        <ContactActions
          store={store}
          skin={skin}
          message={`Hi ${store.name}, I saw your shop on UnieMax.`}
          className="w-full shrink-0 sm:w-auto"
        />
      </div>
    </Band>
  )
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

  // A big shop: "All Products" skips anything a row ABOVE it already showed —
  // what it DREW, not what it loaded. A shelf loads twelve and draws three;
  // skipping all twelve emptied "All Products" in a one-category shop.
  const shown = new Set<string>()
  for (const section of home.sections) {
    if (section.key === 'catalog') break
    if (!section.enabled) continue
    const products =
      section.key === 'featured' || section.key === 'newArrivals' || section.key === 'bestSellers'
        ? drawnProducts(home[section.key], section)
        : section.key === 'categoryRows'
          ? home.categoryRows.flatMap((row) => row.products.slice(0, SHELF_ROW_SIZE))
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

/**
 * The products a curated section actually puts on screen, by the same rule
 * `ProductSection` uses to pick its composition: a rail draws all of them, a
 * spotlight its lead + six, the capped row one row.
 */
function drawnProducts(products: PublicProduct[], section: HomeSectionEntry): PublicProduct[] {
  const layout = productLayout(sectionCopy(section).layout ?? defaultLayout(section.key))
  if (layout === 'rail' && products.length >= RAIL_MIN) return products
  if (layout === 'spotlight' && products.length >= SPOTLIGHT_MIN) {
    return products.slice(0, 1 + SPOTLIGHT_SUPPORT)
  }
  return products.slice(0, ROW_SIZE)
}

/**
 * Does this section have anything to render? Drives band alternation.
 *
 * A shop with no products (`empty`) still shows its banners section when it
 * is switched on, uploads or not — the page would otherwise be little more
 * than a header and footer, and the builder preview would hide the very
 * section the seller is editing. Stocked shops keep hiding an empty one.
 */
function hasContent(key: HomeSectionKey, home: PublicStoreHome, empty: boolean): boolean {
  switch (key) {
    case 'banners':
      return home.banners.length > 0 || empty
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
  catalogAll,
  pictures,
}: {
  section: HomeSectionEntry
  store: PublicStore
  home: PublicStoreHome
  skin: Skin
  tone: BandTone
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
          // Only a shop with no products reaches here without banners
          // (`hasContent`): one slide in the shop's colour with its name.
          banners={home.banners.length > 0 ? home.banners : [PLACEHOLDER_BANNER]}
          fallbackLabel={store.name}
          id="shop-banners"
          className={tone === 'alt' ? skin.surface : ''}
          // Artwork stays inside the same column as everything else: left
          // edge-to-edge it grew to 800px tall on a 2560px monitor.
          containerClassName={`${STORE_CONTAINER} py-4 sm:py-6`}
          frameClassName="overflow-hidden rounded-lg"
          wellClassName={skin.well}
          {...builder}
        />
      )
    case 'categories':
      return (
        <CategoryStrip
          store={store}
          categories={home.featuredCategories}
          products={pictures}
          title={copy.title}
          // A shop with only a few shelves gets them as big picture tiles —
          // two 80px chips left a desktop row almost empty. The owner's own
          // choice in the Store Builder still wins.
          layout={
            layout === 'tiles' ||
            (copy.layout === null &&
              home.featuredCategories.length <= FEW_CATEGORIES)
              ? 'tiles'
              : 'chips'
          }
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
          // The one section that is "everything we stock": two full rows, so
          // a shop with most of its stock on one shelf still shows plenty.
          rows={CATALOG_ROWS}
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
 * Full-bleed section band: the page canvas or the raised surface tone, with
 * the shared content column inside. The band is part of the section, so a
 * section that renders nothing leaves no empty strip.
 *
 * Separation is the tone change plus generous air — no divider rules. A
 * classic shop breathes between sections; tight bands with a line under each
 * read as a settings screen.
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
  /** `dense` = one row of controls, no heading. */
  pad?: 'dense' | 'compact' | 'normal'
  className?: string
  /** Store Builder hit-target; absent on the public storefront. */
  builder?: Record<string, string> | undefined
  children: React.ReactNode
}) {
  const padding =
    pad === 'dense'
      ? 'py-3.5 sm:py-4'
      : pad === 'compact'
        ? 'py-6 sm:py-8'
        : 'py-8 sm:py-12 lg:py-14'
  return (
    <section
      id={id}
      className={`${SCROLL_UNDER_HEADER} ${tone === 'alt' ? skin.surface : ''} ${className}`}
      {...builder}
    >
      <div className={`${STORE_CONTAINER} ${padding}`}>{children}</div>
    </section>
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
      // A strip of signposts, not a section of products: it takes the
      // compact band so the first products land higher on a phone.
      pad={layout === 'chips' ? 'compact' : 'normal'}
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
        // Soft-square pictures with the name underneath — the same neutral
        // tile and whole-product photo as the product cards, so a scanner's
        // cable or a tub's label is not cropped by a circle. Names get two
        // lines at caption size: "Computers & Accessories" reads in full
        // instead of stopping at "Computers &…".
        <ul className={`mt-4 flex gap-3 pb-1 sm:gap-4 ${EDGE_SCROLLER}`}>
          {categories.map((category) => {
            const picture = categoryPicture(category, products)
            return (
              <li key={category.id} className="w-[88px] shrink-0 sm:w-24">
                <Link
                  to={storeCategoryUrl(store.slug, category.slug)}
                  className="group flex flex-col items-center gap-2 rounded-lg text-center"
                >
                  <span
                    className={`flex size-[72px] items-center justify-center overflow-hidden rounded-lg border border-transparent transition-colors group-hover:border-brand sm:size-20 ${skin.well}`}
                  >
                    {picture ? (
                      <MediaImg
                        sizes="80px"
                        src={picture}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className={CARD_PHOTO}
                      />
                    ) : (
                      <CategoryInitial name={category.name} />
                    )}
                  </span>
                  <span
                    className={`line-clamp-2 text-xs font-medium leading-snug group-hover:underline ${skin.text}`}
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
      className="font-display text-2xl font-semibold text-brand"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** How many tiles a band shows before the rest live on the Shop page. */
const CATEGORY_TILE_CAP = 12

/** Up to this many categories, the strip defaults to big picture tiles. */
const FEW_CATEGORIES = 4

/**
 * Categories as cards — a picture, the name and the count. The picture is the
 * shelf's own artwork, else a cover of one of its products already on the
 * page (`categoryPicture`), else the name's first letter: always something
 * real. Two across on a phone and up to six on a wide monitor, so a tile
 * never stretches into a billboard on a 2560px screen.
 *
 * **A few categories** (≤ `FEW_CATEGORIES`) get compact horizontal cards —
 * a small square photo, the name and the count (`FewCategoryTile`). They were
 * full-width portrait tiles once, and two of them filled a phone's screen
 * before a single product showed: a category is a way in, not the display.
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
  if (categories.length <= FEW_CATEGORIES) {
    return (
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {categories.map((category) => (
          <FewCategoryTile
            key={category.id}
            store={store}
            category={category}
            picture={categoryPicture(category, products)}
            skin={skin}
          />
        ))}
      </ul>
    )
  }
  return (
    <ul className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4 xl:grid-cols-6">
      {categories.slice(0, CATEGORY_TILE_CAP).map((category) => {
        const picture = categoryPicture(category, products)
        return (
          <li key={category.id}>
            {/* Framed like a product card — the picture is the tile, the
                words sit on the page under it. */}
            <Link
              to={storeCategoryUrl(store.slug, category.slug)}
              className="group flex h-full flex-col rounded-lg"
            >
              <span
                className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg ${skin.well}`}
              >
                {picture ? (
                  <FillImage
                    src={picture}
                    alt=""
                    sizes="(min-width: 1024px) 16vw, (min-width: 640px) 33vw, 50vw"
                    className="transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                  />
                ) : (
                  <CategoryInitial name={category.name} />
                )}
              </span>
              <span className="min-w-0 pt-3">
                <span
                  className={`block truncate font-display text-base font-semibold decoration-1 underline-offset-4 group-hover:underline ${skin.text}`}
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
        )
      })}
    </ul>
  )
}

/**
 * One of a few category cards: a small square photo beside the name and the
 * count, with a chevron saying it leads somewhere.
 */
function FewCategoryTile({
  store,
  category,
  picture,
  skin,
}: {
  store: PublicStore
  category: PublicCategory
  picture: string | null
  skin: Skin
}) {
  return (
    <li>
      <Link
        to={storeCategoryUrl(store.slug, category.slug)}
        className={`group flex h-full items-center gap-4 rounded-lg border p-3 card-hover ${skin.border} ${skin.surface}`}
      >
        <span
          className={`relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg sm:size-20 ${skin.well}`}
        >
          {picture ? (
            <MediaImg
              src={picture}
              alt=""
              sizes="80px"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transition-none"
            />
          ) : (
            <CategoryInitial name={category.name} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`line-clamp-2 font-display text-base font-semibold decoration-1 underline-offset-4 group-hover:underline ${skin.text}`}
          >
            {category.name}
          </span>
          <span className={`mt-0.5 block text-sm ${skin.muted}`}>
            {category.productCount}{' '}
            {category.productCount === 1 ? 'product' : 'products'}
          </span>
        </span>
        <ChevronRightIcon
          className={`h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 ${skin.muted}`}
        />
      </Link>
    </li>
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
  rows = 1,
  skin,
  tone,
  builder,
}: {
  /** Anchor for in-page links to the shop's products. */
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
  /** Full rows the capped grid may draw (only "All Products" asks for two). */
  rows?: number
  skin: Skin
  tone: BandTone
  builder?: Record<string, string> | undefined
}) {
  if (products.length === 0) return null

  if (all) {
    return (
      <Band id={id} tone={tone} skin={skin} builder={builder}>
        <SectionHeading title={title} eyebrow={eyebrow} skin={skin} />
        <ul className={`mt-4 sm:mt-6 ${PRODUCT_GRID}`}>
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              store={store}
              product={product}
              skin={skin}
              // The first row is what a phone shows near the top.
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
        <ul className={`mt-4 sm:mt-6 ${PRODUCT_GRID}`}>
          {products.slice(0, ROW_SIZE * rows).map((product, index) => (
            <ProductCard
              key={product.id}
              store={store}
              product={product}
              skin={skin}
              className={
                rows === 1
                  ? (ROW_VISIBILITY[index] ?? '')
                  : fullRowsVisibility(index, products.length, rows)
              }
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
    <ul className="mt-4 grid gap-x-5 gap-y-6 sm:mt-6 sm:gap-y-8 lg:grid-cols-3">
      <ProductCard store={store} product={lead} skin={skin} size="lg" />
      {/* A list item holding the supporting grid, so the whole section stays
          one well-formed list rather than two side by side. */}
      <li className="lg:col-span-2">
        <ul className="grid h-full grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8">
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
        className={`mt-4 flex snap-x snap-proximity gap-3 pb-1 sm:mt-6 sm:gap-5 ${EDGE_SCROLLER}`}
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
        <ul className={`mt-4 sm:mt-6 ${PRODUCT_GRID}`}>
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
  // The panel is as tall as a product card on `lg`; a peek at what is past
  // the row fills it with the shelf's own stock instead of empty space.
  const photos = row.products
    .slice(SHELF_ROW_SIZE)
    .flatMap((product) => (product.image?.url ? [{ id: product.id, url: product.image.url }] : []))
  // Whole lines of two only — three would leave a hole in the 2 × 2.
  const peek = photos.slice(0, Math.min(SHELF_PEEK_SIZE, photos.length - (photos.length % 2)))
  const more = Math.max(0, count - shown.length - peek.length)

  return (
    <Band tone={tone} skin={skin} builder={builder}>
      <div className="grid gap-x-5 gap-y-6 lg:grid-cols-4">
        <Link
          to={to}
          className={`group flex items-center justify-between gap-4 overflow-hidden rounded-lg border p-4 card-hover sm:p-5 lg:flex-col lg:items-start lg:justify-between lg:p-7 ${split.panel} ${skin.border} ${skin.surface}`}
        >
          <span className="min-w-0">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">
              Collection
            </span>
            <span
              className={`mt-2 block truncate font-display text-xl font-semibold sm:text-2xl lg:whitespace-normal lg:text-3xl ${skin.text}`}
            >
              {row.name}
            </span>
            {count > 0 && (
              <span className={`mt-1 block text-sm ${skin.muted}`}>
                {count} {count === 1 ? 'product' : 'products'}
              </span>
            )}
          </span>
          {peek.length >= 2 && (
            <span aria-hidden className="hidden w-full grid-cols-2 gap-2 lg:mt-6 lg:grid">
              {peek.map((photo, index) => (
                <span
                  key={photo.id}
                  className={`relative aspect-square overflow-hidden rounded-lg ${skin.well}`}
                >
                  <MediaImg
                    sizes="120px"
                    src={photo.url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {more > 0 && index === peek.length - 1 && (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-semibold text-white">
                      +{more}
                    </span>
                  )}
                </span>
              ))}
            </span>
          )}
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-brand lg:mt-6">
            Shop all
            <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <ul
          className={`grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-8 ${split.products}`}
        >
          {shown.map((product, index) => (
            <ProductCard
              key={product.id}
              store={store}
              product={product}
              skin={skin}
              // A phone fits two; the third joins from `sm`, where the row
              // widens to three.
              className={index === 2 ? 'hidden sm:flex' : ''}
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
  const soldOut = product.stockQuantity <= 0
  return (
    <Band id="shop-products" tone={tone} skin={skin}>
      <article
        // Unboxed, like the product page: the photo is its own rounded tile
        // and the words sit beside it — a frame round it read as a form.
        className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-14"
      >
        <Link
          to={to}
          className={`relative block aspect-square overflow-hidden rounded-lg ${skin.well}`}
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
        </Link>

        <div className="flex flex-col pt-6 sm:pt-8 lg:pt-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            {product.category.name}
          </p>
          <h2
            className={`mt-1 font-display text-xl font-semibold leading-tight sm:text-3xl ${skin.text}`}
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
              className={`mt-4 line-clamp-4 whitespace-pre-line text-base leading-relaxed ${skin.muted}`}
            >
              {plainLetters(product.description)}
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
              className={buttonClass({
                variant: 'primary',
                size: 'lg',
                className: 'mt-6 w-full sm:w-auto sm:self-start',
              })}
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

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  formatPrice,
  publicStoreApi,
  storeCategoryUrl,
  storeProductUrl,
  type FooterLocation,
  type OptionValues,
  type PublicProductDetail,
  type PublicStore,
} from '../../features/stores/storesApi'
import {
  StorePageShell,
  usePublicStore,
} from '../../features/publicStore/PublicStoreLayout'
import { usePageTitle } from '../../../shared/usePageTitle'
import { trackViewContent } from '../../../shared/analytics/metaPixel'
import { ProductGrid } from '../../features/publicStore/ProductCard'
import { ShareButton } from '../../features/publicStore/ShareButton'
import {
  PurchaseActions,
  StockBadge,
  type PurchaseTarget,
} from '../../features/publicStore/CartControls'
import {
  Breadcrumb,
  SectionHeading,
  type Crumb,
} from '../../features/publicStore/ListingControls'
import {
  parseDescription,
  type ProductSpec,
} from '../../features/publicStore/productDescription'
import { OptionPicker } from '../../features/publicStore/OptionPicker'
import { DeliveryCheck } from '../../features/publicStore/DeliveryCheck'
import {
  findVariant,
  firstSellableSelection,
} from '../../features/stores/productOptions'
import {
  BoxIcon,
  CardIcon,
  CheckIcon,
  ChevronRightIcon,
  LockIcon,
  MapPinIcon,
  ReturnIcon,
  ShieldCheckIcon,
  TruckIcon,
} from '../../layout/icons'
import type { Skin } from '../../features/publicStore/storeTheme'

/**
 * `/store/{storeSlug}/product/{productSlug}` — full product detail.
 *
 * This is the **only** place variants are rendered. Listings deliberately show
 * just a count ("4 Variants Available"), because a store with large variant
 * matrices would otherwise blow up the grid; the customer picks Colour /
 * Storage / Size / RAM here, and price, stock and the cart line all follow the
 * selected option.
 *
 * Page structure: breadcrumb · gallery + purchase card · highlights ·
 * description · specifications · you-may-also-like, plus a sticky purchase bar
 * once the buy card scrolls away. Everything below the fold is built from what
 * the seller actually entered — specs come from the product's own
 * `specifications` rows, falling back to "Label: value" lines read out of the
 * description (see `productDescription.ts`); highlights from the description's
 * bullets; the **delivery check** (`DeliveryCheck`) from the product's
 * effective pincode rule against the customer's default address; and the
 * delivery/trust block from the store's own shipping, payment and policy
 * settings. Nothing on this page is invented: there is no review system yet,
 * so no rating is shown.
 */
/** Highlights shown inside the purchase card before the section takes over. */
const CARD_HIGHLIGHTS = 4

export function StoreProductPage() {
  const { store, skin } = usePublicStore()
  const { productSlug = '' } = useParams()
  const [product, setProduct] = useState<
    PublicProductDetail | null | undefined
  >(undefined)
  usePageTitle(product?.name, store.name)

  useEffect(() => {
    let cancelled = false
    setProduct(undefined)
    publicStoreApi
      .getProduct(store.slug, productSlug)
      .then((found) => {
        if (!cancelled) setProduct(found)
      })
      .catch(() => {
        if (!cancelled) setProduct(null)
      })
    return () => {
      cancelled = true
    }
  }, [store.slug, productSlug])

  if (product === undefined) {
    return (
      <StorePageShell>
        <ProductSkeleton skin={skin} />
      </StorePageShell>
    )
  }

  if (product === null) {
    return (
      <StorePageShell>
        <div className="py-16 text-center">
          <h1 className={`font-heading text-lg font-bold ${skin.text}`}>
            Product not found
          </h1>
          <p className={`mt-2 text-sm ${skin.muted}`}>
            It may be out of stock or no longer available.
          </p>
          <Link
            to={`/store/${store.slug}`}
            className={`mt-5 inline-flex h-10 items-center rounded-md px-5 text-sm font-bold ${skin.cta}`}
          >
            Back to store
          </Link>
        </div>
      </StorePageShell>
    )
  }

  return <ProductDetail key={product.id} product={product} />
}

function ProductDetail({ product }: { product: PublicProductDetail }) {
  const { store, skin } = usePublicStore()
  // One value per option type; the variant is whatever combination that
  // resolves to. Starts on the first in-stock combination. A simple product
  // has no option types, so the selection is empty and no variant matches —
  // its price/stock come from the product itself.
  const [selection, setSelection] = useState<OptionValues>(() =>
    firstSellableSelection(product.variants),
  )
  const variant = findVariant(product.variants, product.optionTypes, selection)
  const hasOptions = product.optionTypes.length > 0
  // The sticky bar appears only once the real purchase card is out of view.
  const buyCardRef = useRef<HTMLDivElement>(null)
  const buyCardVisible = useIsVisible(buyCardRef)

  const price = variant ? variant.price : (product.price ?? '0')
  // Options but no matching variant means the chosen combination is not sold:
  // stock 0 disables purchase, and the picker says why.
  const stock = variant
    ? variant.stockQuantity
    : hasOptions
      ? 0
      : product.stockQuantity
  const cover = product.media.find((m) => m.type === 'IMAGE')?.url ?? null
  const content = useMemo(
    () => parseDescription(product.description),
    [product.description],
  )

  const target: PurchaseTarget = {
    storeSlug: store.slug,
    storeName: store.name,
    productId: product.id,
    productSlug: product.slug,
    variantId: variant?.id ?? null,
    name: product.name,
    variantName: variant?.name ?? null,
    imageUrl: cover,
    price,
    stock,
  }

  // Meta ViewContent — one per product view. `ProductDetail` is keyed by
  // product id, so it mounts fresh for each product; switching variant is the
  // same view and deliberately does not re-fire.
  useEffect(() => {
    trackViewContent(
      { id: product.slug, price: Number(price), quantity: 1 },
      product.name,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per product, not per variant
  }, [product.slug])

  const trail: Crumb[] = [
    ...(product.category.parent
      ? [
          {
            label: product.category.parent.name,
            to: storeCategoryUrl(store.slug, product.category.parent.slug),
          },
        ]
      : []),
    {
      label: product.category.name,
      to: storeCategoryUrl(store.slug, product.category.slug),
    },
    { label: product.name },
  ]

  return (
    // Bottom padding clears the sticky purchase bar (which shows on every
    // breakpoint once the buy card scrolls away), so it never covers content.
    <StorePageShell className="pb-24">
      <Breadcrumb
        storeSlug={store.slug}
        storeName={store.name}
        trail={trail}
        skin={skin}
      />

      <div className="grid items-start gap-6 lg:grid-cols-2 lg:gap-10">
        {/* The gallery stays put while the long right column scrolls. */}
        <div className="lg:sticky lg:top-[5.5rem]">
          <MediaGallery product={product} />
        </div>

        {/* Everything about buying lives inside one card. */}
        <div
          ref={buyCardRef}
          className={`rounded-xl border p-5 sm:p-6 ${skin.border} ${skin.surface}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to={storeCategoryUrl(store.slug, product.category.slug)}
                className={`text-xs font-semibold uppercase tracking-wide transition-colors hover:text-brand ${skin.muted}`}
              >
                {product.category.name}
              </Link>
              <h1
                className={`mt-1 font-heading text-3xl font-semibold leading-tight sm:text-4xl ${skin.text}`}
              >
                {product.name}
              </h1>
            </div>
            {/* Share this product — permanent public URL, opens directly. */}
            <ShareButton
              title={`${product.name} · ${store.name}`}
              url={`${window.location.origin}${storeProductUrl(store.slug, product.slug)}`}
              skin={skin}
              ariaLabel="Share this product"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="font-heading text-3xl font-bold text-brand">
              {formatPrice(price)}
            </span>
            <StockBadge stock={stock} />
            {variant && (
              <span className={`text-xs font-semibold ${skin.muted}`}>
                {variant.name}
              </span>
            )}
          </div>

          {/* The first few selling points earn their place next to the price;
              the rest (if any) get the full section below. */}
          {content.highlights.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {content.highlights.slice(0, CARD_HIGHLIGHTS).map((line, i) => (
                <li key={i} className={`flex gap-2 text-sm ${skin.muted}`}>
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Option pickers — the reason this page exists. One per dimension. */}
          <OptionPicker
            optionTypes={product.optionTypes}
            variants={product.variants}
            selection={selection}
            onChange={setSelection}
            skin={skin}
          />
          {hasOptions && !variant && (
            <p className={`mt-3 text-sm font-medium ${skin.muted}`}>
              This combination isn’t available — try another option.
            </p>
          )}

          <div className="mt-6">
            <PurchaseActions target={target} skin={skin} />
          </div>

          {/* Does it reach the customer's pincode? Checked against their
              default address (or a pincode they typed) the moment the page
              opens, so a product outside their area says so before they add
              it to the cart. */}
          <DeliveryCheck store={store} product={product} skin={skin} />

          <DeliveryInfo store={store} skin={skin} />
          <TrustBadges store={store} skin={skin} />
        </div>
      </div>

      {/* Only when the card preview didn't already show them all — the same
          bullets twice on one screen reads as padding, not detail. */}
      {content.highlights.length > CARD_HIGHLIGHTS && (
        <PageSection title="Product Highlights" skin={skin}>
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {content.highlights.map((line, i) => (
              <li
                key={i}
                className={`flex gap-2.5 rounded-lg border p-3 text-sm ${skin.border} ${skin.surface} ${skin.text}`}
              >
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </PageSection>
      )}

      {content.paragraphs.length > 0 && (
        <PageSection title="Description" skin={skin}>
          <div
            className={`max-w-3xl space-y-3 text-sm leading-relaxed ${skin.muted}`}
          >
            {content.paragraphs.map((paragraph, i) => (
              <p key={i} className="whitespace-pre-line">
                {paragraph}
              </p>
            ))}
          </div>
        </PageSection>
      )}

      <PageSection title="Specifications" skin={skin}>
        <SpecTable
          specs={content.specs}
          product={product}
          store={store}
          skin={skin}
        />
      </PageSection>

      {product.related.length > 0 && (
        <PageSection title="You May Also Like" skin={skin}>
          <ProductGrid store={store} products={product.related} skin={skin} />
        </PageSection>
      )}

      {!buyCardVisible && (
        <StickyBuyBar
          product={product}
          price={price}
          image={cover}
          target={target}
          skin={skin}
        />
      )}
    </StorePageShell>
  )
}

/** Below-the-fold section: heading + content, evenly spaced. */
function PageSection({
  title,
  skin,
  children,
}: {
  title: string
  skin: Skin
  children: React.ReactNode
}) {
  return (
    <section className="mt-12">
      <SectionHeading title={title} skin={skin} />
      <div className="mt-4">{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Delivery, returns and trust — built from the STORE's own settings
// ---------------------------------------------------------------------------

/**
 * What the customer needs to know before buying, taken from the seller's
 * Shipping / Payments / Footer-policy settings — never a fabricated courier
 * estimate. (Shipping is free platform-wide today: the order service charges
 * a flat 0 until the shipping-rules feature lands — update this line with it.)
 */
function DeliveryInfo({ store, skin }: { store: PublicStore; skin: Skin }) {
  const mode = store.shipping.mode
  const delivers = mode === 'DELIVERY' || mode === 'BOTH'
  const pickup = mode === 'PICKUP' || mode === 'BOTH'
  const pickupAt = pickup ? primaryLocation(store) : null
  const policies = store.footer.policies

  return (
    <ul className={`mt-6 space-y-3 border-t pt-5 text-sm ${skin.border}`}>
      {delivers && (
        <InfoRow
          icon={<TruckIcon className="h-5 w-5" />}
          title="Free delivery"
          skin={skin}
        >
          Delivered to your address — no shipping charges at checkout.
        </InfoRow>
      )}

      {pickup && (
        <InfoRow
          icon={<MapPinIcon className="h-5 w-5" />}
          title="Store pickup available"
          skin={skin}
        >
          {pickupAt
            ? `Collect from ${pickupAt.label ? `${pickupAt.label} — ` : ''}${pickupAt.address}`
            : 'Choose pickup at checkout.'}
        </InfoRow>
      )}

      {store.payments.acceptCod && (
        <InfoRow
          icon={<CardIcon className="h-5 w-5" />}
          title="Cash on delivery"
          skin={skin}
        >
          Pay when your order arrives.
        </InfoRow>
      )}

      {policies.returns && (
        <InfoRow
          icon={<ReturnIcon className="h-5 w-5" />}
          title="Returns & refunds"
          skin={skin}
        >
          <PolicyLink url={policies.returns}>
            Read the return &amp; refund policy
          </PolicyLink>
        </InfoRow>
      )}

      {policies.shipping && !policies.returns && (
        <InfoRow
          icon={<ReturnIcon className="h-5 w-5" />}
          title="Shipping policy"
          skin={skin}
        >
          <PolicyLink url={policies.shipping}>
            Read the shipping policy
          </PolicyLink>
        </InfoRow>
      )}
    </ul>
  )
}

function InfoRow({
  icon,
  title,
  skin,
  children,
}: {
  icon: React.ReactNode
  title: string
  skin: Skin
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-brand">{icon}</span>
      <div className="min-w-0">
        <p className={`font-semibold ${skin.text}`}>{title}</p>
        <p className={skin.muted}>{children}</p>
      </div>
    </li>
  )
}

/** Policy links are external URLs until dedicated policy pages land. */
function PolicyLink({
  url,
  children,
}: {
  url: string
  children: React.ReactNode
}) {
  const internal = url.startsWith('/')
  if (internal) {
    return (
      <Link to={url} className="font-semibold text-brand hover:underline">
        {children}
      </Link>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className="font-semibold text-brand hover:underline"
    >
      {children}
    </a>
  )
}

/** Reassurance strip — every badge reflects a real setting of this store. */
function TrustBadges({ store, skin }: { store: PublicStore; skin: Skin }) {
  const badges: { icon: React.ReactNode; label: string }[] = [
    { icon: <LockIcon className="h-4 w-4" />, label: 'Secure checkout' },
    {
      icon: <ShieldCheckIcon className="h-4 w-4" />,
      label: `Sold by ${store.name}`,
    },
  ]
  if (store.footer.policies.returns) {
    badges.push({
      icon: <ReturnIcon className="h-4 w-4" />,
      label: 'Easy returns',
    })
  }
  if (store.payments.acceptOnlinePayment) {
    badges.push({
      icon: <CardIcon className="h-4 w-4" />,
      label: 'UPI · Cards · Netbanking',
    })
  }

  return (
    <ul className={`mt-5 grid grid-cols-2 gap-2 border-t pt-4 ${skin.border}`}>
      {badges.map((badge) => (
        <li
          key={badge.label}
          className={`flex items-center gap-2 text-xs font-semibold ${skin.muted}`}
        >
          <span className="shrink-0 text-brand">{badge.icon}</span>
          <span className="truncate">{badge.label}</span>
        </li>
      ))}
    </ul>
  )
}

function primaryLocation(store: PublicStore): FooterLocation | null {
  const locations = store.footer.locations
  if (locations.length === 0) return null
  return locations.find((l) => l.isPrimary) ?? locations[0]!
}

// ---------------------------------------------------------------------------
// Specifications
// ---------------------------------------------------------------------------

/**
 * The product's specification rows — the seller's real `specifications` when
 * they have any, otherwise the "Label: value" lines parsed out of the
 * description — plus the catalog facts the page already knows. A store that
 * fills in neither still gets a useful table instead of an empty section.
 */
function SpecTable({
  specs,
  product,
  store,
  skin,
}: {
  specs: ProductSpec[]
  product: PublicProductDetail
  store: PublicStore
  skin: Skin
}) {
  // Real specification rows win; the description heuristic is the fallback
  // for products whose seller has not filled any in.
  const rows: ProductSpec[] =
    product.specifications.length > 0
      ? [...product.specifications]
      : [...specs]
  const path = product.category.parent
    ? `${product.category.parent.name} › ${product.category.name}`
    : product.category.name
  rows.push({ label: 'Category', value: path })
  // One row per option type ("Size: S, M, L") — what the product comes in.
  for (const type of product.optionTypes) {
    rows.push({ label: type.name, value: type.values.join(', ') })
  }
  rows.push({
    label: 'Availability',
    value: product.stockQuantity > 0 ? 'In stock' : 'Out of stock',
  })
  rows.push({ label: 'Sold by', value: store.name })

  return (
    <div className={`overflow-hidden rounded-xl border ${skin.border}`}>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={`${row.label}-${i}`}
              className={i % 2 === 0 ? '' : 'bg-surface-alt'}
            >
              <th
                scope="row"
                className={`w-2/5 px-4 py-2.5 text-left align-top font-semibold ${skin.muted}`}
              >
                {row.label}
              </th>
              <td className={`px-4 py-2.5 align-top ${skin.text}`}>
                {row.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sticky purchase bar
// ---------------------------------------------------------------------------

/**
 * Follows the customer down the page once the purchase card scrolls away —
 * on a phone this is the whole buy experience below the fold, on desktop it
 * keeps price and CTA one tap away through the specs and related rows.
 */
function StickyBuyBar({
  product,
  price,
  image,
  target,
  skin,
}: {
  product: PublicProductDetail
  price: string
  image: string | null
  target: PurchaseTarget
  skin: Skin
}) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t px-4 py-3 backdrop-blur sm:px-6 lg:px-10 ${skin.border} bg-bg/95`}
    >
      <div className="mx-auto flex w-full max-w-[1920px] items-center gap-3">
        <div
          className={`hidden h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md sm:flex ${skin.well}`}
        >
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <BoxIcon className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${skin.text}`}>
            {product.name}
          </p>
          <p className="font-heading text-base font-bold text-brand">
            {formatPrice(price)}
            {target.variantName && (
              <span className={`ml-2 text-xs font-normal ${skin.muted}`}>
                {target.variantName}
              </span>
            )}
          </p>
        </div>
        <div className="flex w-[16rem] max-w-[60%] shrink-0 gap-2">
          <PurchaseActions target={target} skin={skin} compact />
        </div>
      </div>
    </div>
  )
}

/** True while `ref`'s element intersects the viewport (used to gate the bar). */
function useIsVisible<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
): boolean {
  // Starts visible so the bar never flashes before the first observation.
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting ?? true),
      { rootMargin: '-80px 0px 0px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return visible
}

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

/**
 * Gallery — main viewer plus a thumbnail rail when there is more than one
 * item (vertical beside the image on desktop, a scrollable strip below it on
 * phones). Images and the optional video share the rail (the video thumb shows
 * a play glyph); the empty state keeps the icon frame so photoless products
 * still render a stable layout. Thumbs are lazy-loaded.
 *
 * Interactions: **hover-zoom** on desktop (pointer-anchored, mouse only — a
 * magnifier that follows a finger is useless), **swipe** between items on
 * touch, arrow buttons, and a position counter. Video is never zoomed.
 */
function MediaGallery({ product }: { product: PublicProductDetail }) {
  const { skin } = usePublicStore()
  const media = product.media
  const [index, setIndex] = useState(0)
  const active = media[index] ?? media[0] ?? null
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  const touchStart = useRef<number | null>(null)

  useEffect(() => {
    setIndex(0)
  }, [product.id])

  if (!active?.url) {
    return (
      <div
        className={`flex aspect-square items-center justify-center rounded-xl border ${skin.border} ${skin.well}`}
      >
        <BoxIcon className="h-20 w-20" />
      </div>
    )
  }

  const step = (delta: number) =>
    setIndex((current) => (current + delta + media.length) % media.length)

  const isImage = active.type === 'IMAGE'

  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row">
      {media.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:max-h-[34rem] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:pb-0">
          {media.map((item, i) => (
            <li key={item.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={
                  item.type === 'VIDEO'
                    ? 'Play product video'
                    : (item.altText ?? `Show image ${i + 1}`)
                }
                aria-pressed={i === index}
                className={`relative block h-16 w-16 overflow-hidden rounded-md border transition duration-200 lg:h-20 lg:w-20 ${
                  i === index
                    ? 'border-brand ring-2 ring-brand/40'
                    : `${skin.border} opacity-70 hover:opacity-100 hover:border-brand`
                }`}
              >
                {item.type === 'VIDEO' ? (
                  <span
                    className={`flex h-full w-full items-center justify-center ${skin.well}`}
                  >
                    {/* Play glyph — the rail never autoloads video frames. */}
                    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                      <path d="M8 5.5v13l11-6.5-11-6.5z" />
                    </svg>
                  </span>
                ) : (
                  item.url && (
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  )
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div
        className={`group relative flex aspect-square flex-1 items-center justify-center overflow-hidden rounded-xl border ${skin.border} ${skin.well}`}
        onTouchStart={(e) => {
          touchStart.current = e.touches[0]?.clientX ?? null
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current
          const end = e.changedTouches[0]?.clientX
          touchStart.current = null
          if (start === null || end === undefined || media.length < 2) return
          const delta = end - start
          if (Math.abs(delta) > 45) step(delta < 0 ? 1 : -1)
        }}
      >
        {active.type === 'VIDEO' ? (
          <video
            key={active.id}
            src={active.url}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full bg-black object-contain"
          />
        ) : (
          <img
            src={active.url}
            alt={active.altText ?? product.name}
            decoding="async"
            onPointerMove={(e) => {
              // Mouse only: a magnifier anchored to a fingertip is unusable.
              if (e.pointerType !== 'mouse') return
              const box = e.currentTarget.getBoundingClientRect()
              setZoom({
                x: ((e.clientX - box.left) / box.width) * 100,
                y: ((e.clientY - box.top) / box.height) * 100,
              })
            }}
            onPointerLeave={() => setZoom(null)}
            style={
              zoom
                ? {
                    transform: 'scale(1.9)',
                    transformOrigin: `${zoom.x}% ${zoom.y}%`,
                  }
                : undefined
            }
            className="h-full w-full object-contain transition-transform duration-200 ease-out"
          />
        )}

        {media.length > 1 && (
          <>
            <GalleryArrow direction="prev" onClick={() => step(-1)} skin={skin} />
            <GalleryArrow direction="next" onClick={() => step(1)} skin={skin} />
            <span
              className={`pointer-events-none absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[11px] font-semibold ${skin.surface} ${skin.muted}`}
            >
              {index + 1} / {media.length}
            </span>
          </>
        )}

        {isImage && (
          <span
            className={`pointer-events-none absolute bottom-3 left-3 hidden rounded-full px-2.5 py-1 text-[11px] font-semibold lg:block ${skin.surface} ${skin.muted} ${
              zoom ? 'opacity-0' : 'opacity-100'
            } transition-opacity`}
          >
            Hover to zoom
          </span>
        )}
      </div>
    </div>
  )
}

function GalleryArrow({
  direction,
  onClick,
  skin,
}: {
  direction: 'prev' | 'next'
  onClick: () => void
  skin: Skin
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous image' : 'Next image'}
      className={`absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 ${
        direction === 'prev' ? 'left-3' : 'right-3'
      } ${skin.border} ${skin.surface} ${skin.text}`}
    >
      <ChevronRightIcon
        className={`h-4 w-4 ${direction === 'prev' ? 'rotate-180' : ''}`}
      />
    </button>
  )
}

/** First-paint placeholder — same two-column shape as the loaded page. */
function ProductSkeleton({ skin }: { skin: Skin }) {
  return (
    <div className="grid animate-pulse gap-6 lg:grid-cols-2 lg:gap-10">
      <div className={`aspect-square rounded-xl ${skin.well}`} />
      <div className={`space-y-4 rounded-xl border p-6 ${skin.border} ${skin.surface}`}>
        <div className="h-3 w-24 rounded-full bg-surface-alt" />
        <div className="h-8 w-3/4 rounded-md bg-surface-alt" />
        <div className="h-6 w-32 rounded-md bg-surface-alt" />
        <div className="h-3 w-full rounded-full bg-surface-alt" />
        <div className="h-3 w-5/6 rounded-full bg-surface-alt" />
        <div className="h-11 w-full rounded-md bg-surface-alt" />
        <div className="h-11 w-full rounded-md bg-surface-alt" />
      </div>
    </div>
  )
}

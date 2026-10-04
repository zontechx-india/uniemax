import { useEffect, useMemo, useState } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote } from '../../../shared/ui/form'
import { describeDeliveryRule } from '../../features/stores/deliveryRules'
import { describeShippingOverride } from '../../features/stores/shippingRates'
import { formatPrice, storeCatalogApi } from '../../features/stores/storesApi'
import type {
  StoreCategory,
  StoreProduct,
  StoreProductMerchandising,
} from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import {
  BoxIcon,
  PencilIcon,
  PlusIcon,
  RupeeIcon,
  SearchIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
} from '../../layout/icons'
import { Dialog } from '../../../shared/ui/Dialog'
import { CameraIcon } from './media/icons'
import { ShopNotLiveNudge } from './StorePublishCard'
import { ActionRow } from './ui/ActionRow'
import { BigSwitch } from './ui/BigSwitch'
import { EmptyState } from './ui/EmptyState'
import { GlassCard } from './ui/GlassCard'
import { PageHeader } from './ui/PageHeader'
import { StatusPill } from './ui/StatusPill'
import { showToast } from './ui/Toast'
import { CategoryChooserSheet } from './ui/CategoryChooserSheet'
import { ProductWizard } from './products/wizard/ProductWizard'
import type { StepKey } from './products/wizard/shared'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { MediaImg } from '../../../shared/media/MediaImg'

/**
 * Products section of the store manage page.
 *
 * Adding and editing both happen in the `ProductWizard` — one question at a
 * time, a draft on the server from the first step, a progress bar and a
 * review step that says exactly what a product still needs. The list shows
 * each product with how complete it is and what to do next, so a shop can be
 * filled gradually instead of in one sitting. Until the store has a category
 * this section is a gate pointing to Categories (a product must belong to
 * one — the backend enforces the same rule).
 *
 * Each product is one `ActionRow`: photo, name, a Showing / Hidden / Draft
 * pill, price and stock, the one next thing to do, then **Edit**, a labelled
 * Showing / Hidden switch, and "⋯ More" for the rarer actions (home-page
 * placement, delete) — so Delete is never a stray tap beside the switch.
 * Search and filter chips appear once a shop has enough products to need them.
 */
export function StoreProductsPage() {
  const { store, onStoreChange, refreshStore } = useManagedStore()

  const [categories, setCategories] = useState<StoreCategory[] | null>(null)
  const [products, setProducts] = useState<StoreProduct[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The wizard, when open: a new product (null) or an existing one. */
  const [wizard, setWizard] = useState<{
    product: StoreProduct | null
    startAt: StepKey
  } | null>(null)
  const [toDelete, setToDelete] = useState<StoreProduct | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [placementId, setPlacementId] = useState<string | null>(null)
  /** A merchandising change awaiting confirmation (nothing written yet). */
  const [pendingFlag, setPendingFlag] = useState<PendingFlag | null>(null)
  const [savingFlag, setSavingFlag] = useState(false)
  const [query, setQuery] = useState('')
  // First-category chooser for a shop with none yet (see the gate below).
  const [choosingFirst, setChoosingFirst] = useState(false)
  const [addingFirst, setAddingFirst] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      storeCatalogApi.listCategories(store.id),
      storeCatalogApi.listProducts(store.id),
    ])
      .then(([cats, prods]) => {
        if (cancelled) return
        setCategories(cats)
        setProducts(prods)
      })
      .catch((err) => {
        if (cancelled) return
        setCategories([])
        setProducts([])
        setError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [store.id])

  /**
   * A product came back from the server — new or changed. Besides swapping
   * (or prepending) the row, keep the local category product-counts honest.
   */
  const absorb = (updated: StoreProduct) => {
    const before = (products ?? []).find((p) => p.id === updated.id) ?? null
    setProducts((list) =>
      before
        ? (list ?? []).map((p) => (p.id === updated.id ? updated : p))
        : [updated, ...(list ?? [])],
    )
    const from = before?.category.id ?? null
    if (from !== updated.category.id) {
      setCategories((cats) =>
        (cats ?? []).map((c) =>
          c.id === from
            ? { ...c, productCount: c.productCount - 1 }
            : c.id === updated.category.id
              ? { ...c, productCount: c.productCount + 1 }
              : c,
        ),
      )
    }
  }

  /**
   * Silent re-fetch. Saving a product family changes OTHER products' rows
   * (their `groups`), and deleting a member can dissolve a family — the
   * server is the only one who knows.
   */
  const reload = () => {
    storeCatalogApi
      .listProducts(store.id)
      .then(setProducts)
      .catch(() => {})
  }

  const toggleActive = async (product: StoreProduct, next: boolean) => {
    setError(null)
    setTogglingId(product.id)
    try {
      absorb(
        await storeCatalogApi.updateProduct(store.id, product.id, {
          isActive: next,
        }),
      )
      refreshStore?.()
      showToast(next ? 'Showing in your shop' : 'Hidden from your shop')
    } catch (err) {
      setError(toApiError(err).message)
      showToast('Could not save — try again', 'danger')
    } finally {
      setTogglingId(null)
    }
  }

  /**
   * Merchandising flags are confirmed before they are written: each one
   * changes what customers see on the live storefront, so the checkbox only
   * *requests* a change and nothing is saved until the dialog is accepted.
   */
  const confirmMerchandising = async () => {
    if (!pendingFlag) return
    const { product, key, next } = pendingFlag
    setError(null)
    setSavingFlag(true)
    try {
      absorb(
        await storeCatalogApi.updateProduct(store.id, product.id, {
          [key]: next,
        }),
      )
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setPendingFlag(null)
      setSavingFlag(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await storeCatalogApi.deleteProduct(store.id, toDelete.id)
      setProducts((list) => (list ?? []).filter((p) => p.id !== toDelete.id))
      setCategories((cats) =>
        (cats ?? []).map((c) =>
          c.id === toDelete.category.id
            ? { ...c, productCount: c.productCount - 1 }
            : c,
        ),
      )
      if (toDelete.groups.length > 0) reload()
      refreshStore?.()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setToDelete(null)
      setDeleting(false)
    }
  }

  if (categories === null || products === null) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading products">
        <PageHeader icon={BoxIcon} title="Products" description="Loading your products…" />
        <div className="glass-card h-64 animate-pulse rounded-glass" />
      </div>
    )
  }

  // Setup sequence gate: no categories yet → products can't be added.
  if (categories.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader icon={BoxIcon} title="Products" description="Everything you sell." />
        <GlassCard>
          <EmptyState
            icon={TagIcon}
            title="First, choose what you sell"
            description='Pick a category for your products — type what you sell, like "saree" or "atta". Then you can add products.'
            action={
              <Button type="button" size="lg" onClick={() => setChoosingFirst(true)}>
                <PlusIcon className="h-5 w-5" />
                Choose what you sell
              </Button>
            }
          />
        </GlassCard>
        {/* Choose → the category is added → straight into the first product.
            The seller never has to find the Categories page first. */}
        <CategoryChooserSheet
          open={choosingFirst}
          onClose={() => setChoosingFirst(false)}
          addedIds={new Set()}
          busy={addingFirst}
          onPick={(node) => {
            setAddingFirst(true)
            storeCatalogApi
              .createCategory(store.id, { categoryId: node.id })
              .then(() => storeCatalogApi.listCategories(store.id))
              .then((list) => {
                setCategories(list)
                refreshStore?.()
                setChoosingFirst(false)
                showToast(`${node.name} added`)
                setWizard({ product: null, startAt: 'basics' })
              })
              .catch((err) => showToast(toApiError(err).message, 'danger'))
              .finally(() => setAddingFirst(false))
          }}
        />
      </div>
    )
  }

  const drafts = products.filter((p) => p.isDraft).length

  return (
    <div className="space-y-4">
      {/* Only once there is something live to see — a new seller with no
          products isn't nagged about publishing. */}
      {!wizard && products.some((p) => !p.isDraft && p.isActive) && (
        <ShopNotLiveNudge store={store} onStoreChange={onStoreChange} />
      )}
      <PageHeader
        icon={BoxIcon}
        title="Products"
        description="What your customers see and buy. Add one in a few small steps — you can stop any time."
        action={
          !wizard && products.length > 0 ? (
            <Button
              type="button"
              size="lg"
              onClick={() => setWizard({ product: null, startAt: 'basics' })}
            >
              <PlusIcon className="h-5 w-5" />
              Add product
            </Button>
          ) : undefined
        }
      />

      {error && (
        <div className="max-w-md">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {wizard ? (
        <ProductWizard
          key={wizard.product?.id ?? 'new'}
          storeId={store.id}
          categories={categories}
          product={wizard.product}
          startAt={wizard.startAt}
          onProductChange={absorb}
          onCatalogChanged={reload}
          onCategoriesChange={(list) => {
            setCategories(list)
            refreshStore?.()
          }}
          onClose={() => {
            setWizard(null)
            refreshStore?.()
          }}
        />
      ) : products.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={BoxIcon}
            title="Add your first product"
            description="A name, a photo and a price are enough to start selling. You can add more details later."
            steps={[
              { icon: TagIcon, label: 'Name it' },
              { icon: CameraIcon, label: 'Add a photo' },
              { icon: RupeeIcon, label: 'Set a price' },
            ]}
            action={
              <Button
                type="button"
                size="lg"
                onClick={() => setWizard({ product: null, startAt: 'basics' })}
              >
                <PlusIcon className="h-5 w-5" />
                Add my first product
              </Button>
            }
          />
        </GlassCard>
      ) : (
        <ProductList
          products={products}
          categories={categories}
          drafts={drafts}
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          togglingId={togglingId}
          onEdit={(product, startAt) => setWizard({ product, startAt })}
          onToggleActive={toggleActive}
          onDelete={setToDelete}
          onPlacement={setPlacementId}
        />
      )}

      {/* Home-page placement for one product, as a sheet of switches. */}
      <PlacementSheet
        product={products.find((p) => p.id === placementId) ?? null}
        onClose={() => setPlacementId(null)}
        onRequest={(product, key, next) => setPendingFlag({ product, key, next })}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this product?"
        description={
          toDelete ? (
            <>
              <span className="font-medium text-fg">{toDelete.name}</span>{' '}
              will be removed from your shop
              {toDelete.variants.length > 0 &&
                ` along with its ${toDelete.variants.length} choice${toDelete.variants.length === 1 ? '' : 's'}`}
              . You cannot undo this.
            </>
          ) : null
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />

      {/* Merchandising changes are live on the storefront, so they confirm. */}
      <ConfirmDialog
        open={pendingFlag !== null}
        title={
          pendingFlag
            ? merchandisingMeta(pendingFlag.key).title(pendingFlag.next)
            : ''
        }
        description={
          pendingFlag
            ? merchandisingMeta(pendingFlag.key).body(
                pendingFlag.next,
                pendingFlag.product.name,
              )
            : null
        }
        confirmLabel={pendingFlag?.next ? 'Yes, apply' : 'Yes, remove'}
        tone="neutral"
        busy={savingFlag}
        onConfirm={confirmMerchandising}
        onCancel={() => setPendingFlag(null)}
      />
    </div>
  )
}

type Filter = 'all' | 'showing' | 'hidden' | 'draft'

const FILTERS: { key: Filter; label: string; test: (p: StoreProduct) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'showing', label: 'Showing', test: (p) => !p.isDraft && p.isActive },
  { key: 'hidden', label: 'Hidden', test: (p) => !p.isDraft && !p.isActive },
  { key: 'draft', label: 'Not finished', test: (p) => p.isDraft },
]

/** Search + filter chips (once there are enough products), then the rows. */
function ProductList({
  products,
  categories,
  drafts,
  query,
  onQuery,
  filter,
  onFilter,
  togglingId,
  onEdit,
  onToggleActive,
  onDelete,
  onPlacement,
}: {
  products: StoreProduct[]
  categories: StoreCategory[]
  drafts: number
  query: string
  onQuery: (q: string) => void
  filter: Filter
  onFilter: (f: Filter) => void
  togglingId: string | null
  onEdit: (product: StoreProduct, startAt: StepKey) => void
  onToggleActive: (product: StoreProduct, next: boolean) => void
  onDelete: (product: StoreProduct) => void
  onPlacement: (id: string) => void
}) {
  // A handful of products needs no search; past that, finding one does.
  const searchable = products.length > 5
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const test = FILTERS.find((f) => f.key === filter)!.test
    return products.filter((p) => test(p) && (!q || p.name.toLowerCase().includes(q)))
  }, [products, query, filter])

  return (
    <div className="space-y-3">
      {searchable && (
        <div className="space-y-2.5">
          <label className="relative block">
            <span className="sr-only">Search products</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search your products"
              className="glass-inset h-field w-full rounded-xl pr-4 pl-11 text-[15px] text-fg outline-none placeholder:text-muted focus:border-accent"
            />
          </label>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]" role="group" aria-label="Show">
            {FILTERS.map(({ key, label, test }) => {
              const count = products.filter(test).length
              if (key !== 'all' && count === 0) return null
              const on = filter === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onFilter(key)}
                  className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-4 text-[14px] font-semibold transition ${
                    on
                      ? 'border-brand bg-brand text-brand-contrast'
                      : 'border-line bg-surface/70 text-fg hover:border-brand/50'
                  }`}
                >
                  {label}
                  <span className={on ? 'opacity-85' : 'text-muted'}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {drafts > 0 && filter === 'all' && !query && (
        <p className="text-hint text-muted">
          {drafts} product{drafts === 1 ? ' is' : 's are'} not finished — open one
          and add what it still needs to put it in your shop.
        </p>
      )}

      {visible.length === 0 ? (
        <p className="glass-card rounded-glass px-4 py-8 text-center text-[15px] text-muted">
          No products match. Try another word{filter !== 'all' ? ' or tap “All”' : ''}.
        </p>
      ) : (
        <ul className="glass-card divide-y divide-line overflow-hidden rounded-glass">
          {visible.map((product) => (
            <li key={product.id}>
              <ProductRow
                product={product}
                categories={categories}
                toggling={togglingId === product.id}
                onEdit={(startAt) => onEdit(product, startAt)}
                onToggleActive={(next) => onToggleActive(product, next)}
                onDelete={() => onDelete(product)}
                onPlacement={() => onPlacement(product.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Copy + metadata for one merchandising flag. */
function merchandisingMeta(key: keyof StoreProductMerchandising) {
  return MERCHANDISING.find((entry) => entry.key === key)!
}

/** "Men › Clothing › T-Shirts" — the full path of a product's category. */
function categoryPath(
  category: StoreProduct['category'],
  categories: StoreCategory[],
): string {
  const names = [category.name]
  let cursor = categories.find((c) => c.id === category.parentId)
  while (cursor) {
    names.unshift(cursor.name)
    cursor = categories.find((c) => c.id === cursor?.parentId)
  }
  return names.join(' › ')
}

/**
 * What a product sells for. Options with differing prices render as a range
 * ("₹89,900 – ₹1,09,999"); anything else is a single figure.
 */
function priceLabel(product: StoreProduct): string {
  if (product.price === null || Number(product.price) === 0) return 'No price yet'
  if (product.priceMax && product.priceMax !== product.price) {
    return `${formatPrice(product.price)} – ${formatPrice(product.priceMax)}`
  }
  return formatPrice(product.price)
}

/** The next thing to do for a product, in the seller's words, and where. */
const NEXT_STEP: Record<
  StoreProduct['completeness']['missing'][number],
  { label: string; step: StepKey }
> = {
  photo: { label: 'add a photo', step: 'photos' },
  price: { label: 'set a price', step: 'pricing' },
  description: { label: 'add a description', step: 'details' },
  specifications: { label: 'add product facts', step: 'details' },
}

function ProductRow({
  product,
  categories,
  toggling,
  onEdit,
  onToggleActive,
  onDelete,
  onPlacement,
}: {
  product: StoreProduct
  categories: StoreCategory[]
  toggling: boolean
  /** Opens the wizard on this product, at the given step. */
  onEdit: (startAt: StepKey) => void
  onToggleActive: (next: boolean) => void
  onDelete: () => void
  /** Opens the home-page placement sheet. */
  onPlacement: () => void
}) {
  const cover = product.media.find((m) => m.type === 'IMAGE')?.url ?? null
  const stock = product.stockQuantity
  const nextUp = product.completeness.missing[0]
    ? NEXT_STEP[product.completeness.missing[0]]
    : null
  const complete = product.completeness.percent
  const placed = MERCHANDISING.filter(({ key }) => key !== 'hideFromSearch' && product[key])

  return (
    <ActionRow
      leading={
        cover ? (
          <MediaImg
            sizes="56px"
            src={cover}
            alt=""
            className={`h-14 w-14 rounded-xl border border-line object-cover ${
              product.isActive ? '' : 'opacity-60'
            }`}
          />
        ) : (
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-xl ${
              product.isActive ? 'bg-brand-soft text-brand' : 'bg-fg/5 text-muted'
            }`}
          >
            <BoxIcon className="h-6 w-6" />
          </span>
        )
      }
      title={product.name}
      status={
        product.isDraft ? (
          <StatusPill tone="pending">Not finished</StatusPill>
        ) : product.isActive ? (
          <StatusPill tone="success">Showing</StatusPill>
        ) : (
          <StatusPill>Hidden</StatusPill>
        )
      }
      meta={
        <>
          <span className="font-semibold text-fg">{priceLabel(product)}</span>
          {' · '}
          {stock > 0 ? `${stock} in stock` : 'Sold out'}
          {product.hasVariants &&
            ` · ${product.variants.length} choice${product.variants.length === 1 ? '' : 's'}`}
          <span className="block truncate">{categoryPath(product.category, categories)}</span>
        </>
      }
      below={
        <div className="space-y-2">
          {/* How complete, and the one next thing — the nudge that fills a shop gradually. */}
          {nextUp && (
            <button
              type="button"
              onClick={() => onEdit(nextUp.step)}
              className="flex min-h-tap w-full items-center gap-2.5 rounded-xl bg-pending-soft px-3 text-left transition hover:brightness-95"
            >
              <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-fg/10">
                <span
                  className="block h-full rounded-full bg-pending"
                  style={{ width: `${complete}%` }}
                />
              </span>
              <span className="text-hint font-semibold text-pending">
                {complete}% done — next: {nextUp.label}
              </span>
            </button>
          )}
          {(product.groups.length > 0 ||
            placed.length > 0 ||
            product.hideFromSearch ||
            product.deliveryRule ||
            product.shippingOverride ||
            !product.codAvailable) && (
            <div className="flex flex-wrap gap-1.5">
              {product.groups.map((group) => (
                <StatusPill key={group.id} tone="brand" dot={false}>
                  {group.optionName}: {group.value}
                </StatusPill>
              ))}
              {placed.map(({ key, label }) => (
                <StatusPill key={key} tone="brand" dot={false}>
                  <StarIcon className="h-3 w-3" filled />
                  {label}
                </StatusPill>
              ))}
              {product.hideFromSearch && <StatusPill dot={false}>Not in search</StatusPill>}
              {/* Its own delivery settings, where they differ from the shop's. */}
              {product.deliveryRule && (
                <StatusPill dot={false} wrap>
                  Delivery: {describeDeliveryRule(product.deliveryRule)}
                </StatusPill>
              )}
              {product.shippingOverride && (
                <StatusPill dot={false} wrap>
                  Shipping: {describeShippingOverride(product.shippingOverride)}
                </StatusPill>
              )}
              {!product.codAvailable && <StatusPill dot={false}>No cash on delivery</StatusPill>}
            </div>
          )}
        </div>
      }
      primary={
        <button
          type="button"
          onClick={() => onEdit('basics')}
          aria-label={`Edit ${product.name}`}
          className={buttonClass({ variant: 'ring', size: 'md', className: 'px-4' })}
        >
          <PencilIcon className="h-4 w-4" />
          Edit
        </button>
      }
      toggle={
        <BigSwitch
          checked={product.isActive}
          disabled={toggling}
          label={`Show ${product.name} in your shop`}
          onText="Showing"
          offText="Hidden"
          onChange={onToggleActive}
        />
      }
      menu={[
        {
          label: 'Home page & search',
          icon: StarIcon,
          note: 'Feature it on your home page, or hide it from search',
          onSelect: onPlacement,
        },
        {
          label: 'Delete product',
          icon: TrashIcon,
          note: 'Removes it from your shop for good',
          danger: true,
          onSelect: onDelete,
        },
      ]}
      menuTitle={product.name}
    />
  )
}

/** A merchandising change the owner has requested but not yet confirmed. */
interface PendingFlag {
  product: StoreProduct
  key: keyof StoreProductMerchandising
  next: boolean
}

/**
 * The merchandising flags. Each maps to exactly ONE storefront section, so a
 * flag never affects any other row — `title`/`body` spell that out in the
 * confirmation so the owner knows precisely what changes.
 */
const MERCHANDISING: {
  key: keyof StoreProductMerchandising
  label: string
  hint: string
  title: (on: boolean) => string
  body: (on: boolean, name: string) => string
}[] = [
  {
    key: 'isFeatured',
    label: 'Featured',
    hint: 'In the “Featured Products” row on your home page',
    title: (on) => (on ? 'Add to Featured Products?' : 'Remove from Featured Products?'),
    body: (on, name) =>
      on
        ? `${name} will appear in the Featured Products row on your storefront homepage.`
        : `${name} will no longer appear in the Featured Products row.`,
  },
  {
    key: 'isBestSeller',
    label: 'Best Seller',
    hint: 'In the “Best Sellers” row on your home page',
    title: (on) => (on ? 'Add to Best Sellers?' : 'Remove from Best Sellers?'),
    body: (on, name) =>
      on
        ? `${name} will appear in the Best Sellers row on your storefront homepage.`
        : `${name} will no longer appear in the Best Sellers row.`,
  },
  {
    key: 'isNewArrival',
    label: 'New Arrival',
    hint: 'In the “New Arrivals” row on your home page',
    title: (on) => (on ? 'Add to New Arrivals?' : 'Remove from New Arrivals?'),
    body: (on, name) =>
      on
        ? `${name} will appear in the New Arrivals row on your storefront homepage.`
        : `${name} will no longer appear in the New Arrivals row.`,
  },
  {
    key: 'hideFromSearch',
    label: 'Hide from Search',
    hint: 'Customers can still find it in its category',
    title: (on) => (on ? 'Hide from search?' : 'Show in search again?'),
    body: (on, name) =>
      on
        ? `${name} will stop appearing in search results. Customers can still reach it by browsing its category.`
        : `${name} will appear in search results again.`,
  },
]

/**
 * Where one product shows on the storefront — the home-page rows and search
 * — as a sheet of labelled switches (it was an inline panel of 16px
 * checkboxes). Each switch *requests* a change; nothing is written until the
 * owner confirms, so the switches always show the saved state.
 */
function PlacementSheet({
  product,
  onClose,
  onRequest,
}: {
  product: StoreProduct | null
  onClose: () => void
  onRequest: (
    product: StoreProduct,
    key: keyof StoreProductMerchandising,
    next: boolean,
  ) => void
}) {
  return (
    <Dialog
      open={product !== null}
      title="Home page & search"
      subtitle={product?.name}
      onClose={onClose}
      flush
    >
      {product && (
        <ul className="divide-y divide-line pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {MERCHANDISING.map(({ key, label, hint }) => (
            <li key={key} className="flex items-center gap-3 px-5 py-3">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-fg">{label}</span>
                <span className="block text-hint text-muted">{hint}</span>
              </span>
              <BigSwitch
                checked={product[key]}
                label={label}
                showState={false}
                onChange={(next) => onRequest(product, key, next)}
              />
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  )
}

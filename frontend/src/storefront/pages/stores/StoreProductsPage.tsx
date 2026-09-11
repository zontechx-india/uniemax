import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
  ChevronDownIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
} from '../../layout/icons'
import { ActiveSwitch } from './ActiveSwitch'
import { ProductWizard } from './products/wizard/ProductWizard'
import type { StepKey } from './products/wizard/shared'

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
 */
export function StoreProductsPage() {
  const { store } = useManagedStore()

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
    } catch (err) {
      setError(toApiError(err).message)
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
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setToDelete(null)
      setDeleting(false)
    }
  }

  if (categories === null || products === null) {
    return (
      <div>
        <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
          Products
        </h2>
        <p className="mt-4 text-sm text-muted">Loading products…</p>
      </div>
    )
  }

  // Setup sequence gate: no categories yet → products can't be added.
  if (categories.length === 0) {
    return (
      <div>
        <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
          Products
        </h2>

        <div className="mt-4 flex flex-col items-center rounded-lg bg-surface-alt px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-surface text-brand shadow-floating">
            <TagIcon className="h-6 w-6" />
          </div>
          <p className="mt-4 text-sm font-medium text-fg">
            Add a category first
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted">
            Every product lives inside a category. Create your first
            category, then come back here to add products.
          </p>
          <Link
            to="../categories"
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90"
          >
            <PlusIcon className="h-4 w-4" />
            Add a Category
          </Link>
        </div>
      </div>
    )
  }

  const drafts = products.filter((p) => p.isDraft).length

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
            Products
          </h2>
          <p className="mt-1 text-sm text-muted">
            What your customers browse and buy. Add a product in a few small
            steps — you can stop any time and finish later.
          </p>
        </div>
        {!wizard && (
          <button
            type="button"
            onClick={() => setWizard({ product: null, startAt: 'basics' })}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90"
          >
            <PlusIcon className="h-4 w-4" />
            Add Product
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 max-w-md">
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
          onClose={() => setWizard(null)}
        />
      ) : (
        <div className="mt-4">
          {products.length === 0 ? (
            <div className="flex flex-col items-center rounded-lg bg-surface-alt px-6 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-surface text-brand shadow-floating">
                <BoxIcon className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-medium text-fg">No products yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                Add your first product — a name, a category and a photo are
                enough to start.
              </p>
            </div>
          ) : (
            <>
              {drafts > 0 && (
                <p className="mb-2 text-xs text-muted">
                  {drafts} draft{drafts === 1 ? '' : 's'} not yet published —
                  open one and finish its checklist to make it live.
                </p>
              )}
              <ul className="divide-y divide-line rounded-lg border border-line">
                {products.map((product) => (
                  <ProductRow
                    key={product.id}
                    product={product}
                    categories={categories}
                    placementOpen={placementId === product.id}
                    onTogglePlacement={() =>
                      setPlacementId((id) => (id === product.id ? null : product.id))
                    }
                    onEdit={(startAt) => setWizard({ product, startAt })}
                    toggling={togglingId === product.id}
                    onToggleActive={(next) => toggleActive(product, next)}
                    onDelete={() => setToDelete(product)}
                    onMerchandising={(key, next) =>
                      setPendingFlag({ product, key, next })
                    }
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete product?"
        description={
          toDelete ? (
            <>
              <span className="font-medium text-fg">{toDelete.name}</span>{' '}
              will be removed from your store
              {toDelete.variants.length > 0 &&
                ` along with its ${toDelete.variants.length} variant${toDelete.variants.length === 1 ? '' : 's'}`}
              .
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
  specifications: { label: 'add specifications', step: 'details' },
}

function ProductRow({
  product,
  categories,
  placementOpen,
  onTogglePlacement,
  onEdit,
  toggling,
  onToggleActive,
  onDelete,
  onMerchandising,
}: {
  product: StoreProduct
  categories: StoreCategory[]
  placementOpen: boolean
  onTogglePlacement: () => void
  /** Opens the wizard on this product, at the given step. */
  onEdit: (startAt: StepKey) => void
  toggling: boolean
  onToggleActive: (next: boolean) => void
  onDelete: () => void
  /** Requests a merchandising change — confirmed by the page before saving. */
  onMerchandising: (
    key: keyof StoreProductMerchandising,
    next: boolean,
  ) => void
}) {
  const cover = product.media.find((m) => m.type === 'IMAGE')?.url ?? null
  const stock = product.stockQuantity
  const nextUp = product.completeness.missing[0]
    ? NEXT_STEP[product.completeness.missing[0]]
    : null
  const complete = product.completeness.percent

  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3">
        {cover ? (
          <img
            src={cover}
            alt=""
            className={`h-10 w-10 shrink-0 rounded-md border border-line object-cover ${
              product.isActive ? '' : 'opacity-60'
            }`}
          />
        ) : (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
              product.isActive
                ? 'bg-brand/10 text-brand'
                : 'bg-surface-alt text-muted'
            }`}
          >
            <BoxIcon className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-semibold ${
              product.isActive ? 'text-fg' : 'text-muted'
            }`}
          >
            {product.name}
            {product.isDraft ? (
              <span className="ml-1.5 rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                Draft
              </span>
            ) : (
              !product.isActive && (
                <span className="ml-1.5 rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Disabled
                </span>
              )
            )}
            {product.groups.map((group) => (
              <span
                key={group.id}
                className="ml-1.5 rounded-sm bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand"
                title={`One of ${group.members.length} "${group.optionName}" products`}
              >
                {group.optionName} · {group.value}
              </span>
            ))}
          </p>
          <p className="truncate text-xs text-muted">
            {categoryPath(product.category, categories)} · {priceLabel(product)}
            {' · '}
            {stock > 0 ? `${stock} in stock` : 'Out of stock'}
            {product.hasVariants &&
              ` · ${product.variants.length} variant${product.variants.length === 1 ? '' : 's'}`}
            {product.deliveryRule && (
              <> · Delivery: {describeDeliveryRule(product.deliveryRule)}</>
            )}
            {product.shippingOverride && (
              <> · Shipping: {describeShippingOverride(product.shippingOverride)}</>
            )}
            {!product.codAvailable && <> · No COD</>}
          </p>
          {/* How complete, and the one next thing — the nudge that fills a shop gradually. */}
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-alt">
              <div
                className={`h-full rounded-full ${complete === 100 ? 'bg-success' : 'bg-brand'}`}
                style={{ width: `${complete}%` }}
              />
            </div>
            <span className="text-[11px] text-muted">
              {complete}%
              {nextUp && (
                <>
                  {' — '}
                  <button
                    type="button"
                    onClick={() => onEdit(nextUp.step)}
                    className="font-semibold text-brand hover:underline"
                  >
                    {nextUp.label}
                  </button>
                </>
              )}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onTogglePlacement}
          aria-expanded={placementOpen}
          className={`hidden shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition sm:flex ${
            placementOpen
              ? 'bg-accent/15 text-accent'
              : 'text-muted hover:bg-surface-alt'
          }`}
        >
          Placement
          <ChevronDownIcon
            className={`h-3.5 w-3.5 transition-transform ${placementOpen ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          type="button"
          onClick={() => onEdit('basics')}
          className="rounded-md p-2 text-muted transition hover:bg-surface-alt hover:text-fg"
          aria-label={`Edit ${product.name}`}
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <ActiveSwitch
          checked={product.isActive}
          disabled={toggling}
          label={`${product.isActive ? 'Disable' : 'Publish'} ${product.name}`}
          onChange={onToggleActive}
        />
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-2 text-muted transition hover:bg-danger/10 hover:text-danger"
          aria-label={`Delete ${product.name}`}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {placementOpen && (
        <MerchandisingPanel product={product} onRequest={onMerchandising} />
      )}
    </li>
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
    label: 'Featured Product',
    hint: 'Featured Products row',
    title: (on) => (on ? 'Add to Featured Products?' : 'Remove from Featured Products?'),
    body: (on, name) =>
      on
        ? `${name} will appear in the Featured Products row on your storefront homepage.`
        : `${name} will no longer appear in the Featured Products row.`,
  },
  {
    key: 'isBestSeller',
    label: 'Best Seller',
    hint: 'Best Sellers row',
    title: (on) => (on ? 'Add to Best Sellers?' : 'Remove from Best Sellers?'),
    body: (on, name) =>
      on
        ? `${name} will appear in the Best Sellers row on your storefront homepage.`
        : `${name} will no longer appear in the Best Sellers row.`,
  },
  {
    key: 'isNewArrival',
    label: 'New Arrival',
    hint: 'New Arrivals row',
    title: (on) => (on ? 'Add to New Arrivals?' : 'Remove from New Arrivals?'),
    body: (on, name) =>
      on
        ? `${name} will appear in the New Arrivals row on your storefront homepage.`
        : `${name} will no longer appear in the New Arrivals row.`,
  },
  {
    key: 'hideFromSearch',
    label: 'Hide from Search',
    hint: 'Still browsable in its category',
    title: (on) => (on ? 'Hide from search?' : 'Show in search again?'),
    body: (on, name) =>
      on
        ? `${name} will stop appearing in search results. Customers can still reach it by browsing its category.`
        : `${name} will appear in search results again.`,
  },
]

/**
 * Merchandising controls — which storefront sections this product appears in.
 * Each checkbox *requests* a change; nothing is written until the owner
 * confirms, so the boxes always show the saved state.
 */
function MerchandisingPanel({
  product,
  onRequest,
}: {
  product: StoreProduct
  onRequest: (key: keyof StoreProductMerchandising, next: boolean) => void
}) {
  return (
    <div className="border-t border-line bg-surface-alt/40 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">
        Storefront placement
      </p>
      <div className="mt-2.5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {MERCHANDISING.map(({ key, label, hint }) => (
          <label key={key} className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={product[key]}
              onChange={(e) => onRequest(key, e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fg">{label}</span>
              <span className="block text-[11px] text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

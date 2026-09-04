import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, Select, TextField } from '../../../shared/ui/form'
import { formatPrice, storeCatalogApi } from '../../features/stores/storesApi'
import type {
  StoreCategory,
  StoreProduct,
  StoreProductCreateInput,
  StoreProductMerchandising,
  StoreProductVariant,
  StoreVariantInput,
} from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import {
  BoxIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  PencilIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
} from '../../layout/icons'
import { ActiveSwitch } from './ActiveSwitch'
import { MediaBoard } from './media/MediaBoard'
import { usePendingMedia } from './media/usePendingMedia'
import { ProductMediaManager } from './ProductMediaManager'

/**
 * Products section of the store manage page — the product + variants end
 * of the hierarchy Store → Category → Subcategory (optional) → Product →
 * Variants. Until the store has at least one category, this section is a
 * gate pointing to Categories (a product must belong to a category — root
 * or subcategory; the backend enforces the same rule). Each product row can
 * be edited in place (name / category / description via the pencil) and
 * expands into a variant manager (add / edit / enable-disable / delete
 * variants).
 */
export function StoreProductsPage() {
  const { store } = useManagedStore()

  const [categories, setCategories] = useState<StoreCategory[] | null>(null)
  const [products, setProducts] = useState<StoreProduct[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [toDelete, setToDelete] = useState<StoreProduct | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  /** Product whose details (name / category / description) are being edited. */
  const [editingId, setEditingId] = useState<string | null>(null)

  // The edit form and the variants panel of a row are mutually exclusive —
  // opening one closes the other, so a row never stacks both panels.
  const toggleExpand = (productId: string) => {
    setExpandedId((id) => (id === productId ? null : productId))
    setEditingId((id) => (id === productId ? null : id))
  }

  const toggleEdit = (productId: string) => {
    setEditingId((id) => (id === productId ? null : productId))
    setExpandedId((id) => (id === productId ? null : id))
  }
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

  const replaceProduct = (updated: StoreProduct) =>
    setProducts((list) =>
      (list ?? []).map((p) => (p.id === updated.id ? updated : p)),
    )

  /**
   * A details edit was saved. Besides swapping the row, keep the local
   * category product-counts honest when the product moved category.
   */
  const productSaved = (before: StoreProduct, updated: StoreProduct) => {
    replaceProduct(updated)
    if (before.category.id !== updated.category.id) {
      setCategories((cats) =>
        (cats ?? []).map((c) =>
          c.id === before.category.id
            ? { ...c, productCount: c.productCount - 1 }
            : c.id === updated.category.id
              ? { ...c, productCount: c.productCount + 1 }
              : c,
        ),
      )
    }
    setEditingId(null)
  }

  const toggleActive = async (product: StoreProduct, next: boolean) => {
    setError(null)
    setTogglingId(product.id)
    try {
      replaceProduct(
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
   * Because there is no optimistic write, a cancelled or failed change simply
   * leaves the checkbox showing the server's truth.
   */
  const confirmMerchandising = async () => {
    if (!pendingFlag) return
    const { product, key, next } = pendingFlag
    setError(null)
    setSavingFlag(true)
    try {
      replaceProduct(
        await storeCatalogApi.updateProduct(store.id, product.id, {
          [key]: next,
        }),
      )
      setPendingFlag(null)
    } catch (err) {
      setError(toApiError(err).message)
      setPendingFlag(null)
    } finally {
      setSavingFlag(false)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await storeCatalogApi.deleteProduct(store.id, toDelete.id)
      setProducts((list) => (list ?? []).filter((p) => p.id !== toDelete.id))
      setToDelete(null)
    } catch (err) {
      setError(toApiError(err).message)
      setToDelete(null)
    } finally {
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

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
            Products
          </h2>
          <p className="mt-1 text-sm text-muted">
            What your customers will browse and buy. Products with options
            (color, size, storage…) can carry variants.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90"
          >
            <PlusIcon className="h-4 w-4" />
            Add Product
          </button>
        )}
      </div>

      {showForm && (
        <AddProductForm
          storeId={store.id}
          categories={categories}
          onCreated={(product, warning) => {
            setProducts((list) => [product, ...(list ?? [])])
            setCategories((cats) =>
              (cats ?? []).map((c) =>
                c.id === product.category.id
                  ? { ...c, productCount: c.productCount + 1 }
                  : c,
              ),
            )
            // The product itself was created — a photo that failed to upload
            // must not read as a failed save, so it is reported up here
            // rather than keeping the (now duplicate-prone) form open.
            setError(warning ?? null)
            setShowForm(false)
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {error && (
        <div className="mt-4 max-w-md">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="mt-4">
        {products.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg bg-surface-alt px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-surface text-brand shadow-floating">
              <BoxIcon className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium text-fg">
              No products yet
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Add your first product — it will appear here and, once your
              store is published, to your customers.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {products.map((product) => (
              <ProductRow
                key={product.id}
                storeId={store.id}
                product={product}
                categories={categories}
                expanded={expandedId === product.id}
                onToggleExpand={() => toggleExpand(product.id)}
                editing={editingId === product.id}
                onToggleEdit={() => toggleEdit(product.id)}
                onSaved={(updated) => productSaved(product, updated)}
                toggling={togglingId === product.id}
                onToggleActive={(next) => toggleActive(product, next)}
                onDelete={() => setToDelete(product)}
                onProductChange={replaceProduct}
                onMerchandising={(key, next) =>
                  setPendingFlag({ product, key, next })
                }
                onError={setError}
              />
            ))}
          </ul>
        )}
      </div>

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

/** "Parent › Sub" label for a product's category. */
function categoryPath(
  category: StoreProduct['category'],
  categories: StoreCategory[],
): string {
  if (!category.parentId) return category.name
  const parent = categories.find((c) => c.id === category.parentId)
  return parent ? `${parent.name} › ${category.name}` : category.name
}

/**
 * What a product sells for. Options with differing prices render as a range
 * ("₹89,900 – ₹1,09,999"); anything else is a single figure.
 */
function priceLabel(product: StoreProduct): string {
  if (product.price === null) return 'No price'
  if (product.priceMax && product.priceMax !== product.price) {
    return `${formatPrice(product.price)} – ${formatPrice(product.priceMax)}`
  }
  return formatPrice(product.price)
}

function ProductRow({
  storeId,
  product,
  categories,
  expanded,
  onToggleExpand,
  editing,
  onToggleEdit,
  onSaved,
  toggling,
  onToggleActive,
  onDelete,
  onProductChange,
  onMerchandising,
  onError,
}: {
  storeId: string
  product: StoreProduct
  categories: StoreCategory[]
  expanded: boolean
  onToggleExpand: () => void
  /** Whether the details (name / category / description) form is open. */
  editing: boolean
  onToggleEdit: () => void
  /** A details edit round-tripped — the page swaps the row and closes the form. */
  onSaved: (product: StoreProduct) => void
  toggling: boolean
  onToggleActive: (next: boolean) => void
  onDelete: () => void
  onProductChange: (product: StoreProduct) => void
  /** Requests a merchandising change — confirmed by the page before saving. */
  onMerchandising: (
    key: keyof StoreProductMerchandising,
    next: boolean,
  ) => void
  onError: (message: string | null) => void
}) {
  // Price and stock are derived server-side from the variants (the unit of
  // sale), so the row just renders what the API computed.
  const hasVariants = product.hasVariants
  const stock = product.stockQuantity

  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
            product.isActive
              ? 'bg-brand/10 text-brand'
              : 'bg-surface-alt text-muted'
          }`}
        >
          <BoxIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-sm font-semibold ${
              product.isActive ? 'text-fg' : 'text-muted'
            }`}
          >
            {product.name}
          </p>
          <p className="text-xs text-muted">
            {categoryPath(product.category, categories)} ·{' '}
            {priceLabel(product)} ·{' '}
            {stock > 0 ? `${stock} in stock` : 'Out of stock'}
            {!product.isActive && (
              <span className="ml-1.5 rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                Disabled
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className={`flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
            expanded
              ? 'bg-accent/15 text-accent'
              : hasVariants
                ? 'bg-brand/10 text-brand hover:bg-brand/20'
                : 'text-muted hover:bg-surface-alt'
          }`}
        >
          {hasVariants
            ? `${product.variants.length} variant${product.variants.length === 1 ? '' : 's'}`
            : 'Variants'}
          <ChevronDownIcon
            className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          type="button"
          onClick={onToggleEdit}
          aria-expanded={editing}
          className={`rounded-md p-2 transition ${
            editing
              ? 'bg-accent/15 text-accent'
              : 'text-muted hover:bg-surface-alt hover:text-fg'
          }`}
          aria-label={`Edit ${product.name}`}
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <ActiveSwitch
          checked={product.isActive}
          disabled={toggling}
          label={`${product.isActive ? 'Disable' : 'Enable'} ${product.name}`}
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

      {editing && (
        <EditProductForm
          storeId={storeId}
          product={product}
          categories={categories}
          onSaved={onSaved}
          onCancel={onToggleEdit}
        />
      )}

      {expanded && (
        <>
          <ProductMediaManager
            storeId={storeId}
            product={product}
            onProductChange={onProductChange}
          />
          <MerchandisingPanel product={product} onRequest={onMerchandising} />
          <VariantManager
            storeId={storeId}
            product={product}
            onProductChange={onProductChange}
            onError={onError}
          />
        </>
      )}
    </li>
  )
}

/**
 * Category choices grouped by root ("Root › Sub") — shared by the add and
 * edit product forms so the two always offer the same tree.
 */
function CategoryOptions({ categories }: { categories: StoreCategory[] }) {
  const roots = categories.filter((c) => c.parentId === null)
  const childrenOf = (rootId: string) =>
    categories.filter((c) => c.parentId === rootId)

  return (
    <>
      {roots.map((root) => {
        const subs = childrenOf(root.id)
        return subs.length === 0 ? (
          <option key={root.id} value={root.id}>
            {root.name}
          </option>
        ) : (
          <optgroup key={root.id} label={root.name}>
            <option value={root.id}>{root.name} (general)</option>
            {subs.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {root.name} › {sub.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </>
  )
}

/**
 * Edit a product's details — name, category and description. Price and stock
 * are deliberately NOT here: they live on the variants (the unit of sale) and
 * are edited in the expanded variant panel. Only changed fields are sent; an
 * emptied description is sent as `null` (cleared). The product's public URL
 * (slug) never changes on rename, so shared links keep working.
 */
function EditProductForm({
  storeId,
  product,
  categories,
  onSaved,
  onCancel,
}: {
  storeId: string
  product: StoreProduct
  categories: StoreCategory[]
  onSaved: (product: StoreProduct) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(product.name)
  const [categoryId, setCategoryId] = useState(product.category.id)
  const [description, setDescription] = useState(product.description ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const dirty =
    name.trim() !== product.name ||
    categoryId !== product.category.id ||
    description.trim() !== (product.description ?? '')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Please enter a product name.')
    if (!dirty) return onCancel()

    // Send only what changed — the endpoint is a partial PATCH.
    const patch: {
      name?: string
      categoryId?: string
      description?: string | null
    } = {}
    if (name.trim() !== product.name) patch.name = name.trim()
    if (categoryId !== product.category.id) patch.categoryId = categoryId
    if (description.trim() !== (product.description ?? '')) {
      patch.description = description.trim() ? description.trim() : null
    }

    setError(null)
    setBusy(true)
    try {
      onSaved(await storeCatalogApi.updateProduct(storeId, product.id, patch))
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 border-t border-line bg-surface-alt/40 px-4 py-4"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Product name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoFocus
          className="!bg-input"
        />
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">
            Category
          </span>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-12"
          >
            <CategoryOptions categories={categories} />
          </Select>
        </label>
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">
          Description{' '}
          <span className="font-normal text-muted">(optional)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Tell customers what this product is."
          className="w-full rounded-md border border-line bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all placeholder:text-muted focus:border-accent"
        />
      </label>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !dirty}
          className="inline-flex h-10 items-center rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="inline-flex h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
        >
          Cancel
        </button>
        <p className="text-xs text-muted">
          The product’s link stays the same after a rename.
        </p>
      </div>
    </form>
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

/**
 * Price + stock editor for a product that has no options. Those values live on
 * the product's implicit `Default` variant, so this simply patches that
 * variant — there is no product-level price to edit.
 */
function DefaultVariantEditor({
  storeId,
  productId,
  variant,
  onProductChange,
  onError,
}: {
  storeId: string
  productId: string
  variant: NonNullable<StoreProduct['defaultVariant']>
  onProductChange: (product: StoreProduct) => void
  onError: (message: string | null) => void
}) {
  const [price, setPrice] = useState(variant.price)
  const [stock, setStock] = useState(String(variant.stockQuantity))
  const [busy, setBusy] = useState(false)

  // Re-sync when the server sends back a new value (e.g. after saving).
  const [lastId, setLastId] = useState(variant.id)
  if (variant.id !== lastId) {
    setLastId(variant.id)
    setPrice(variant.price)
    setStock(String(variant.stockQuantity))
  }

  const dirty =
    price !== variant.price || stock !== String(variant.stockQuantity)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const priceValue = Number(price)
    if (!price.trim() || Number.isNaN(priceValue) || priceValue < 0) {
      return onError('Please enter a valid price.')
    }
    const stockValue = stock.trim() === '' ? 0 : Number(stock)
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      return onError('Stock must be a whole number.')
    }

    onError(null)
    setBusy(true)
    try {
      onProductChange(
        await storeCatalogApi.updateVariant(storeId, productId, variant.id, {
          price: priceValue,
          stockQuantity: stockValue,
        }),
      )
    } catch (err) {
      onError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={save}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      noValidate
    >
      <label className="block sm:w-40 sm:shrink-0">
        <span className="mb-1 block text-xs font-medium text-muted">
          Price (₹)
        </span>
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          className="h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent"
        />
      </label>
      <label className="block sm:w-28 sm:shrink-0">
        <span className="mb-1 block text-xs font-medium text-muted">Stock</span>
        <input
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          inputMode="numeric"
          className="h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !dirty}
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

/** Expanded panel under a product row: list, toggle, delete + add variants. */
function VariantManager({
  storeId,
  product,
  onProductChange,
  onError,
}: {
  storeId: string
  product: StoreProduct
  onProductChange: (product: StoreProduct) => void
  onError: (message: string | null) => void
}) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyVariantId, setBusyVariantId] = useState<string | null>(null)

  const addVariant = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return onError('Please enter a variant name.')
    const priceValue = Number(price)
    if (!price.trim() || Number.isNaN(priceValue) || priceValue < 0) {
      return onError('Please enter a price for this variant.')
    }
    const stockValue = stock.trim() === '' ? 0 : Number(stock)
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      return onError('Variant stock must be a whole number.')
    }

    onError(null)
    setBusy(true)
    try {
      onProductChange(
        await storeCatalogApi.createVariant(storeId, product.id, {
          name: name.trim(),
          price: priceValue,
          stockQuantity: stockValue,
        }),
      )
      setName('')
      setPrice('')
      setStock('')
    } catch (err) {
      onError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const toggleVariant = async (variantId: string, next: boolean) => {
    onError(null)
    setBusyVariantId(variantId)
    try {
      onProductChange(
        await storeCatalogApi.updateVariant(storeId, product.id, variantId, {
          isActive: next,
        }),
      )
    } catch (err) {
      onError(toApiError(err).message)
    } finally {
      setBusyVariantId(null)
    }
  }

  const deleteVariant = async (variantId: string) => {
    onError(null)
    setBusyVariantId(variantId)
    try {
      onProductChange(
        await storeCatalogApi.deleteVariant(storeId, product.id, variantId),
      )
    } catch (err) {
      onError(toApiError(err).message)
    } finally {
      setBusyVariantId(null)
    }
  }

  return (
    <div className="border-t border-line bg-surface-alt px-4 py-4 pl-16">
      {!product.hasVariants ? (
        <>
          {product.defaultVariant && (
            <DefaultVariantEditor
              storeId={storeId}
              productId={product.id}
              variant={product.defaultVariant}
              onProductChange={onProductChange}
              onError={onError}
            />
          )}
          <p className="mt-3 text-xs text-muted">
            This product has no options — it sells at the single price above.
            Add options like{' '}
            <span className="font-medium text-fg">Red / 128 GB</span> or{' '}
            <span className="font-medium text-fg">Size XL</span> below; the
            first one replaces that single price, and each option then carries
            its own.
          </p>
        </>
      ) : (
        <ul className="space-y-2">
          {product.variants.map((variant) => (
            <VariantRow
              key={variant.id}
              storeId={storeId}
              productId={product.id}
              variant={variant}
              busy={busyVariantId === variant.id}
              onToggle={(next) => toggleVariant(variant.id, next)}
              onDelete={() => deleteVariant(variant.id)}
              onProductChange={onProductChange}
              onError={onError}
            />
          ))}
        </ul>
      )}

      {/* Inline add-variant form */}
      <form
        onSubmit={addVariant}
        className="mt-3 flex flex-col gap-2 sm:flex-row"
        noValidate
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Variant (e.g. Red / 128 GB)"
          maxLength={60}
          className="h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price"
          inputMode="decimal"
          className="h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent sm:w-36 sm:shrink-0"
        />
        <input
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          placeholder="Stock"
          inputMode="numeric"
          className="h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent sm:w-24 sm:shrink-0"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-md bg-brand-gradient px-3.5 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          {busy ? 'Adding…' : 'Add'}
        </button>
      </form>
    </div>
  )
}

/**
 * One variant of a product — view row with a pencil that swaps it for an
 * inline editor (name, price, stock; save/cancel). Only changed fields are
 * PATCHed; the server returns the full parent product so the whole row list
 * refreshes in place.
 */
function VariantRow({
  storeId,
  productId,
  variant,
  busy,
  onToggle,
  onDelete,
  onProductChange,
  onError,
}: {
  storeId: string
  productId: string
  variant: StoreProductVariant
  /** True while a toggle/delete on this row is in flight. */
  busy: boolean
  onToggle: (next: boolean) => void
  onDelete: () => void
  onProductChange: (product: StoreProduct) => void
  onError: (message: string | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(variant.name)
  const [price, setPrice] = useState(variant.price)
  const [stock, setStock] = useState(String(variant.stockQuantity))
  const [saving, setSaving] = useState(false)

  const startEdit = () => {
    // Seed from the current server truth each time the editor opens.
    setName(variant.name)
    setPrice(variant.price)
    setStock(String(variant.stockQuantity))
    onError(null)
    setEditing(true)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return onError('Please enter a variant name.')
    const priceValue = Number(price)
    if (!String(price).trim() || Number.isNaN(priceValue) || priceValue < 0) {
      return onError('Please enter a valid price.')
    }
    const stockValue = stock.trim() === '' ? 0 : Number(stock)
    if (!Number.isInteger(stockValue) || stockValue < 0) {
      return onError('Stock must be a whole number.')
    }

    const patch: { name?: string; price?: number; stockQuantity?: number } = {}
    if (name.trim() !== variant.name) patch.name = name.trim()
    if (priceValue !== Number(variant.price)) patch.price = priceValue
    if (stockValue !== variant.stockQuantity) patch.stockQuantity = stockValue
    if (Object.keys(patch).length === 0) return setEditing(false)

    onError(null)
    setSaving(true)
    try {
      onProductChange(
        await storeCatalogApi.updateVariant(
          storeId,
          productId,
          variant.id,
          patch,
        ),
      )
      setEditing(false)
    } catch (err) {
      onError(toApiError(err).message)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <li className="rounded-md border border-accent/50 bg-surface px-3 py-2">
        <form
          onSubmit={save}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          noValidate
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
            aria-label={`${variant.name} name`}
            className="h-9 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent"
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="Price (₹)"
            aria-label={`${variant.name} price`}
            className="h-9 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent sm:w-32 sm:shrink-0"
          />
          <input
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            inputMode="numeric"
            placeholder="Stock"
            aria-label={`${variant.name} stock quantity`}
            className="h-9 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent sm:w-24 sm:shrink-0"
          />
          <div className="flex shrink-0 gap-1.5">
            <button
              type="submit"
              disabled={saving}
              className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-gradient text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
              aria-label={`Save ${variant.name}`}
            >
              <CheckIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-line text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-40"
              aria-label={`Cancel editing ${variant.name}`}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        </form>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-3 rounded-md border border-line bg-surface px-3 py-2">
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-medium ${
            variant.isActive ? 'text-fg' : 'text-muted'
          }`}
        >
          {variant.name}
        </p>
        <p className="text-xs text-muted">
          {formatPrice(variant.price)} ·{' '}
          {variant.stockQuantity > 0
            ? `${variant.stockQuantity} in stock`
            : 'Out of stock'}
        </p>
      </div>
      <button
        type="button"
        onClick={startEdit}
        disabled={busy}
        className="rounded-md p-1.5 text-muted transition hover:bg-surface-alt hover:text-fg disabled:opacity-40"
        aria-label={`Edit ${variant.name}`}
      >
        <PencilIcon className="h-4 w-4" />
      </button>
      <ActiveSwitch
        checked={variant.isActive}
        disabled={busy}
        label={`${variant.isActive ? 'Disable' : 'Enable'} ${variant.name}`}
        onChange={onToggle}
      />
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-40"
        aria-label={`Delete ${variant.name}`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </li>
  )
}

function AddProductForm({
  storeId,
  categories,
  onCreated,
  onCancel,
}: {
  storeId: string
  categories: StoreCategory[]
  /** `warning` = the product saved, but some media didn't upload. */
  onCreated: (product: StoreProduct, warning?: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  /**
   * Name is the one field with its own inline error: it is required and it is
   * the first thing entered, so pointing at the field beats a form-level note
   * the user has to map back to a control.
   */
  const [nameError, setNameError] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [description, setDescription] = useState('')
  /**
   * Explicit product shape, driven by the "This product has variants"
   * checkbox. Toggling only swaps which fields are shown — the values on the
   * hidden side are kept, so switching back and forth never loses input.
   */
  const [hasVariants, setHasVariants] = useState(false)
  const [variantRows, setVariantRows] = useState<
    { name: string; price: string; stock: string }[]
  >([{ name: '', price: '', stock: '' }])
  /**
   * Photos and the optional video, held in memory: they can only be uploaded
   * once the product has an id, so they wait here and go up right after
   * create. At least one photo is required — a storefront card with a
   * placeholder where the product should be sells nothing.
   */
  const { driver: mediaDriver, photos, video } = usePendingMedia()
  const [photoError, setPhotoError] = useState<string | null>(null)
  /**
   * Media upload progress — drives the submit button label. `null` until the
   * product is created, so the button says "Adding…" for the create call and
   * only then starts counting photos (and the video last).
   */
  const [uploaded, setUploaded] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const setRow = (
    index: number,
    patch: Partial<{ name: string; price: string; stock: string }>,
  ) =>
    setVariantRows((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    )

  const addRow = () =>
    setVariantRows((rows) => [...rows, { name: '', price: '', stock: '' }])

  const removeRow = (index: number) =>
    setVariantRows((rows) =>
      // Always leave one row standing so the section is never empty.
      rows.length === 1
        ? [{ name: '', price: '', stock: '' }]
        : rows.filter((_, i) => i !== index),
    )

  /** Turning the checkbox on with no rows yet gives the user one to fill. */
  const toggleHasVariants = (next: boolean) => {
    setHasVariants(next)
    setError(null)
    if (next && variantRows.length === 0) addRow()
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setNameError('Product name is required.')
      return setError('Please enter a product name.')
    }
    setNameError(null)
    if (!categoryId) return setError('Please choose a category.')
    if (photos.length === 0) {
      setPhotoError('Add at least one photo of the product.')
      return setError('Please add at least one product photo.')
    }
    setPhotoError(null)

    // Only the fields for the selected shape are validated or submitted —
    // whatever sits on the hidden side is ignored, never sent.
    let payload: StoreProductCreateInput

    if (hasVariants) {
      const variants: StoreVariantInput[] = []
      for (const [index, row] of variantRows.entries()) {
        const label = row.name.trim() || `Variant ${index + 1}`
        if (!row.name.trim()) return setError(`${label} needs a name.`)

        const vPrice = Number(row.price)
        if (!row.price.trim() || Number.isNaN(vPrice) || vPrice < 0) {
          return setError(`${label} needs a valid price.`)
        }
        const vStock = Number(row.stock)
        if (!row.stock.trim() || !Number.isInteger(vStock) || vStock < 0) {
          return setError(`${label} needs a stock quantity.`)
        }
        variants.push({
          name: row.name.trim(),
          price: vPrice,
          stockQuantity: vStock,
        })
      }
      if (variants.length === 0) {
        return setError('Add at least one variant.')
      }
      const lowerNames = variants.map((v) => v.name.toLowerCase())
      if (new Set(lowerNames).size !== lowerNames.length) {
        return setError('Variant names must be unique.')
      }

      payload = { name: name.trim(), categoryId, hasVariants: true, variants }
    } else {
      const priceValue = Number(price)
      if (!price.trim() || Number.isNaN(priceValue) || priceValue < 0) {
        return setError('Please enter a valid price.')
      }
      const stockValue = Number(stock)
      if (!stock.trim() || !Number.isInteger(stockValue) || stockValue < 0) {
        return setError('Please enter a stock quantity.')
      }

      payload = {
        name: name.trim(),
        categoryId,
        hasVariants: false,
        price: priceValue,
        stockQuantity: stockValue,
      }
    }

    if (description.trim()) payload.description = description.trim()

    setError(null)
    setBusy(true)
    setUploaded(null)

    let created: StoreProduct
    try {
      created = await storeCatalogApi.createProduct(storeId, payload)
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
      return
    }

    /**
     * The product now exists — everything past this point is best-effort.
     * Media uploads one file at a time (each response is a fresh snapshot of
     * the parent product, so they must not race), and a failure never strands
     * the flow: the row still appears and the seller is told what to re-add
     * from its Photos & video panel.
     */
    let product = created
    let failedPhotos = 0
    let failedVideo = false
    if (photos.length > 0 || video) setUploaded(0)
    for (const photo of photos) {
      try {
        product = await storeCatalogApi.addProductMedia(
          storeId,
          created.id,
          photo.blob,
          photo.filename,
        )
      } catch {
        failedPhotos += 1
      }
      setUploaded((n) => (n ?? 0) + 1)
    }
    if (video) {
      try {
        product = await storeCatalogApi.addProductMedia(
          storeId,
          created.id,
          video.file,
          video.file.name,
        )
      } catch {
        failedVideo = true
      }
      setUploaded((n) => (n ?? 0) + 1)
    }

    const missing: string[] = []
    if (failedPhotos > 0) {
      missing.push(`${failedPhotos} photo${failedPhotos === 1 ? '' : 's'}`)
    }
    if (failedVideo) missing.push('the video')

    onCreated(
      product,
      missing.length > 0
        ? `“${product.name}” was added, but ${missing.join(' and ')} could not be uploaded. Open the product and use Photos & video to add ${missing.length === 1 && failedPhotos === 1 ? 'it' : 'them'} again.`
        : undefined,
    )
  }

  return (
    <form
      onSubmit={submit}
      className="mt-5 space-y-4 rounded-lg border border-line bg-surface-alt p-5"
      noValidate
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <TextField
            label={
              <>
                Product name{' '}
                <span className="text-danger" aria-hidden="true">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </>
            }
            placeholder="e.g. English Willow Bat"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (nameError && e.target.value.trim()) setNameError(null)
            }}
            onBlur={(e) =>
              setNameError(
                e.target.value.trim() ? null : 'Product name is required.',
              )
            }
            required
            aria-invalid={nameError ? true : undefined}
            maxLength={120}
            autoFocus
            className={`!bg-input ${nameError ? '!border-danger' : ''}`}
          />
          {nameError && (
            <p className="mt-1.5 text-xs font-medium text-danger">
              {nameError}
            </p>
          )}
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-muted">
            Category
          </span>
          <Select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-12"
          >
            <CategoryOptions categories={categories} />
          </Select>
        </label>
        {/* Simple products only — with variants on, each one prices itself,
            so a second price here would be dead weight. Values are kept in
            state while hidden, so toggling back restores them. */}
        {!hasVariants && (
          <>
            <TextField
              label="Price (₹)"
              placeholder="e.g. 4999"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              className="!bg-input"
            />
            <TextField
              label="Stock quantity"
              placeholder="e.g. 20"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              inputMode="numeric"
              className="!bg-input"
            />
          </>
        )}
      </div>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">
          Description{' '}
          <span className="font-normal text-muted">(optional)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-md border border-line bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition-all placeholder:text-muted focus:border-accent"
        />
      </label>

      <MediaBoard
        driver={mediaDriver}
        disabled={busy}
        error={photos.length === 0 ? photoError : null}
        preview={{
          name: name.trim(),
          price: price.trim() ? `₹${price.trim()}` : null,
        }}
      />

      {/* Product shape switch — the one control that decides where price and
          stock are entered. */}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={hasVariants}
          onChange={(e) => toggleHasVariants(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand)]"
        />
        <span className="text-sm">
          <span className="font-medium text-fg">
            This product has variants
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            Tick this when the product comes in options like color, size or
            storage — each option then sets its own price and stock.
          </span>
        </span>
      </label>

      {hasVariants && (
        <div>
          <span className="mb-2 block text-sm font-medium text-muted">
            Variants
          </span>
          <div className="space-y-2">
            {variantRows.map((row, index) => (
              <div key={index} className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={row.name}
                  onChange={(e) => setRow(index, { name: e.target.value })}
                  placeholder="Variant name (e.g. 128 GB)"
                  maxLength={60}
                  aria-label={`Variant ${index + 1} name`}
                  className="h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent"
                />
                <input
                  value={row.price}
                  onChange={(e) => setRow(index, { price: e.target.value })}
                  placeholder="Price (₹)"
                  inputMode="decimal"
                  aria-label={`Variant ${index + 1} price`}
                  className="h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent sm:w-36 sm:shrink-0"
                />
                <input
                  value={row.stock}
                  onChange={(e) => setRow(index, { stock: e.target.value })}
                  placeholder="Stock"
                  inputMode="numeric"
                  aria-label={`Variant ${index + 1} stock quantity`}
                  className="h-10 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent sm:w-24 sm:shrink-0"
                />
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-danger/10 hover:text-danger"
                  aria-label={`Remove variant ${index + 1}`}
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRow}
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-3 py-2 text-xs font-semibold text-muted transition hover:text-fg"
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add variant
          </button>
          <p className="mt-2 text-xs text-muted">
            Every variant needs a name, price and stock. Listings show the
            cheapest one as a “from” price.
          </p>
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          {!busy
            ? 'Add Product'
            : uploaded === null
              ? 'Adding…'
              : uploaded < photos.length
                ? `Uploading photo ${uploaded + 1} of ${photos.length}…`
                : 'Uploading video…'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-11 rounded-md border border-line bg-surface px-5 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

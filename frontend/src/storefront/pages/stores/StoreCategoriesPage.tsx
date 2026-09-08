import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { taxonomyApi } from '../../../shared/categories/taxonomyApi'
import type { CategoryNode } from '../../../shared/categories/taxonomyApi'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, Select } from '../../../shared/ui/form'
import { storeCatalogApi } from '../../features/stores/storesApi'
import type {
  StoreCategory,
  StoreCategoryInput,
} from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import {
  ChevronDownIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
} from '../../layout/icons'
import { ActiveSwitch } from './ActiveSwitch'

/**
 * Categories section of the store manage page — first step of the hierarchy
 * Store → Category → Subcategory (optional) → Product → Variants. Products
 * can only be added once at least one category exists.
 *
 * A category is CHOSEN from the platform taxonomy, never typed. Two selects —
 * category, then an optional subcategory — are the whole form: it is the
 * shortest path to a correct answer, and it makes one shop's catalog
 * comparable with every other shop's by construction. Picking a subcategory
 * creates its parent shelf too, so "Electronics › Mobiles" is one action.
 *
 * Shelves created before this rule keep the free text a seller typed — often a
 * brand ("KTM") or a tier ("Pro Edition"), neither of which is a category.
 * Those stay exactly as they are; re-pointing one at the taxonomy is an admin
 * action, so nothing here can rewrite a shop's existing navigation.
 */
export function StoreCategoriesPage() {
  const { store } = useManagedStore()

  const [categories, setCategories] = useState<StoreCategory[] | null>(null)
  const [taxonomy, setTaxonomy] = useState<CategoryNode[] | null>(null)
  const [rootId, setRootId] = useState('')
  const [subId, setSubId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<StoreCategory | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Which roots are expanded. Long catalogs collapse by default so the list
  // stays scannable; the choice is remembered per store.
  const expandKey = `storefront.categories.expanded.${store.id}`
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(
        `storefront.categories.expanded.${store.id}`,
      )
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : [])
    } catch {
      return new Set<string>()
    }
  })

  const persistExpanded = (next: Set<string>) => {
    setExpanded(next)
    try {
      localStorage.setItem(expandKey, JSON.stringify([...next]))
    } catch {
      /* storage unavailable — expansion just won't persist */
    }
  }

  const toggleExpanded = (rootId: string) => {
    const next = new Set(expanded)
    if (next.has(rootId)) next.delete(rootId)
    else next.add(rootId)
    persistExpanded(next)
  }

  useEffect(() => {
    let cancelled = false
    taxonomyApi
      .tree()
      .then((nodes) => {
        if (!cancelled) setTaxonomy(nodes)
      })
      .catch(() => {
        if (!cancelled) setTaxonomy([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const reload = () =>
    storeCatalogApi
      .listCategories(store.id)
      .then(setCategories)
      .catch((err) => setError(toApiError(err).message))

  useEffect(() => {
    let cancelled = false
    storeCatalogApi
      .listCategories(store.id)
      .then((list) => {
        if (!cancelled) setCategories(list)
      })
      .catch((err) => {
        if (!cancelled) {
          setCategories([])
          setError(toApiError(err).message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [store.id])

  const roots = (categories ?? []).filter((c) => c.parentId === null)
  const childrenOf = (parent: string) =>
    (categories ?? []).filter((c) => c.parentId === parent)

  /** Categories already on the shelf list — shown but not selectable again. */
  const claimed = new Set(
    (categories ?? []).map((c) => c.categoryId).filter(Boolean) as string[],
  )
  const taken = (nodeId: string) => claimed.has(nodeId)
  const subOptions =
    (taxonomy ?? []).find((n) => n.id === rootId)?.children ?? []

  const nestedRoots = roots.filter((root) => childrenOf(root.id).length > 0)
  const allExpanded =
    nestedRoots.length > 0 && nestedRoots.every((root) => expanded.has(root.id))

  const toggleAll = () =>
    persistExpanded(
      allExpanded ? new Set<string>() : new Set(nestedRoots.map((r) => r.id)),
    )

  const replaceRow = (updated: StoreCategory) =>
    setCategories((list) =>
      (list ?? []).map((c) => (c.id === updated.id ? updated : c)),
    )

  const add = async (e: FormEvent) => {
    e.preventDefault()
    // The subcategory is the more specific answer, so it wins when both are set.
    const chosen = subId || rootId
    if (!chosen) return setError('Choose a category to add.')

    setError(null)
    setBusy(true)
    try {
      const category = await storeCatalogApi.createCategory(store.id, {
        categoryId: chosen,
      })
      // Refetch rather than append: picking a subcategory can create its
      // parent shelf too, and only the server knows whether it did.
      await reload()
      setRootId('')
      setSubId('')
      // Reveal the new subcategory instead of hiding it in a collapsed parent.
      if (category.parentId) {
        persistExpanded(new Set(expanded).add(category.parentId))
      }
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  /** Saves the edit panel. Returns false so it stays open on failure. */
  const saveEdit = async (
    category: StoreCategory,
    patch: StoreCategoryInput,
  ): Promise<boolean> => {
    setError(null)
    try {
      replaceRow(await storeCatalogApi.updateCategory(store.id, category.id, patch))
      return true
    } catch (err) {
      setError(toApiError(err).message)
      return false
    }
  }

  const toggleActive = async (category: StoreCategory, next: boolean) => {
    setError(null)
    setTogglingId(category.id)
    try {
      replaceRow(
        await storeCatalogApi.setCategoryActive(store.id, category.id, next),
      )
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setTogglingId(null)
    }
  }

  /**
   * Feature a root category in the storefront homepage's "Featured
   * Categories" row. With none featured the homepage falls back to showing
   * every top-level category, so this is curation rather than a requirement.
   */
  const toggleFeatured = async (category: StoreCategory, next: boolean) => {
    setError(null)
    // Optimistic — a star should flip instantly.
    setCategories((list) =>
      (list ?? []).map((c) =>
        c.id === category.id ? { ...c, isFeatured: next } : c,
      ),
    )
    try {
      replaceRow(
        await storeCatalogApi.setCategoryFeatured(store.id, category.id, next),
      )
    } catch (err) {
      setError(toApiError(err).message)
      setCategories((list) =>
        (list ?? []).map((c) => (c.id === category.id ? category : c)),
      )
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await storeCatalogApi.deleteCategory(store.id, toDelete.id)
      setCategories((list) => (list ?? []).filter((c) => c.id !== toDelete.id))
      setToDelete(null)
    } catch (err) {
      setError(toApiError(err).message)
      setToDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const renderRow = (category: StoreCategory, isSub: boolean) => {
    const subs = isSub ? [] : childrenOf(category.id)
    const isExpanded = expanded.has(category.id)
    return (
      <div key={category.id}>
        <CategoryRow
          category={category}
          isSub={isSub}
          toggling={togglingId === category.id}
          expandable={!isSub && subs.length > 0}
          isExpanded={isExpanded}
          isEditing={editingId === category.id}
          onToggleExpand={() => toggleExpanded(category.id)}
          onToggle={(next) => toggleActive(category, next)}
          {...(isSub
            ? {}
            : { onToggleFeatured: (next: boolean) => toggleFeatured(category, next) })}
          onDelete={() => setToDelete(category)}
          onEdit={() =>
            setEditingId(editingId === category.id ? null : category.id)
          }
        />
        {editingId === category.id && (
          <CategoryEditPanel
            category={category}
            isSub={isSub}
            onCancel={() => setEditingId(null)}
            onSave={async (patch) => {
              const done = await saveEdit(category, patch)
              if (done) setEditingId(null)
              return done
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Categories
      </h2>
      <p className="mt-1 text-sm text-muted">
        Choose the categories you sell in. Pick a category, then a subcategory
        if you want to be more specific — adding a subcategory adds its
        category too. Add at least one, then you can start adding products.
      </p>

      {/* Add form — two selects, no free text: a shop cannot invent a
          category, so every shelf is findable across the whole platform. */}
      <form onSubmit={add} className="mt-4 max-w-3xl" noValidate>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full">
            <label
              htmlFor="cat-root"
              className="mb-1.5 block text-sm font-medium text-fg"
            >
              Category
            </label>
            <Select
              id="cat-root"
              value={rootId}
              onChange={(e) => {
                setRootId(e.target.value)
                setSubId('')
              }}
              className="h-11"
              containerClassName="w-full"
            >
              <option value="">
                {taxonomy === null ? 'Loading…' : 'Choose a category…'}
              </option>
              {(taxonomy ?? []).map((node) => (
                <option key={node.id} value={node.id} disabled={taken(node.id)}>
                  {node.name}
                  {taken(node.id) ? ' — already added' : ''}
                </option>
              ))}
            </Select>
          </div>

          <div className="w-full">
            <label
              htmlFor="cat-sub"
              className="mb-1.5 block text-sm font-medium text-fg"
            >
              Subcategory{' '}
              <span className="font-normal text-muted">(optional)</span>
            </label>
            <Select
              id="cat-sub"
              value={subId}
              disabled={subOptions.length === 0}
              onChange={(e) => setSubId(e.target.value)}
              className="h-11"
              containerClassName="w-full"
            >
              <option value="">
                {rootId === ''
                  ? 'Choose a category first'
                  : subOptions.length === 0
                    ? 'No subcategories'
                    : 'All of this category'}
              </option>
              {subOptions.map((node) => (
                <option key={node.id} value={node.id} disabled={taken(node.id)}>
                  {node.name}
                  {taken(node.id) ? ' — already added' : ''}
                </option>
              ))}
            </Select>
          </div>

          <button
            type="submit"
            disabled={busy || !(subId || rootId)}
            className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
          >
            <PlusIcon className="h-4 w-4" />
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>

        {rootId !== '' && (
          <p className="mt-2 text-xs text-muted">
            Adding{' '}
            <span className="font-medium text-fg">
              {[
                (taxonomy ?? []).find((n) => n.id === rootId)?.name,
                subOptions.find((n) => n.id === subId)?.name,
              ]
                .filter(Boolean)
                .join(' › ')}
            </span>
          </p>
        )}
      </form>

      {error && (
        <div className="mt-4 max-w-md">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {/* Nested list: roots with their subcategories indented */}
      <div className="mt-4">
        {categories === null ? (
          <p className="text-sm text-muted">Loading categories…</p>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center rounded-lg bg-surface-alt px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-surface text-brand shadow-floating">
              <TagIcon className="h-6 w-6" />
            </div>
            <p className="mt-4 text-sm font-medium text-fg">No categories yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted">
              Add your first category above — products can only be added once a
              category exists.
            </p>
          </div>
        ) : (
          <>
            {nestedRoots.length > 0 && (
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={toggleAll}
                  className="text-xs font-semibold text-muted transition-colors hover:text-fg"
                >
                  {allExpanded ? 'Collapse all' : 'Expand all'}
                </button>
              </div>
            )}
            <ul className="divide-y divide-line rounded-lg border border-line">
              {roots.map((root) => (
                <li key={root.id}>
                  {renderRow(root, false)}
                  {expanded.has(root.id) &&
                    childrenOf(root.id).map((sub) => renderRow(sub, true))}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {categories !== null && categories.length > 0 && (
        <p className="mt-4 text-sm text-muted">
          Ready to sell?{' '}
          <Link
            to="../products"
            className="font-semibold text-brand hover:text-brand-hover"
          >
            Add products →
          </Link>
        </p>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete?.parentId ? 'Delete subcategory?' : 'Delete category?'}
        description={
          toDelete ? (
            <>
              <span className="font-medium text-fg">{toDelete.name}</span> will
              be removed. Categories that still contain products or
              subcategories can't be deleted.
            </>
          ) : null
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  )
}

/**
 * The expanded editor for one shelf — artwork and position only.
 *
 * The name is deliberately not editable: it is the platform category's name,
 * and for a legacy shelf it is the seller's own wording, which only an admin
 * re-maps. That keeps every shelf name on the platform meaningful.
 */
function CategoryEditPanel({
  category,
  isSub,
  onSave,
  onCancel,
}: {
  category: StoreCategory
  isSub: boolean
  onSave: (patch: StoreCategoryInput) => Promise<boolean>
  onCancel: () => void
}) {
  const [imageUrl, setImageUrl] = useState(category.imageUrl ?? '')
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const patch: StoreCategoryInput = {}
    const nextImage = imageUrl.trim() || null
    if (nextImage !== category.imageUrl) patch.imageUrl = nextImage
    const nextOrder = Number(sortOrder)
    if (Number.isFinite(nextOrder) && nextOrder !== category.sortOrder) {
      patch.sortOrder = nextOrder
    }
    // Nothing changed — close without a pointless request.
    if (Object.keys(patch).length === 0) return onCancel()

    setSaving(true)
    await onSave(patch)
    setSaving(false)
  }

  return (
    <div
      className={`border-t border-line bg-surface-alt px-4 py-4 ${isSub ? 'pl-18' : ''}`}
    >
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">
            Category
          </label>
          <p className="flex h-11 items-center rounded-md border border-line bg-surface px-4 text-sm text-fg">
            {category.taxonomy?.pathLabel ?? category.name}
          </p>
          <p className="mt-1.5 text-xs text-muted">
            {category.taxonomy
              ? 'Set from the platform categories when you added this shelf.'
              : 'Added before platform categories existed. Contact support to link it to one.'}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg">
            Sort order
          </label>
          <input
            type="number"
            min={0}
            max={9999}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="h-11 w-full rounded-md border border-line bg-input px-4 text-sm text-fg outline-none focus:border-accent"
          />
          <p className="mt-1.5 text-xs text-muted">
            Lower numbers come first. Equal numbers keep their current order.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-fg">
            Image URL (optional)
          </label>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="h-11 w-full rounded-md border border-line bg-input px-4 text-sm text-fg outline-none placeholder:text-muted focus:border-accent"
          />
          {imageUrl.trim() && (
            <img
              src={imageUrl.trim()}
              alt=""
              className="mt-2 h-16 w-16 rounded-md border border-line object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex h-10 items-center rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex h-10 items-center rounded-md border border-line px-4 text-sm font-semibold text-fg transition hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function CategoryRow({
  category,
  isSub = false,
  toggling,
  expandable = false,
  isExpanded = false,
  isEditing = false,
  onToggleExpand,
  onToggle,
  onToggleFeatured,
  onDelete,
  onEdit,
}: {
  category: StoreCategory
  isSub?: boolean
  toggling: boolean
  /** Root rows with subcategories get the expand/collapse chevron. */
  expandable?: boolean
  isExpanded?: boolean
  isEditing?: boolean
  onToggleExpand?: () => void
  onToggle: (next: boolean) => void
  /** Root rows only — features the category on the storefront homepage. */
  onToggleFeatured?: (next: boolean) => void
  onDelete: () => void
  onEdit: () => void
}) {
  const meta: string[] = [
    `${category.productCount} ${category.productCount === 1 ? 'product' : 'products'}`,
  ]
  if (!isSub && category.subcategoryCount > 0) {
    meta.push(
      `${category.subcategoryCount} ${category.subcategoryCount === 1 ? 'subcategory' : 'subcategories'}`,
    )
  }

  return (
    // Root content starts at 48px (pl-4 + the 20px chevron slot + 12px gap), so
    // subcategories need to clear that before their own indent reads as nested.
    <div
      className={`flex items-center gap-3 py-3 pr-4 ${isSub ? 'pl-18' : 'pl-4'}`}
    >
      {/* Expand/collapse — a fixed-width slot keeps every row aligned. */}
      {!isSub && (
        <div className="w-5 shrink-0">
          {expandable && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${category.name}`}
              className="flex h-5 w-5 items-center justify-center rounded-sm text-muted transition-colors hover:text-fg"
            >
              <ChevronDownIcon
                className={`h-4 w-4 transition-transform ${
                  isExpanded ? '' : '-rotate-90'
                }`}
              />
            </button>
          )}
        </div>
      )}

      {category.imageUrl ? (
        <img
          src={category.imageUrl}
          alt=""
          className={`shrink-0 rounded-md border border-line object-cover ${
            isSub ? 'h-7 w-7' : 'h-9 w-9'
          }`}
        />
      ) : (
        <div
          className={`flex shrink-0 items-center justify-center rounded-md ${
            isSub ? 'h-7 w-7' : 'h-9 w-9'
          } ${
            category.isActive
              ? 'bg-brand/10 text-brand'
              : 'bg-surface-alt text-muted'
          }`}
        >
          <TagIcon className={isSub ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm font-semibold ${
            category.isActive ? 'text-fg' : 'text-muted'
          }`}
        >
          {category.name}
          {isSub && (
            <span className="ml-1.5 rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Sub
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted">
          {meta.join(' · ')}
          {!category.isActive && (
            <span className="ml-1.5 rounded-sm bg-surface-alt px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
              Disabled
            </span>
          )}
        </p>
        {/* The platform tag, shown as its full path — "Accessories" on its own
            would not tell the seller which Accessories they picked. */}
        <p className="mt-0.5 truncate text-xs">
          {category.taxonomy ? (
            <span className="text-brand">{category.taxonomy.pathLabel}</span>
          ) : (
            <span className="text-muted/70">No platform category</span>
          )}
        </p>
      </div>

      {/* Featuring only applies to top-level categories — the homepage row
          shows roots, never subcategories. */}
      {!isSub && onToggleFeatured && (
        <button
          type="button"
          onClick={() => onToggleFeatured(!category.isFeatured)}
          aria-pressed={category.isFeatured}
          title={
            category.isFeatured
              ? 'Featured on the storefront homepage'
              : 'Feature on the storefront homepage'
          }
          aria-label={`${category.isFeatured ? 'Unfeature' : 'Feature'} ${category.name}`}
          className={`rounded-md p-2 transition hover:bg-surface-alt ${
            category.isFeatured ? 'text-brand' : 'text-muted hover:text-fg'
          }`}
        >
          <StarIcon className="h-4 w-4" filled={category.isFeatured} />
        </button>
      )}
      <button
        type="button"
        onClick={onEdit}
        aria-expanded={isEditing}
        className={`rounded-md p-2 transition hover:bg-surface-alt hover:text-fg ${
          isEditing ? 'text-brand' : 'text-muted'
        }`}
        aria-label={`Edit ${category.name}`}
      >
        <PencilIcon className="h-4 w-4" />
      </button>
      <ActiveSwitch
        checked={category.isActive}
        disabled={toggling}
        label={`${category.isActive ? 'Disable' : 'Enable'} ${category.name}`}
        onChange={onToggle}
      />
      <button
        type="button"
        onClick={onDelete}
        className="rounded-md p-2 text-muted transition hover:bg-danger/10 hover:text-danger"
        aria-label={`Delete ${category.name}`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

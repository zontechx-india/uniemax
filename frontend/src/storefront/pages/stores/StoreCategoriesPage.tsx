import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote } from '../../../shared/ui/form'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { storeCatalogApi } from '../../features/stores/storesApi'
import type {
  StoreCategory,
  StoreCategoryInput,
} from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ImageIcon,
  PlusIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
} from '../../layout/icons'
import { MediaImg } from '../../../shared/media/MediaImg'
import { BigSwitch } from './ui/BigSwitch'
import { CategoryChooserSheet } from './ui/CategoryChooserSheet'
import { EmptyState } from './ui/EmptyState'
import { GlassCard } from './ui/GlassCard'
import { PageHeader } from './ui/PageHeader'
import { RowMenu } from './ui/RowMenu'
import { StatusPill } from './ui/StatusPill'
import { showToast } from './ui/Toast'

/**
 * Categories section of the store manage page — first step of the hierarchy
 * Store → Categories → Product → Variants. Products can only be added once
 * at least one category exists.
 *
 * A category is CHOSEN from the platform taxonomy, never typed, through the
 * same search-or-browse picker the whole platform uses. The tree goes as deep
 * as the taxonomy does: picking "Fashion › Women › Sarees" adds Fashion and
 * Women as well, so the shop's navigation always mirrors the platform's and
 * one shop's catalog is comparable with every other shop's by construction.
 *
 * Shelves created before this rule keep the free text a seller typed. Those
 * stay exactly as they are; converting one is an admin action, so nothing
 * here can rewrite a shop's existing navigation.
 *
 * Each row: a 44px expand button (branches only), the name with its pills, a
 * labelled Showing / Hidden switch, and "⋯ More" holding Move up / Move down
 * (replacing a typed "Sort order" number), the home-page feature (top level
 * only), Change picture and Delete. Indentation stops growing after three
 * levels so a deep tree keeps its width on a phone.
 */
export function StoreCategoriesPage() {
  const { store, refreshStore } = useManagedStore()

  const [categories, setCategories] = useState<StoreCategory[] | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<StoreCategory | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Which branches are expanded. Long catalogs collapse by default so the
  // list stays scannable; the choice is remembered per store.
  const expandKey = `storefront.categories.expanded.${store.id}`
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(expandKey)
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

  const toggleExpanded = (id: string) => {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    persistExpanded(next)
  }

  const reload = async () => {
    const list = await storeCatalogApi.listCategories(store.id)
    setCategories(list)
    return list
  }

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

  const childrenOf = (parent: string | null) =>
    (categories ?? []).filter((c) => c.parentId === parent)

  /** Platform categories the shop already has — ticked in the chooser. */
  const addedIds = new Set(
    (categories ?? []).flatMap((c) => (c.categoryId ? [c.categoryId] : [])),
  )

  const branches = (categories ?? []).filter(
    (c) => childrenOf(c.id).length > 0,
  )
  const allExpanded =
    branches.length > 0 && branches.every((b) => expanded.has(b.id))

  const toggleAll = () =>
    persistExpanded(
      allExpanded ? new Set<string>() : new Set(branches.map((b) => b.id)),
    )

  const replaceRow = (updated: StoreCategory) =>
    setCategories((list) =>
      (list ?? []).map((c) => (c.id === updated.id ? updated : c)),
    )

  /** Choosing IS adding — one tap in the chooser, no separate Add button. */
  const add = async (categoryId: string, name: string) => {
    setError(null)
    setBusy(true)
    try {
      const category = await storeCatalogApi.createCategory(store.id, {
        categoryId,
      })
      // Refetch rather than append: picking a deep category creates its
      // ancestors too, and only the server knows which ones it did.
      const list = await reload()
      refreshStore?.()
      setChoosing(false)
      showToast(`${name} added`)
      // Reveal the new shelf instead of hiding it in collapsed ancestors.
      const next = new Set(expanded)
      let cursor = list.find((c) => c.id === category.parentId)
      while (cursor) {
        next.add(cursor.id)
        cursor = list.find((c) => c.id === cursor?.parentId)
      }
      persistExpanded(next)
    } catch (err) {
      setError(toApiError(err).message)
      // The chooser sheet is still open over the page — say it there too.
      showToast(toApiError(err).message, 'danger')
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

  /**
   * Move a shelf one place up or down among its siblings. The list order is
   * the server's (by sort order), so the whole sibling run is renumbered
   * 0, 10, 20… and only the rows whose number changes are written — the
   * seller never sees or types a number.
   */
  const move = async (category: StoreCategory, delta: -1 | 1) => {
    const siblings = childrenOf(category.parentId)
    const from = siblings.findIndex((c) => c.id === category.id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= siblings.length) return
    const order = [...siblings]
    ;[order[from], order[to]] = [order[to]!, order[from]!]
    setError(null)
    try {
      for (const [index, sibling] of order.entries()) {
        const want = index * 10
        if (sibling.sortOrder !== want) {
          await storeCatalogApi.updateCategory(store.id, sibling.id, { sortOrder: want })
        }
      }
      await reload()
      showToast(delta < 0 ? 'Moved up' : 'Moved down')
    } catch (err) {
      setError(toApiError(err).message)
    }
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    try {
      await storeCatalogApi.deleteCategory(store.id, toDelete.id)
      setCategories((list) => (list ?? []).filter((c) => c.id !== toDelete.id))
      refreshStore?.()
      setToDelete(null)
    } catch (err) {
      setError(toApiError(err).message)
      setToDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  /**
   * The tree as a flat run of rows, each indented by its depth, so one
   * divided list keeps every row aligned however deep the shelves nest.
   */
  const rows = (parentId: string | null, depth: number): ReactElement[] => {
    const siblings = childrenOf(parentId)
    return siblings.flatMap((category, index) => {
      const expandable = childrenOf(category.id).length > 0
      const isExpanded = expanded.has(category.id)
      return [
        <li key={category.id}>
          <CategoryRow
            category={category}
            depth={depth}
            toggling={togglingId === category.id}
            expandable={expandable}
            isExpanded={isExpanded}
            first={index === 0}
            last={index === siblings.length - 1}
            onToggleExpand={() => toggleExpanded(category.id)}
            onToggle={(next) => toggleActive(category, next)}
            {...(depth === 0
              ? { onToggleFeatured: (next: boolean) => toggleFeatured(category, next) }
              : {})}
            onMove={(delta) => void move(category, delta)}
            onDelete={() => setToDelete(category)}
            onEdit={() =>
              setEditingId(editingId === category.id ? null : category.id)
            }
          />
          {editingId === category.id && (
            <CategoryEditPanel
              category={category}
              depth={depth}
              onCancel={() => setEditingId(null)}
              onSave={async (patch) => {
                const done = await saveEdit(category, patch)
                if (done) setEditingId(null)
                return done
              }}
            />
          )}
        </li>,
        ...(expandable && isExpanded ? rows(category.id, depth + 1) : []),
      ]
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={TagIcon}
        title="Categories"
        description="The sections of your shop, like Sarees or Kurtas. Pick them from the list — add at least one before you add products."
      />

      {/* The next step, right where the seller finishes this one — before,
          they had to find "Products" in the section menu themselves. */}
      {(categories?.length ?? 0) > 0 &&
        store.readiness.gates.PUBLISH.blockerKeys.includes('catalog.product') && (
          <div className="flex flex-col gap-3 rounded-glass border border-success/30 bg-success/10 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] text-fg">
              <span className="font-bold">Category added.</span> Next: add your
              first product.
            </p>
            <Link to="../products" className={buttonClass({ size: 'lg' })}>
              Add a product
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
        )}

      {/* Add form — a picker, no free text: a shop cannot invent a category,
          so every shelf is findable across the whole platform. */}
      <GlassCard
        title="Add a category"
        description="Type what you sell, or look through the groups. Picking a smaller one (like Sarees) adds the bigger ones above it too."
      >
        <Button
          type="button"
          size="lg"
          full
          onClick={() => setChoosing(true)}
          className="sm:w-auto sm:px-8"
        >
          <PlusIcon className="h-5 w-5" />
          {(categories?.length ?? 0) === 0 ? 'Choose what you sell' : 'Add a category'}
        </Button>
      </GlassCard>

      <CategoryChooserSheet
        open={choosing}
        onClose={() => setChoosing(false)}
        addedIds={addedIds}
        busy={busy}
        onPick={(node) => void add(node.id, node.name)}
      />

      {error && (
        <div className="max-w-md">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {/* Nested list, any depth, each level indented */}
      {categories === null ? (
        <div
          aria-busy="true"
          aria-label="Loading categories"
          className="glass-card h-48 animate-pulse rounded-glass"
        />
      ) : categories.length === 0 ? (
        <GlassCard>
          <EmptyState
            icon={TagIcon}
            title="No categories yet"
            description="Categories are the sections of your shop, like Sarees or Kurtas. Add one, then you can add products to it."
            action={
              <Button type="button" size="lg" onClick={() => setChoosing(true)}>
                <PlusIcon className="h-5 w-5" />
                Choose what you sell
              </Button>
            }
          />
        </GlassCard>
      ) : (
        <section aria-labelledby="your-categories">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 id="your-categories" className="text-[15px] font-bold text-fg">
              Your categories
            </h3>
            {branches.length > 0 && (
              <button
                type="button"
                onClick={toggleAll}
                className="min-h-tap rounded-xl px-3 text-[14px] font-semibold text-brand transition hover:bg-brand-soft"
              >
                {allExpanded ? 'Close all' : 'Open all'}
              </button>
            )}
          </div>
          <ul className="glass-card divide-y divide-line overflow-hidden rounded-glass">
            {rows(null, 0)}
          </ul>
        </section>
      )}

      {categories !== null && categories.length > 0 && (
        <Link
          to="../products"
          className="inline-flex min-h-tap items-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold text-brand transition hover:bg-brand-soft"
        >
          Ready to sell? Add products
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this category?"
        description={
          toDelete ? (
            <>
              <span className="font-medium text-fg">{toDelete.name}</span> will
              be removed. A category that still has products or smaller
              categories inside it can’t be deleted.
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
 * Left inset for a row at `depth`. It stops growing after three levels —
 * the old 28px-per-level indent ate a third of a phone's width on a deep
 * tree; past level 3 a "Level n" pill says where the row sits instead.
 */
const indent = (depth: number) => ({ paddingLeft: 8 + Math.min(depth, 3) * 16 })

/**
 * The expanded editor for one shelf — its picture only.
 *
 * The name is deliberately not editable: it is the platform category's name,
 * and for a legacy shelf it is the seller's own wording, which only an admin
 * converts. Position moved to Move up / Move down in the row's menu.
 */
function CategoryEditPanel({
  category,
  depth,
  onSave,
  onCancel,
}: {
  category: StoreCategory
  depth: number
  onSave: (patch: StoreCategoryInput) => Promise<boolean>
  onCancel: () => void
}) {
  const [imageUrl, setImageUrl] = useState(category.imageUrl ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const nextImage = imageUrl.trim() || null
    // Nothing changed — close without a pointless request.
    if (nextImage === category.imageUrl) return onCancel()
    setSaving(true)
    await onSave({ imageUrl: nextImage })
    setSaving(false)
  }

  return (
    <div className="border-t border-line bg-fg/[0.03] py-4 pr-4" style={indent(depth)}>
      <div className="max-w-2xl space-y-4 pl-2">
        <div>
          <p className="text-[14px] font-semibold text-fg">Category</p>
          <p className="mt-0.5 text-[15px] text-fg">
            {category.taxonomy?.pathLabel ?? category.name}
          </p>
          <p className="mt-0.5 text-hint text-muted">
            {category.taxonomy
              ? 'Chosen from the UnieMax list when you added it.'
              : 'Added before the UnieMax list existed, so its products are not shown on UnieMax category pages. Ask support to link it.'}
          </p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-[15px] font-semibold text-fg">
            Picture link <span className="font-normal text-muted">(optional)</span>
          </span>
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="https://…"
            className="h-field w-full rounded-md border border-line bg-input px-4 text-[15px] text-fg outline-none placeholder:text-muted focus:border-accent"
          />
          <span className="mt-1.5 block text-hint text-muted">
            Paste a web link to a picture for this category. Most shops leave
            this empty.
          </span>
          {imageUrl.trim() && (
            <img
              src={imageUrl.trim()}
              alt=""
              className="mt-2 h-16 w-16 rounded-xl border border-line object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          )}
        </label>

        <div className="flex gap-2">
          <Button type="button" size="lg" onClick={() => void save()} loading={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className={buttonClass({ variant: 'ring', size: 'lg' })}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

/** ↑ / ↓ for the row menu — the chevron, turned. */
function UpIcon({ className = '' }: { className?: string }) {
  return <ChevronDownIcon className={`${className} rotate-180`} />
}
function DownIcon({ className = '' }: { className?: string }) {
  return <ChevronDownIcon className={className} />
}

function CategoryRow({
  category,
  depth,
  toggling,
  expandable,
  isExpanded,
  first,
  last,
  onToggleExpand,
  onToggle,
  onToggleFeatured,
  onMove,
  onDelete,
  onEdit,
}: {
  category: StoreCategory
  depth: number
  toggling: boolean
  /** Rows with children get the expand/collapse chevron. */
  expandable: boolean
  isExpanded: boolean
  /** First / last among its siblings — no Move up / Move down past the ends. */
  first: boolean
  last: boolean
  onToggleExpand: () => void
  onToggle: (next: boolean) => void
  /** Root rows only — features the category on the storefront homepage. */
  onToggleFeatured?: (next: boolean) => void
  onMove: (delta: -1 | 1) => void
  onDelete: () => void
  onEdit: () => void
}) {
  const meta: string[] = [
    `${category.productCount} ${category.productCount === 1 ? 'product' : 'products'}`,
  ]
  if (category.subcategoryCount > 0) {
    meta.push(`${category.subcategoryCount} inside`)
  }

  return (
    <div
      className="flex flex-col gap-2 py-3 pr-3 sm:flex-row sm:items-center sm:gap-3 sm:pr-4"
      style={indent(depth)}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {/* Expand/collapse — a fixed-width slot keeps every row aligned. */}
        <div className="w-9 shrink-0">
          {expandable && (
            <button
              type="button"
              onClick={onToggleExpand}
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Close' : 'Open'} ${category.name}`}
              className="flex h-tap w-9 items-center justify-center rounded-xl text-muted transition-colors hover:bg-fg/5 hover:text-fg"
            >
              <ChevronDownIcon
                className={`h-5 w-5 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
              />
            </button>
          )}
        </div>

        {category.imageUrl ? (
          <MediaImg
            sizes="40px"
            src={category.imageUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl border border-line object-cover"
          />
        ) : (
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              category.isActive ? 'bg-brand-soft text-brand' : 'bg-fg/5 text-muted'
            }`}
          >
            <TagIcon className="h-5 w-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={`min-w-0 text-[15px] font-semibold break-words ${
                category.isActive ? 'text-fg' : 'text-muted'
              }`}
            >
              {category.name}
            </span>
            {category.isFeatured && (
              <StatusPill tone="brand" dot={false}>
                <StarIcon className="h-3 w-3" filled />
                On home page
              </StatusPill>
            )}
            {depth > 3 && <StatusPill dot={false}>Level {depth + 1}</StatusPill>}
          </p>
          <p className="text-hint text-muted">{meta.join(' · ')}</p>
          {/* The platform category, shown as its full path — "Accessories" on
              its own would not tell the seller which Accessories they picked. */}
          <p className="truncate text-hint">
            {category.taxonomy ? (
              <span className="text-brand">{category.taxonomy.pathLabel}</span>
            ) : (
              // Says what it costs: these products are missing from every
              // UnieMax category page until an admin converts the shelf.
              <span className="text-pending">Not on UnieMax category pages</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pl-11 sm:shrink-0 sm:pl-0">
        <BigSwitch
          checked={category.isActive}
          disabled={toggling}
          label={`Show ${category.name} in your shop`}
          onText="Showing"
          offText="Hidden"
          onChange={onToggle}
        />
        <RowMenu
          title={category.name}
          actions={[
            ...(onToggleFeatured
              ? [
                  {
                    label: category.isFeatured ? 'Remove from home page' : 'Show on home page',
                    icon: StarIcon,
                    note: 'The “Featured categories” row on your home page',
                    onSelect: () => onToggleFeatured(!category.isFeatured),
                  },
                ]
              : []),
            { label: 'Move up', icon: UpIcon, disabled: first, onSelect: () => onMove(-1) },
            { label: 'Move down', icon: DownIcon, disabled: last, onSelect: () => onMove(1) },
            { label: 'Change picture', icon: ImageIcon, onSelect: onEdit },
            {
              label: 'Delete category',
              icon: TrashIcon,
              note: 'Only when nothing is inside it',
              danger: true,
              onSelect: onDelete,
            },
          ]}
        />
      </div>
    </div>
  )
}

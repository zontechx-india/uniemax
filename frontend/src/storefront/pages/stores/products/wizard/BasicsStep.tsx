import { useState } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { ErrorNote } from '../../../../../shared/ui/form'
import { CheckIcon, PlusIcon, TagIcon } from '../../../../layout/icons'
import { CategoryChooserSheet } from '../../ui/CategoryChooserSheet'
import { showToast } from '../../ui/Toast'
import { storeCatalogApi } from '../../../../features/stores/storesApi'
import type {
  StoreCategory,
  StoreProduct,
} from '../../../../features/stores/storesApi'
import {
  Field,
  StepButtons,
  StepShell,
  categoryOptions,
  inputClass,
} from './shared'

/**
 * Step 1 — the two answers that make a product exist: what it is called and
 * where it goes. Continue creates the draft (or renames / moves an existing
 * product), so from here on every other step saves against a real id.
 *
 * The category is a list of big tappable cards — the shop's own categories,
 * the most specific ones first, each showing its group underneath — instead
 * of a dropdown of "Fashion › Women › Sarees" paths. If the right one is
 * missing, **Add a new category** opens the same chooser the Categories page
 * uses, adds it, and selects it — the seller never has to leave the product.
 */
export function BasicsStep({
  storeId,
  categories,
  product,
  onSaved,
  onNext,
  onCategoriesChange,
}: {
  storeId: string
  categories: StoreCategory[]
  product: StoreProduct | null
  onSaved: (product: StoreProduct) => void
  onNext: () => void
  /** A category was added from here — the page's list must learn of it. */
  onCategoriesChange?: (categories: StoreCategory[]) => void
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(
    product?.category.id ?? defaultCategoryId(categories),
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [adding, setAdding] = useState(false)

  const shelf = categories.find((c) => c.id === categoryId) ?? null
  const options = shelfOptions(categories)
  const addedIds = new Set(categories.flatMap((c) => (c.categoryId ? [c.categoryId] : [])))

  /** Add a platform category to the shop from inside the wizard, and pick it. */
  const addCategory = async (taxonomyId: string, name: string) => {
    setAdding(true)
    try {
      const created = await storeCatalogApi.createCategory(storeId, { categoryId: taxonomyId })
      const list = await storeCatalogApi.listCategories(storeId)
      onCategoriesChange?.(list)
      setCategoryId(created.id)
      setChoosing(false)
      setError(null)
      showToast(`${name} added`)
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
    } finally {
      setAdding(false)
    }
  }

  const next = async () => {
    if (!name.trim()) return setError('Give the product a name first.')
    if (!categoryId) return setError('Choose a category.')
    setError(null)

    const unchanged =
      product && name.trim() === product.name && categoryId === product.category.id
    if (unchanged) return onNext()

    setBusy(true)
    try {
      const saved = product
        ? await storeCatalogApi.updateProduct(storeId, product.id, {
            ...(name.trim() !== product.name ? { name: name.trim() } : {}),
            ...(categoryId !== product.category.id ? { categoryId } : {}),
          })
        : await storeCatalogApi.createProduct(storeId, {
            name: name.trim(),
            categoryId,
          })
      onSaved(saved)
      onNext()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepShell
      title="What are you selling?"
      lead="Just a name and a category to start — everything else comes step by step, and you can stop any time."
    >
      <Field
        label="Product name"
        hint={
          <>
            Write it the way a customer would search for it — e.g.{' '}
            <span className="text-fg">Banarasi silk saree, pink</span> or{' '}
            <span className="text-fg">Kashmir willow cricket bat</span>.
          </>
        }
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          autoFocus
          placeholder="e.g. Banarasi silk saree"
          className={inputClass}
        />
      </Field>

      <div>
        <p className="mb-1.5 text-[15px] font-semibold text-fg">Which category is it in?</p>
        <div role="radiogroup" aria-label="Category" className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => {
            const selected = option.id === categoryId
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setCategoryId(option.id)}
                className={`flex min-h-[60px] items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-left transition ${
                  selected
                    ? 'border-brand bg-brand-soft ring-2 ring-brand/25'
                    : 'border-line bg-surface/70 hover:border-brand/50'
                }`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    selected ? 'bg-brand text-brand-contrast' : 'bg-fg/5 text-muted'
                  }`}
                >
                  {selected ? <CheckIcon className="h-5 w-5" /> : <TagIcon className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold break-words text-fg">{option.name}</span>
                  {option.group && (
                    <span className="block truncate text-hint text-muted">in {option.group}</span>
                  )}
                </span>
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setChoosing(true)}
            className="flex min-h-[60px] items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/40 px-3.5 text-[15px] font-semibold text-brand transition hover:bg-brand-soft"
          >
            <PlusIcon className="h-5 w-5" />
            Add a new category
          </button>
        </div>
        {shelf?.taxonomy && (
          <p className="mt-1.5 text-hint text-muted">
            Customers find it under <span className="text-fg">{shelf.taxonomy.pathLabel}</span>,
            and through search.
          </p>
        )}
      </div>

      <CategoryChooserSheet
        open={choosing}
        onClose={() => setChoosing(false)}
        addedIds={addedIds}
        busy={adding}
        title="Add a category"
        onPick={(node) => void addCategory(node.id, node.name)}
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <StepButtons
        onNext={() => void next()}
        busy={busy}
        nextLabel={product ? 'Continue' : 'Create & continue'}
      />
    </StepShell>
  )
}

/**
 * The shop's categories as cards: the MOST SPECIFIC ones first (a product
 * usually belongs in "Sarees", not "Women"), then the groups above them, each
 * with its parent path as a small "in …" line.
 */
function shelfOptions(categories: StoreCategory[]): { id: string; name: string; group: string }[] {
  const parents = new Set(categories.map((c) => c.parentId))
  const ordered = categoryOptions(categories)
  const toOption = (option: { id: string; label: string }) => {
    const parts = option.label.split(' › ')
    return { id: option.id, name: parts[parts.length - 1]!, group: parts.slice(0, -1).join(' › ') }
  }
  const leaves = ordered.filter((option) => !parents.has(option.id)).map(toOption)
  const groups = ordered.filter((option) => parents.has(option.id)).map(toOption)
  return [...leaves, ...groups]
}

/**
 * The first MOST SPECIFIC category, in the order the picker lists them.
 * Picking "Women" adds "Fashion › Women", and defaulting a new product to the
 * parent the seller never chose filed it one level too high.
 */
function defaultCategoryId(categories: StoreCategory[]): string {
  const parents = new Set(categories.map((c) => c.parentId))
  const ordered = categoryOptions(categories)
  return (ordered.find((option) => !parents.has(option.id)) ?? ordered[0])?.id ?? ''
}

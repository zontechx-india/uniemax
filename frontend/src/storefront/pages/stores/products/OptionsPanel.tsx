import { useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'
import { ErrorNote } from '../../../../shared/ui/form'
import {
  draftLabel,
  draftToInput,
  newKey,
  reconcileDraft,
  toDraft,
} from '../../../features/stores/productOptions'
import type {
  OptionTypeDraft,
  VariantDraft,
} from '../../../features/stores/productOptions'
import { storeCatalogApi } from '../../../features/stores/storesApi'
import type {
  StoreProduct,
  StoreProductOptionsInput,
} from '../../../features/stores/storesApi'
import { PlusIcon } from '../../../layout/icons'
import { DefaultVariantEditor } from './DefaultVariantEditor'
import { OptionTypesEditor } from './OptionTypesEditor'
import { VariantMatrix } from './VariantMatrix'

type Draft = { types: OptionTypeDraft[]; rows: VariantDraft[] }

/**
 * The expanded panel under a product row: its option types and the generated
 * combination matrix.
 *
 * It holds a DRAFT. Every option change reconciles the rows, so the seller
 * always sees exactly the combinations that will exist, with whatever they
 * already typed carried over. Nothing is written until Save, which sends the
 * whole target state to `PUT …/options` and the server replaces the variant
 * set atomically; Cancel throws the draft away. One save for the whole
 * matrix — not a request per row — is the point: option types and variants
 * can never be half-applied.
 *
 * Removing a value or a type drops combinations that may be in customers'
 * carts or on past orders, so that is confirmed — naming each one and its
 * stock — before the draft even changes. Saving with no option types at all
 * turns an option product back into a simple one (also confirmed); a simple
 * product shows its single price/stock editor and an "Add options" entry.
 */
export function OptionsPanel({
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
  const [draft, setDraft] = useState<Draft>(() => toDraft(product))
  const [dirty, setDirty] = useState(false)
  const [pendingDrop, setPendingDrop] = useState<
    (Draft & { dropped: VariantDraft[] }) | null
  >(null)
  const [confirmSimple, setConfirmSimple] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // A simple product only shows the editor once the seller asks for options.
  const editing = product.hasVariants || dirty

  const reset = (from: StoreProduct) => {
    setDraft(toDraft(from))
    setDirty(false)
    setError(null)
  }

  const apply = (next: Draft) => {
    setDraft(next)
    setDirty(true)
    setError(null)
  }

  const changeTypes = (types: OptionTypeDraft[]) => {
    const { rows, dropped } = reconcileDraft(draft.rows, types)
    // Only combinations that exist on the server need a second look; a blank
    // row the seller never saved can vanish silently.
    const saved = dropped.filter((row) => row.id !== undefined)
    if (saved.length > 0) {
      setPendingDrop({ types, rows, dropped: saved })
      return
    }
    apply({ types, rows })
  }

  const changeRows = (rows: VariantDraft[]) => apply({ ...draft, rows })

  const addOptions = () =>
    apply({ types: [{ key: newKey(), name: '', values: [] }], rows: [] })

  const commit = async (input: StoreProductOptionsInput) => {
    setError(null)
    onError(null)
    setBusy(true)
    try {
      const updated = await storeCatalogApi.replaceProductOptions(
        storeId,
        product.id,
        input,
      )
      onProductChange(updated)
      reset(updated)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    const result = draftToInput(draft.types, draft.rows)
    if ('error' in result) return setError(result.error)
    if (result.input.optionTypes.length === 0) {
      // Never had options and still has none — there is nothing to save.
      if (!product.hasVariants) return reset(product)
      return setConfirmSimple(true)
    }
    void commit(result.input)
  }

  return (
    <div className="border-t border-line bg-surface-alt px-4 py-4 sm:pl-16">
      {!editing ? (
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
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <button
              type="button"
              onClick={addOptions}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-md border border-line bg-surface px-3 text-xs font-semibold text-fg transition hover:border-brand hover:text-brand"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add options
            </button>
            <p className="text-xs text-muted">
              Sells at the single price above. Add options if it comes in sizes,
              colours, volumes or other choices — every combination then sets
              its own price and stock.
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Options
            </p>
            <div className="mt-2.5">
              <OptionTypesEditor
                value={draft.types}
                onChange={changeTypes}
                disabled={busy}
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">
              Combinations
            </p>
            <div className="mt-2.5">
              <VariantMatrix
                types={draft.types}
                rows={draft.rows}
                onChange={changeRows}
                disabled={busy}
              />
            </div>
          </div>

          {error && <ErrorNote>{error}</ErrorNote>}

          {dirty && (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-accent/40 bg-accent/10 px-3.5 py-2.5">
              <p className="text-sm font-medium text-fg">Unsaved changes</p>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => reset(product)}
                  disabled={busy}
                  className="h-9 rounded-md border border-line bg-surface px-3.5 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={busy}
                  className="h-9 rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
                >
                  {busy ? 'Saving…' : 'Save options'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDrop !== null}
        title="Remove these combinations?"
        description={
          pendingDrop ? (
            <>
              This change removes{' '}
              {pendingDrop.dropped.length === 1
                ? 'one saved combination'
                : `${pendingDrop.dropped.length} saved combinations`}{' '}
              when you save. Customers with one in their cart will see it as no
              longer available; past orders keep their details.
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm">
                {pendingDrop.dropped.map((row) => (
                  <li key={row.id}>
                    <span className="font-medium text-fg">
                      {draftLabel(draft.types, row)}
                    </span>
                    {row.stock.trim() && row.stock !== '0' && (
                      <span className="text-muted"> · {row.stock} in stock</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : null
        }
        confirmLabel="Remove"
        busy={false}
        onConfirm={() => {
          if (pendingDrop) {
            apply({ types: pendingDrop.types, rows: pendingDrop.rows })
          }
          setPendingDrop(null)
        }}
        onCancel={() => setPendingDrop(null)}
      />

      <ConfirmDialog
        open={confirmSimple}
        title="Remove all options?"
        description={
          <>
            <span className="font-medium text-fg">{product.name}</span> will
            sell at a single price again. Its {product.variants.length} variant
            {product.variants.length === 1 ? '' : 's'} will be removed; the
            cheapest price and the total stock carry over.
          </>
        }
        confirmLabel="Remove options"
        busy={busy}
        onConfirm={async () => {
          await commit({ optionTypes: [], variants: [] })
          setConfirmSimple(false)
        }}
        onCancel={() => setConfirmSimple(false)}
      />
    </div>
  )
}

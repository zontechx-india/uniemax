import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../../../shared/auth/http'
import { ErrorNote, Select } from '../../../../../shared/ui/form'
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
 */
export function BasicsStep({
  storeId,
  categories,
  product,
  onSaved,
  onNext,
}: {
  storeId: string
  categories: StoreCategory[]
  product: StoreProduct | null
  onSaved: (product: StoreProduct) => void
  onNext: () => void
}) {
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(
    product?.category.id ?? categories[0]?.id ?? '',
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const shelf = categories.find((c) => c.id === categoryId) ?? null

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

      <Field
        label="Category"
        hint={
          shelf?.taxonomy ? (
            <>
              Filed under <span className="text-fg">{shelf.taxonomy.pathLabel}</span> —
              customers find it by browsing there and through search across the
              whole platform.
            </>
          ) : (
            <>
              Your categories come from the platform list.{' '}
              <Link to="../categories" className="font-semibold text-brand">
                Add a category
              </Link>{' '}
              if the right one is missing.
            </>
          )
        }
      >
        <Select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="h-11"
        >
          {categoryOptions(categories).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {error && <ErrorNote>{error}</ErrorNote>}

      <StepButtons
        onNext={() => void next()}
        busy={busy}
        nextLabel={product ? 'Continue' : 'Create & continue'}
      />
    </StepShell>
  )
}

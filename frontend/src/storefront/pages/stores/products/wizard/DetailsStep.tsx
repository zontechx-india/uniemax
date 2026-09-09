import { useState } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { ErrorNote } from '../../../../../shared/ui/form'
import { storeCatalogApi } from '../../../../features/stores/storesApi'
import type {
  ProductSpec,
  StoreCategory,
  StoreProduct,
} from '../../../../features/stores/storesApi'
import { SpecificationsEditor, cleanSpecifications } from '../SpecificationsEditor'
import { Field, StepButtons, StepShell } from './shared'

/**
 * Step 4 — optional words: a description and a few facts. The specification
 * rows start from the category's suggested labels (Fabric, Wash care…) with
 * empty values, so the seller fills blanks instead of inventing headings;
 * rows left empty are simply not saved.
 */
export function DetailsStep({
  storeId,
  categories,
  product,
  onSaved,
  onBack,
  onNext,
}: {
  storeId: string
  categories: StoreCategory[]
  product: StoreProduct
  onSaved: (product: StoreProduct) => void
  onBack: () => void
  onNext: () => void
}) {
  const [description, setDescription] = useState(product.description ?? '')
  const [specs, setSpecs] = useState<ProductSpec[]>(() => {
    if (product.specifications.length > 0) return product.specifications
    const labels =
      categories.find((c) => c.id === product.category.id)?.taxonomy?.specTemplates ?? []
    return labels.map((label) => ({ label, value: '' }))
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const cleaned = cleanSpecifications(specs)
  const descriptionChanged = description.trim() !== (product.description ?? '')
  const specsChanged =
    JSON.stringify(cleaned) !== JSON.stringify(product.specifications)

  const next = async () => {
    if (!descriptionChanged && !specsChanged) return onNext()
    setError(null)
    setBusy(true)
    try {
      onSaved(
        await storeCatalogApi.updateProduct(storeId, product.id, {
          ...(descriptionChanged ? { description: description.trim() || null } : {}),
          ...(specsChanged ? { specifications: cleaned } : {}),
        }),
      )
      onNext()
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepShell
      title="Tell customers more"
      lead="Optional, but products with a few lines and a couple of facts sell better. You can come back to this any time."
    >
      <Field
        label="Description"
        optional
        hint="Two or three lines are plenty: what it is, what it’s made of, who it’s for. One point per line becomes a bullet on the page."
      >
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={'Pure Banarasi silk with zari border\nComes with an unstitched blouse piece\nDry clean only'}
          className="w-full rounded-md border border-line bg-input px-3.5 py-2.5 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent"
        />
      </Field>

      <SpecificationsEditor value={specs} onChange={setSpecs} disabled={busy} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <StepButtons onBack={onBack} onNext={() => void next()} busy={busy} skip={onNext} />
    </StepShell>
  )
}

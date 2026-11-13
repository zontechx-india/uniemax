import { useState } from 'react'
import { toApiError } from '../../../../../shared/auth/http'
import { storeCatalogApi } from '../../../../features/stores/storesApi'
import type {
  ProductSpec,
  StoreCategory,
  StoreProduct,
} from '../../../../features/stores/storesApi'
import { SpecificationsEditor, cleanSpecifications } from '../SpecificationsEditor'
import { ClipboardIcon, PencilIcon } from '../../../../layout/icons'
import { Hint, Section, StepButtons, StepError, StepShell } from './shared'

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
    <StepShell title="Tell customers more" lead="Optional — helps it sell.">
      <Section title="Description" icon={PencilIcon}>
        <div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            maxLength={2000}
            aria-label="Description"
            placeholder={'Pure Banarasi silk with zari border\nComes with an unstitched blouse piece\nDry clean only'}
            className="w-full rounded-md border border-line bg-input px-3 py-2.5 text-base leading-relaxed text-fg outline-none transition placeholder:text-muted focus:border-accent"
          />
          <Hint>2–3 lines. Each line shows as a point.</Hint>
        </div>
      </Section>

      <Section title="Product facts" icon={ClipboardIcon}>
        <SpecificationsEditor value={specs} onChange={setSpecs} disabled={busy} />
      </Section>

      {error && <StepError>{error}</StepError>}

      <StepButtons onBack={onBack} onNext={() => void next()} busy={busy} skip={onNext} />
    </StepShell>
  )
}

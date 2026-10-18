import { formatPrice } from '../../../../features/stores/storesApi'
import type { StoreProduct } from '../../../../features/stores/storesApi'
import { MediaBoard } from '../../media/MediaBoard'
import { useLiveMedia } from '../../media/useLiveMedia'
import { StepButtons, StepShell } from './shared'
import type { VersionPlan } from './shared'

/**
 * Step 2 — photos, uploaded straight onto the draft. The board owns the whole
 * experience; this step only frames it and moves on. A product needs one
 * photo to be published, which the review step will say if it is missing.
 * A seller who said "many colours" on step 1 is asked for one photo of each
 * — step 3 matches each photo to its choice.
 */
export function PhotosStep({
  storeId,
  product,
  plan,
  onSaved,
  onBack,
  onNext,
}: {
  storeId: string
  product: StoreProduct
  plan: VersionPlan
  onSaved: (product: StoreProduct) => void
  onBack: () => void
  onNext: () => void
}) {
  const driver = useLiveMedia(storeId, product, onSaved)
  const photos = product.media.filter((m) => m.type === 'IMAGE').length
  const uploading = driver.photos.some((p) => p.status === 'sending')

  return (
    <StepShell
      title="Add photos"
      lead={
        plan === 'many'
          ? 'Add a photo of every colour you sell — the first one is the cover. In the next step you say which photo is which colour. Only sizes? One good photo is enough.'
          : 'Good photos sell. The first one is the cover customers see in the list — a clear shot on a plain background works best.'
      }
    >
      <MediaBoard
        driver={driver}
        preview={{
          name: product.name,
          price: product.price && Number(product.price) > 0 ? formatPrice(product.price) : null,
        }}
      />

      <StepButtons
        onBack={onBack}
        onNext={onNext}
        busy={uploading}
        nextLabel={photos === 0 ? 'Continue without photos' : 'Continue'}
      />
    </StepShell>
  )
}

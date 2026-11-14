import { formatPrice } from '../../../../features/stores/storesApi'
import type { StoreProduct } from '../../../../features/stores/storesApi'
import { MediaBoard } from '../../media/MediaBoard'
import { useLiveMedia } from '../../media/useLiveMedia'
import { ImageIcon, InfoIcon, PaletteIcon, StarIcon } from '../../../../layout/icons'
import { CameraIcon } from '../../media/icons'
import { Notice, Section, StepButtons, StepShell } from './shared'
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
    <StepShell title="Add photos">
      {/* No section title: the board opens with its own ("Photos & video",
          the required mark and the 0 / 20 count). */}
      <Section>
        {/* The tips as marks, not a paragraph. */}
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-hint text-muted">
          {plan === 'many' && (
            <li className="flex items-center gap-1 font-semibold text-fg">
              <CameraIcon className="h-3.5 w-3.5 text-brand" />
              A photo of each colour
            </li>
          )}
          <li className="flex items-center gap-1">
            <StarIcon className="h-3.5 w-3.5 text-brand" filled />
            First = cover
          </li>
          <li className="flex items-center gap-1">
            <ImageIcon className="h-3.5 w-3.5" />
            Plain background
          </li>
          {plan === 'many' && (
            <li className="flex items-center gap-1">
              <PaletteIcon className="h-3.5 w-3.5" />
              Match colours next step
            </li>
          )}
        </ul>
        <MediaBoard
          driver={driver}
          preview={{
            name: product.name,
            price: product.price && Number(product.price) > 0 ? formatPrice(product.price) : null,
          }}
        />
      </Section>

      {/* Skipping is allowed — but never silently: a product without a photo
          cannot go live, and the seller should know that now, not at the end. */}
      {photos === 0 && !uploading && (
        <Notice
          icon={InfoIcon}
          title="No photo yet"
          body="Your product stays hidden from customers until you add a photo."
        />
      )}

      <StepButtons
        onBack={onBack}
        onNext={onNext}
        busy={uploading}
        nextLabel={photos === 0 ? 'Add photo later' : 'Continue'}
        nextVariant={photos === 0 ? 'secondary' : 'primary'}
      />
    </StepShell>
  )
}

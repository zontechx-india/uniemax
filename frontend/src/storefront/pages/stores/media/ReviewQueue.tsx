import { CheckIcon, CloseIcon, PencilIcon } from '../../../layout/icons'
import { media } from './strings'
import { Button } from '../../../../shared/ui/Button'
import { ModalShell } from '../../../../shared/ui/ModalShell'

/** One picked photo, already optimized, waiting for the seller's verdict. */
export interface ReviewItem {
  id: string
  /** The file as picked — what the editor re-renders from. */
  original: File
  /** The optimized WebP that will upload if the seller keeps it as it is. */
  blob: Blob
  filename: string
  previewUrl: string
  ratioLabel: string | null
  sizeLabel: string
  /** Set when this pick replaces an existing photo rather than adding one. */
  replaceId: string | null
}

/**
 * The question that used to be missing: **crop, or not?**
 *
 * Every picked photo stops here for one tap. The safe answer — upload it
 * exactly as shot — is the primary button; cutting is the deliberate detour.
 * That order is the whole point: a forced 1:1 crop is what was cutting the
 * tops off bats and bottles.
 *
 * Shown one photo at a time with a counter, plus a "use all N as they are"
 * escape for a seller who picked eight photos and meant it.
 */
export function ReviewQueue({
  items,
  onUse,
  onEdit,
  onUseAll,
  onSkip,
}: {
  items: ReviewItem[]
  onUse: (item: ReviewItem) => void
  onEdit: (item: ReviewItem) => void
  onUseAll: () => void
  onSkip: (item: ReviewItem) => void
}) {
  const item = items[0]
  if (!item) return null

  return (
    // Every picked photo needs a verdict, so the sheet does not close on a
    // stray tap or Escape — Skip is the explicit way out.
    <ModalShell
      onClose={() => {}}
      closeOnBackdrop={false}
      closeOnEscape={false}
      label={media.review.title}
      panelClassName="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-sm sm:p-5"
    >
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-lg font-semibold text-fg">
            {media.review.title}
          </h3>
          <span className="text-sm font-semibold text-muted">
            {media.review.step(1, items.length)}
          </span>
        </div>

        {/* Checkerboard behind the photo, so a tall or wide shot reads as its
            own shape instead of looking like it sits on a cropped canvas. */}
        <div className="mt-3 flex aspect-[4/5] items-center justify-center overflow-hidden rounded-lg border border-line bg-[repeating-linear-gradient(45deg,var(--surface-alt)_0_10px,var(--surface)_10px_20px)]">
          <img
            src={item.previewUrl}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        </div>

        <p className="mt-2 flex justify-between text-xs text-muted">
          <span className="truncate">{item.original.name}</span>
          <span className="shrink-0 pl-2 font-medium">
            {[item.ratioLabel, item.sizeLabel].filter(Boolean).join(' · ')}
          </span>
        </p>

        <div className="mt-4 grid gap-2">
          <Button type="button" size="lg" full onClick={() => onUse(item)}>
            <CheckIcon className="h-4 w-4" />
            {media.review.use}
          </Button>
          <Button variant="secondary" size="lg" full onClick={() => onEdit(item)}>
            <PencilIcon className="h-4 w-4" />
            {media.review.edit}
          </Button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-muted">
          {media.review.hint}
        </p>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <Button variant="ghost" size="sm" onClick={() => onSkip(item)}>
            <CloseIcon className="h-4 w-4" />
            {media.review.skip}
          </Button>
          {items.length > 1 && (
            <Button variant="ghost" size="sm" onClick={onUseAll}>
              {media.review.useAll(items.length)}
            </Button>
          )}
        </div>
    </ModalShell>
  )
}

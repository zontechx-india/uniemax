import { CheckIcon, CloseIcon, PencilIcon } from '../../../layout/icons'
import { media } from './strings'

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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={media.review.title}
    >
      <div className="w-full max-w-sm rounded-t-xl bg-surface p-4 shadow-floating sm:rounded-xl sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-body text-lg font-semibold tracking-normal text-fg">
            {media.review.title}
          </h3>
          <span className="text-xs font-semibold text-muted">
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

        <p className="mt-2 flex justify-between text-[11px] text-muted">
          <span className="truncate">{item.original.name}</span>
          <span className="shrink-0 pl-2 font-medium">
            {[item.ratioLabel, item.sizeLabel].filter(Boolean).join(' · ')}
          </span>
        </p>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => onUse(item)}
            className="flex h-12 items-center justify-center gap-2 rounded-md bg-brand-gradient text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90"
          >
            <CheckIcon className="h-4 w-4" />
            {media.review.use}
          </button>
          <button
            type="button"
            onClick={() => onEdit(item)}
            className="flex h-12 items-center justify-center gap-2 rounded-md border border-line bg-surface text-sm font-semibold text-fg transition hover:bg-surface-alt"
          >
            <PencilIcon className="h-4 w-4" />
            {media.review.edit}
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          {media.review.hint}
        </p>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <button
            type="button"
            onClick={() => onSkip(item)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-danger"
          >
            <CloseIcon className="h-3 w-3" />
            {media.review.skip}
          </button>
          {items.length > 1 && (
            <button
              type="button"
              onClick={onUseAll}
              className="text-xs font-semibold text-accent transition hover:opacity-80"
            >
              {media.review.useAll(items.length)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

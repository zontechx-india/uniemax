import { useState } from 'react'
import { media } from './strings'
import type { BoardPhoto } from './types'

/**
 * "Describe this photo" — what used to be an `Alt` button nobody pressed.
 *
 * The renaming is the feature: sellers skipped alt text because the label was
 * a web term, and every skipped description is image search traffic the shop
 * never gets. The dialog says who reads it and shows an example.
 */
export function DescribeDialog({
  photo,
  onSave,
  onClose,
}: {
  photo: BoardPhoto
  onSave: (text: string | null) => Promise<void>
  onClose: () => void
}) {
  const [value, setValue] = useState(photo.altText ?? '')
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    await onSave(value.trim() || null)
    setBusy(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={media.describe.title}
    >
      <div className="w-full max-w-sm rounded-t-xl bg-surface p-5 shadow-floating sm:rounded-xl">
        <h3 className="font-body text-lg font-semibold tracking-normal text-fg">
          {media.describe.title}
        </h3>
        <p className="mt-1 text-xs text-muted">{media.describe.help}</p>

        {photo.previewUrl && (
          <img
            src={photo.previewUrl}
            alt=""
            className="mt-3 h-24 w-24 rounded-md border border-line bg-surface-alt object-contain"
          />
        )}

        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={200}
          placeholder={media.describe.placeholder}
          autoFocus
          className="mt-3 h-11 w-full rounded-md border border-line bg-input px-3 text-sm text-fg outline-none transition placeholder:text-muted focus:border-accent"
        />

        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-10 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
          >
            {media.describe.cancel}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy}
            className="h-10 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
          >
            {busy ? media.describe.saving : media.describe.save}
          </button>
        </div>
      </div>
    </div>
  )
}

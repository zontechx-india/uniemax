import { useState } from 'react'
import { media } from './strings'
import type { BoardPhoto } from './types'
import { Button } from '../../../../shared/ui/Button'
import { ModalShell } from '../../../../shared/ui/ModalShell'
import { fieldClass } from '../../../../shared/ui/field'

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
    <ModalShell
      onClose={() => {
        if (!busy) onClose()
      }}
      label={media.describe.title}
      panelClassName="p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-sm"
    >
        <h3 className="text-lg font-semibold text-fg">
          {media.describe.title}
        </h3>
        <p className="mt-1 text-sm text-muted">{media.describe.help}</p>

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
          className={fieldClass({ className: 'mt-3' })}
        />

        <div className="mt-4 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {media.describe.cancel}
          </Button>
          <Button type="button" size="md" onClick={() => void save()} loading={busy}>
            {busy ? media.describe.saving : media.describe.save}
          </Button>
        </div>
    </ModalShell>
  )
}

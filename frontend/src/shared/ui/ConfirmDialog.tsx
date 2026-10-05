import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { ModalShell } from './ModalShell'

/**
 * A two-button question — "Delete this product?" — on the shared
 * `ModalShell` (bottom sheet on a phone, centred card from `sm`).
 *
 *   - Escape or a backdrop press cancels (both disabled while `busy`).
 *   - Focus lands on a field if the dialog holds one (a reason, a new
 *     password), otherwise on Cancel — the safe default for a destructive
 *     confirm.
 *   - `busy` locks both buttons for async confirms and shows the spinner.
 *   - `tone="danger"` gives the confirm the destructive (red) role; `neutral`
 *     the primary role.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** `danger` = red confirm (destructive), `neutral` = primary confirm. */
  tone?: 'danger' | 'neutral'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Move focus ONCE, when the dialog opens. `open` is the only dependency on
  // purpose: callers pass inline `onCancel` arrows, and a dialog holding a
  // field re-renders its parent per keystroke — depending on `onCancel` would
  // yank focus back to Cancel after every character.
  useEffect(() => {
    if (!open) return
    const field = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, select',
    )
    ;(field ?? cancelRef.current)?.focus()
  }, [open])

  return (
    <ModalShell
      open={open}
      onClose={() => {
        if (!busy) onCancel()
      }}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      labelledBy={titleId}
      panelRef={panelRef}
      panelClassName="overflow-y-auto px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-sm sm:p-6"
    >
      <h2 id={titleId} className="text-lg font-semibold text-fg">
        {title}
      </h2>
      <div className="mt-2 text-sm leading-relaxed text-muted">{description}</div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <Button
          ref={cancelRef}
          variant="secondary"
          size="lg"
          disabled={busy}
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
        <Button
          variant={tone === 'danger' ? 'danger' : 'primary'}
          size="lg"
          loading={busy}
          onClick={onConfirm}
        >
          {busy ? 'Please wait…' : confirmLabel}
        </Button>
      </div>
    </ModalShell>
  )
}

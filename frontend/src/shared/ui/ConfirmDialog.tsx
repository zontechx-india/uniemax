import { useEffect, useRef } from 'react'
import { useModalFocus } from './useModalFocus'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Accessible confirmation dialog, rendered into `document.body` via a portal.
 *
 *   - Escape or a backdrop click cancels (disabled while `busy`).
 *   - Focus lands on the cancel button when the dialog opens.
 *   - `busy` locks both buttons for async confirms (e.g. a logout request).
 *
 * **The portal is load-bearing, not tidiness.** Callers mount this next to
 * their trigger, and several triggers live inside sticky headers that carry
 * `backdrop-blur`. `backdrop-filter` makes an element a containing block for
 * `position: fixed` descendants, so without the portal `inset-0` resolved to
 * the 4rem header instead of the viewport and the dialog appeared squeezed
 * against the top of the page (the account-menu logout did exactly this).
 * Escaping to `<body>` makes the overlay viewport-centred wherever it is
 * used from.
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
  /** `danger` = red confirm (destructive), `neutral` = dark confirm. */
  tone?: 'danger' | 'neutral'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Before the focus effect below, so the opener it records is the element
  // that opened the dialog — not the dialog's own Cancel button.
  useModalFocus(panelRef, open)

  /**
   * Move focus ONCE, when the dialog opens.
   *
   * `open` is the only dependency on purpose. Callers pass inline arrows for
   * `onCancel`, so its identity changes on every parent render — and a dialog
   * whose description contains a field (a reason, a new password) re-renders
   * its parent on every keystroke. With `onCancel` in these deps, that pulled
   * focus back to Cancel after each character typed.
   *
   * Where the focus lands also depends on what the dialog holds: a field if
   * there is one (that is what the person came to fill in), otherwise Cancel
   * — the safe default for a plain destructive confirm.
   */
  useEffect(() => {
    if (!open) return
    const field = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, select',
    )
    ;(field ?? cancelRef.current)?.focus()
  }, [open])

  // Escape closes. Separate effect: this one genuinely needs the latest
  // `busy`/`onCancel`, and re-subscribing a listener is harmless.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, busy, onCancel])

  if (!open) return null

  const confirmClass =
    tone === 'danger'
      ? 'bg-brand text-brand-contrast hover:bg-brand-hover'
      : 'bg-fg text-bg hover:opacity-90'

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay)] p-4 sm:items-center"
      onMouseDown={() => {
        if (!busy) onCancel()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        // Dialogs that carry a field are taller than a bare confirm — cap the
        // height so a small phone screen scrolls the dialog instead of
        // pushing the buttons off the bottom.
        className="max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-lg border border-line bg-surface p-6 shadow-floating"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          id="confirm-dialog-title"
          className="font-heading text-base font-semibold text-fg"
        >
          {title}
        </h2>
        <div className="mt-2 text-sm text-muted">{description}</div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            ref={cancelRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-11 rounded-md border border-line bg-surface text-sm font-semibold text-fg transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`h-11 rounded-md text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:bg-line disabled:text-muted ${confirmClass}`}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { CloseIcon } from '../layout/icons'

/**
 * The console's content dialog — a record opened *in place* over the list
 * that led to it, so the admin keeps their filters, page and scroll
 * position when they close it.
 *
 * Distinct from `ConfirmDialog` on purpose: that one is a two-button
 * question; this one is a scrollable panel with its own header and an
 * optional action footer. Both share the same rules — Escape and a backdrop
 * click close, focus moves inside on open, and it is portalled to `<body>`
 * so a sticky header's `backdrop-filter` can't clip it (see ConfirmDialog
 * for why that matters).
 *
 * On a phone it rises from the bottom edge and takes the full width, as a
 * sheet; on a desktop it centres. The body scrolls, the header and footer
 * do not, so the actions stay reachable however long the content is.
 */
export function Dialog({
  open,
  title,
  subtitle,
  size = 'md',
  footer,
  onClose,
  children,
}: {
  open: boolean
  title: ReactNode
  subtitle?: ReactNode
  /** `md` suits a form; `lg` suits a record with media and tables. */
  size?: 'md' | 'lg'
  footer?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  // Lock the page behind the dialog — the panel scrolls, the list doesn't.
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  const width = size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg'

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-[var(--overlay)] sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-dialog-title"
        className={`flex max-h-[92vh] w-full flex-col rounded-t-lg border border-line bg-surface shadow-floating sm:max-h-[88vh] sm:rounded-lg ${width}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2
              id="content-dialog-title"
              className="truncate font-heading text-base font-semibold text-fg sm:text-lg"
            >
              {title}
            </h2>
            {subtitle ? <div className="mt-0.5 text-sm text-muted">{subtitle}</div> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-alt hover:text-fg"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

import { useEffect, useId, useRef } from 'react'
import { useModalFocus } from './useModalFocus'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * A content dialog — a record or a picker opened *in place* over the list
 * that led to it, so the user keeps their filters, page and scroll position
 * when they close it. Shared by the admin console and the seller's store
 * pages.
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
 *
 * The panel is frosted glass (`glass-strong`) over a lighter tinted overlay,
 * with a grab-handle on phones so it reads as a sheet, a 44px close target,
 * and the home-indicator inset kept clear on notched phones.
 */
export function Dialog({
  open,
  title,
  subtitle,
  size = 'md',
  flush = false,
  footer,
  onClose,
  children,
}: {
  open: boolean
  title: ReactNode
  subtitle?: ReactNode
  /** `md` suits a form; `lg` suits a record with media and tables. */
  size?: 'md' | 'lg'
  /** Body without padding — for edge-to-edge action rows (a sheet menu). */
  flush?: boolean
  footer?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Unique per instance — a hard-coded id collided when two were mounted.
  const titleId = useId()
  useModalFocus(panelRef, open)

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
      className="fixed inset-0 z-40 flex animate-dialog-backdrop items-end justify-center bg-[var(--overlay-soft)] sm:items-center sm:p-4"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`glass-strong flex max-h-[92dvh] w-full animate-sheet-in flex-col rounded-t-sheet sm:max-h-[88vh] sm:rounded-glass ${width}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* Grab-handle: phones only, where the panel is a sheet. */}
        <span
          aria-hidden
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-pill bg-fg/15 sm:hidden"
        />
        <header className="flex items-start justify-between gap-3 border-b border-line py-2 pr-2 pl-4 sm:pl-5">
          <div className="min-w-0 py-1.5">
            <h2
              id={titleId}
              className="truncate font-heading text-[17px] font-semibold text-fg sm:text-lg"
            >
              {title}
            </h2>
            {subtitle ? <div className="mt-0.5 text-hint text-muted">{subtitle}</div> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-tap shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-fg/5 hover:text-fg"
          >
            <CloseIcon />
          </button>
        </header>

        <div
          className={`min-h-0 flex-1 overflow-y-auto ${flush ? '' : 'px-4 pt-4 sm:px-5'} ${
            footer
              ? flush
                ? ''
                : 'pb-4'
              : 'pb-[max(1rem,env(safe-area-inset-bottom))]'
          }`}
        >
          {children}
        </div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

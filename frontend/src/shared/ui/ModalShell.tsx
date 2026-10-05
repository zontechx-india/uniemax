import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModalFocus } from './useModalFocus'

/**
 * THE modal base (docs/DESIGN_GUIDELINES.md §7, §12, §13). Every dialog,
 * sheet and drawer in the app is built on this, so they all behave alike:
 *
 * - portalled to `<body>` (a transformed or filtered ancestor cannot clip it;
 *   storefront modals opt out with `portal={false}` to keep the shop colours),
 * - one flat overlay (`--overlay-soft`), no blur,
 * - Escape and a backdrop press close (each can be turned off for flows
 *   where losing work would hurt, e.g. cropping a photo),
 * - the page behind stops scrolling,
 * - Tab stays inside the panel and focus returns to the opener on close.
 *
 * Placement is the only visual decision a caller makes:
 *
 * | placement      | phone                  | from `sm`              |
 * | -------------- | ---------------------- | ---------------------- |
 * | `sheet`        | bottom sheet, full width | centred card         |
 * | `center`       | centred card           | centred card           |
 * | `drawer-left`  | full-height panel, left | same                  |
 * | `drawer-right` | bottom sheet           | full-height panel, right |
 * | `fullscreen`   | whole screen           | caller sizes the panel |
 *
 * The panel is a flat surface (`bg-surface`, 16px corners, one floating
 * shadow). `panelClassName` adds width and layout; it never restyles it.
 */
export type ModalPlacement = 'sheet' | 'center' | 'drawer-left' | 'drawer-right' | 'fullscreen'

const OVERLAY: Record<ModalPlacement, string> = {
  sheet: 'items-end justify-center sm:items-center sm:p-4',
  center: 'items-center justify-center p-4',
  'drawer-left': 'items-stretch justify-start',
  'drawer-right': 'items-end justify-end sm:items-stretch',
  fullscreen: 'items-stretch justify-center sm:items-center sm:p-4',
}

const PANEL: Record<ModalPlacement, string> = {
  sheet:
    'w-full max-h-[92dvh] animate-sheet-in rounded-t-sheet sm:max-h-[88vh] sm:rounded-sheet',
  center: 'max-h-[94vh] animate-dialog-in rounded-sheet',
  'drawer-left': 'h-full w-[85%] max-w-sm animate-dialog-in border-r border-line',
  'drawer-right':
    'w-full max-h-[85vh] animate-sheet-in rounded-t-sheet sm:h-full sm:max-h-none sm:w-80 sm:rounded-none sm:border-l sm:border-line',
  fullscreen: 'h-full w-full animate-dialog-in sm:rounded-sheet',
}

export function ModalShell({
  open = true,
  onClose,
  placement = 'sheet',
  closeOnBackdrop = true,
  closeOnEscape = true,
  labelledBy,
  label,
  panelClassName = '',
  overlayStyle,
  zIndex = 'z-50',
  hideBelow,
  panelRef: externalPanelRef,
  portal = true,
  children,
}: {
  open?: boolean
  onClose: () => void
  placement?: ModalPlacement
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  /** id of the visible title. Prefer this over `label`. */
  labelledBy?: string
  /** Accessible name when there is no visible title. */
  label?: string
  /** Width / layout only (e.g. `sm:max-w-lg flex flex-col`). */
  panelClassName?: string
  /** CSS variables for a themed modal (a store's colours). */
  overlayStyle?: CSSProperties
  zIndex?: 'z-40' | 'z-50'
  /** Hide the whole modal from this breakpoint up (a phone-only drawer). */
  hideBelow?: 'lg'
  panelRef?: React.RefObject<HTMLDivElement | null>
  /**
   * Render in place instead of in <body>. For storefront modals: they must
   * stay inside the page root that carries the shop's colour variables.
   */
  portal?: boolean
  children: ReactNode
}) {
  const ownRef = useRef<HTMLDivElement>(null)
  const panelRef = externalPanelRef ?? ownRef
  useModalFocus(panelRef, open)

  useEffect(() => {
    if (!open || !closeOnEscape) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, closeOnEscape, onClose])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) return null

  const modal = (
    <div
      className={`fixed inset-0 ${zIndex} flex animate-dialog-backdrop bg-[var(--overlay-soft)] text-fg ${OVERLAY[placement]} ${hideBelow === 'lg' ? 'lg:hidden' : ''}`}
      style={overlayStyle}
      // mousedown, not click: a drag that starts in a field and ends on the
      // backdrop must not close the modal.
      onMouseDown={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={`relative bg-surface shadow-floating outline-none ${PANEL[placement]} ${panelClassName}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
  return portal ? createPortal(modal, document.body) : modal
}

/** The 44px round close button every modal header uses. */
export function ModalClose({
  onClick,
  label = 'Close',
  buttonRef,
  className = '',
}: {
  onClick: () => void
  label?: string
  buttonRef?: React.Ref<HTMLButtonElement>
  className?: string
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex size-tap shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-alt hover:text-fg ${className}`}
    >
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
    </button>
  )
}

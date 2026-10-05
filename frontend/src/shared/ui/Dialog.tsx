import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { ModalClose, ModalShell } from './ModalShell'

/**
 * A content dialog — a record, a picker or a form opened *in place* over the
 * list that led to it, so the user keeps their filters, page and scroll
 * position when they close it. Shared by the admin console and the seller's
 * store pages; built on `ModalShell` (bottom sheet on a phone with a
 * grab-handle, centred card from `sm`).
 *
 * The body scrolls; the header (title, optional subtitle, 44px close) and the
 * optional action footer do not, so the actions stay reachable however long
 * the content is. Distinct from `ConfirmDialog`, which is a two-button
 * question.
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
  const titleId = useId()

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      zIndex="z-40"
      panelClassName={`flex flex-col ${size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
    >
      {/* Grab-handle: phones only, where the panel is a sheet. */}
      <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-pill bg-fg/15 sm:hidden" />
      <header className="flex items-start justify-between gap-3 border-b border-line py-2 pr-2 pl-4 sm:pl-5">
        <div className="min-w-0 py-1.5">
          <h2 id={titleId} className="truncate text-lg font-semibold text-fg">
            {title}
          </h2>
          {subtitle ? <div className="mt-0.5 text-xs text-muted">{subtitle}</div> : null}
        </div>
        <ModalClose onClick={onClose} buttonRef={closeRef} />
      </header>

      <div
        className={`min-h-0 flex-1 overflow-y-auto ${flush ? '' : 'px-4 pt-4 sm:px-5'} ${
          footer ? (flush ? '' : 'pb-4') : 'pb-[max(1rem,env(safe-area-inset-bottom))]'
        }`}
      >
        {children}
      </div>

      {footer ? (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
          {footer}
        </footer>
      ) : null}
    </ModalShell>
  )
}

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Customer } from '../../../shared/auth/authApi'
import { AppLogoFull } from '../../../shared/ui/AppLogo'
import { useMarketSession } from '../../app/marketSession'
import { CloseIcon, StoreIcon } from '../../layout/icons'
import { storeVars } from '../publicStore/storeTheme'
import { closeAuthDialog, useAuthDialog } from './authDialogStore'
import type { AuthDialogBrand, AuthDialogRequest } from './authDialogStore'
import { CustomerAuthPanel } from './CustomerAuthPanel'
import { StorefrontHero } from './StorefrontHero'

/**
 * The in-place sign-in dialog — mounted ONCE in `StorefrontApp`, opened from
 * anywhere through `openAuthDialog()` (see `authDialogStore.ts`).
 *
 * Why a dialog: a seller shares `/store/{slug}`, and that surface is a
 * different router from `/login`, so signing in used to be two full page
 * loads mid-task (checkout, messaging the store). Here the page stays put;
 * on success `signedIn(customer)` flips the shared session and every
 * consumer (store header, checkout gate, Help page) re-renders as signed in.
 *
 * Layout: from `sm` an 80vw × 80vh panel (capped at `max-w-5xl`) — brand
 * column on the left from `md`, form on the right; below `sm` a full-screen
 * sheet, because 80% of a phone is too small for a form.
 *
 * Theme: the panel is portalled to `<body>` (sticky headers with
 * `backdrop-blur` would otherwise clip a fixed overlay — see ConfirmDialog),
 * which puts it OUTSIDE the div where `PublicStoreLayout` sets the store's
 * CSS variables. Callers inside a store pass `theme`, and the portal root
 * re-applies `storeVars()` so every semantic utility in here resolves to the
 * store palette. Two extra overrides make `PrimaryButton`
 * (`bg-brand-gradient text-brand-contrast`) render as the store's metal CTA
 * with the owner's CTA text color, instead of UnieMax purple on a store
 * panel. On the marketplace the root inherits the app palette (and its
 * dark/light mode, which lives on `<html>`).
 *
 * The host sits outside both routers, so it cannot navigate; callers pass
 * `onSignedIn` for any follow-up (e.g. "Sell on UnieMax" → `/mystores/new`).
 */
export function AuthDialog() {
  const req = useAuthDialog()
  if (!req) return null
  // Keyed so a new open never inherits the previous one's effects or state.
  return <OpenAuthDialog key={req.id} req={req} />
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function OpenAuthDialog({ req }: { req: AuthDialogRequest }) {
  const { state, signedIn } = useMarketSession()
  const panelRef = useRef<HTMLDivElement>(null)
  const brand: AuthDialogBrand = req.brand ?? { kind: 'market' }

  const handleSignedIn = (customer: Customer) => {
    signedIn(customer) // every consumer flips to authed…
    closeAuthDialog() // …and the dialog is gone in the same commit,
    req.onSignedIn?.(customer) // so a follow-up navigate never meets a guard mid-flip.
  }

  /**
   * Opened while the session probe was still running (only "Sell on UnieMax"
   * can — headers show Sign in to guests only): if the probe comes back
   * authed there is nothing to sign into. This watches the loading → authed
   * TRANSITION, not the state: checkout opens the dialog while the state is
   * (stale) authed and must stay open until the form succeeds.
   */
  const openedWhileLoading = useRef(state.status === 'loading')
  useEffect(() => {
    if (!openedWhileLoading.current || state.status !== 'authed') return
    closeAuthDialog()
    req.onSignedIn?.(state.user)
  }, [state, req])

  // Lock the page behind the dialog — the form column scrolls, the page doesn't.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  // Escape closes; Tab cycles inside the panel (a modal must not leak focus
  // to the page it covers). Focusables are read per keypress, so a view
  // change inside the panel needs no bookkeeping.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeAuthDialog()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Focus moves in on open (first field, else the panel) and back to the
  // opener on close — unless the opener has since unmounted (the mobile
  // drawer's button does), in which case there is nothing to return to.
  useEffect(() => {
    const field = panelRef.current?.querySelector<HTMLElement>('input:not([type="hidden"])')
    ;(field ?? panelRef.current)?.focus()
    return () => {
      if (req.opener?.isConnected) req.opener.focus()
    }
  }, [req])

  const themed = req.theme
    ? ({
        ...storeVars(req.theme),
        '--brand-gradient': 'var(--brand-metal)',
        '--brand-contrast': 'var(--cta-contrast)',
      } as React.CSSProperties)
    : undefined

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-[var(--overlay)] text-fg animate-dialog-backdrop sm:items-center sm:p-4"
      style={themed}
      // mousedown, not click: a drag that starts in a field and ends on the
      // backdrop must not close the dialog (same reason as ConfirmDialog).
      onMouseDown={closeAuthDialog}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
        tabIndex={-1}
        className="relative flex h-full w-full flex-col overflow-hidden bg-surface shadow-lifted outline-none animate-dialog-in sm:h-[80vh] sm:max-h-[720px] sm:w-[80vw] sm:max-w-5xl sm:rounded-lg sm:border sm:border-line md:grid md:grid-cols-[1.1fr_1fr]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={closeAuthDialog}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-alt hover:text-fg"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <BrandPanel brand={brand} />

        {/* Form column. `m-auto` on the inner block centres a short form and
            lets a tall one (register, the Google dev panel) scroll within
            this column while the brand panel stays put. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-10 sm:px-10">
          <div className="m-auto w-full max-w-sm">
            {brand.kind === 'store' && (
              // Below `md` the brand panel is hidden, so the store still
              // introduces itself — compactly, above the title.
              <div className="mb-5 flex items-center gap-3 md:hidden">
                <StoreLogo brand={brand} className="h-8 w-8 rounded-md" />
                <span className="metal-text truncate font-heading text-base font-semibold">
                  {brand.name}
                </span>
              </div>
            )}

            <h2 id="auth-dialog-title" className="font-heading text-2xl font-bold text-fg">
              {brand.kind === 'store' ? 'Sign in' : 'Welcome back'}
            </h2>
            <p className="mb-6 mt-1 text-sm text-muted">
              {brand.kind === 'store'
                ? `Sign in to shop at ${brand.name}`
                : 'Sign in to continue shopping'}
            </p>

            {state.status === 'loading' ? (
              <div className="space-y-4" aria-busy="true">
                <div className="h-12 animate-pulse rounded-md bg-surface-alt" />
                <div className="h-12 animate-pulse rounded-md bg-surface-alt" />
                <div className="h-12 animate-pulse rounded-md bg-surface-alt" />
              </div>
            ) : (
              <CustomerAuthPanel
                variant="dialog"
                initialView={req.initialView}
                onSignedIn={handleSignedIn}
              />
            )}

            <p className="mt-6 text-center text-xs text-muted">
              Browsing and checkout work without an account — sign in to see
              your orders.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Left column (md+): the UnieMax photo hero on the marketplace; inside a
 * store, the store's own identity in its palette — the dialog should feel
 * like the shop asking, with UnieMax as the quiet "powered by" line.
 */
function BrandPanel({ brand }: { brand: AuthDialogBrand }) {
  if (brand.kind === 'market') {
    return (
      <div className="hidden md:flex md:min-h-0 md:flex-col">
        <StorefrontHero className="rounded-none p-8" />
      </div>
    )
  }

  return (
    <div className="hidden md:flex md:min-h-0 md:flex-col md:justify-between md:border-r md:border-line md:bg-bg md:p-8 lg:p-10">
      <div>
        <StoreLogo brand={brand} className="h-16 w-16 rounded-lg" />
        <h2 className="metal-text mt-6 font-heading text-3xl font-bold">{brand.name}</h2>
        <p className="mt-2 max-w-xs text-sm text-muted">
          Sign in to shop at {brand.name} — track orders, check out faster and
          message the store.
        </p>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted">
        <AppLogoFull className="h-4 w-4" />
        Powered by UnieMax
      </p>
    </div>
  )
}

/** The store's logo, or the same CTA-tinted tile the store header falls back to. */
function StoreLogo({
  brand,
  className,
}: {
  brand: Extract<AuthDialogBrand, { kind: 'store' }>
  className: string
}) {
  if (brand.logoUrl) {
    return <img src={brand.logoUrl} alt="" className={`shrink-0 object-cover ${className}`} />
  }
  return (
    <span className={`flex shrink-0 items-center justify-center metal-cta text-cta-contrast ${className}`}>
      <StoreIcon className="h-1/2 w-1/2" />
    </span>
  )
}

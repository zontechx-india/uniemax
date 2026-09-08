import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { ACCOUNT_MENU_ITEMS } from '../app/navigation'
import { useCustomerSession } from '../app/sessionContext'
import { storesApi } from '../features/stores/storesApi'
import { Avatar } from './Avatar'
import { ChevronDownIcon, LogoutIcon, StoreIcon } from './icons'
import { useSignOutConfirm } from './useSignOutConfirm'

/**
 * Top-bar account dropdown (Flipkart-style "Your Account" menu).
 *
 *   - Opens on hover (desktop) — a short close delay bridges the gap
 *     between trigger and panel — and toggles on click/tap (touch).
 *   - Closes on item click, Escape, or an outside tap.
 *   - Nav items come from `ACCOUNT_MENU_ITEMS`; Logout is a separate
 *     action row that runs the shared confirm-dialog flow.
 *
 * `crossRouter` is set by the ONE caller outside the marketplace router —
 * `StoreHeader`, inside the anonymous shopping router. Every destination here
 * (`/profile`, `/orders`, `/mystores`, …) is a marketplace route that the
 * public router has never heard of, so there the rows must be plain anchors
 * (full page load) rather than react-router `Link`s, and logout hard-replaces
 * the location instead of navigating. Colors need no such switch: the menu is
 * built from the semantic tokens (`bg-surface`, `text-fg`, `border-line`)
 * that `storeVars()` re-points, so inside a store it wears the store's
 * palette automatically.
 */
export function AccountMenu({ crossRouter = false }: { crossRouter?: boolean } = {}) {
  const { customer } = useCustomerSession()
  const signOutFlow = useSignOutConfirm({ crossRouter })
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  // Store row: "Create Store" when the customer owns none, "My Store"
  // otherwise. Refreshed every time the menu opens so it flips right after
  // a store is created. `null` = not known yet (treated like "My Store" —
  // /mystores handles the empty case gracefully anyway).
  const [hasStores, setHasStores] = useState<boolean | null>(null)
  const checkedStores = useRef(false)
  useEffect(() => {
    if (!open && checkedStores.current) return // once on mount, then per open
    checkedStores.current = true
    let cancelled = false
    storesApi
      .list()
      .then((stores) => {
        if (!cancelled) setHasStores(stores.length > 0)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  const openNow = () => {
    window.clearTimeout(closeTimer.current)
    setOpen(true)
  }
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 150)
  }

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  // Escape / outside tap close the panel (needed for touch, where there
  // is no mouseleave).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const name = customer.name ?? 'Customer'
  const contact = customer.email ?? customer.phone ?? ''

  return (
    <div
      ref={rootRef}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-surface-alt sm:pl-3"
      >
        {/* Single line always — long names truncate, never wrap the bar. */}
        <span className="hidden max-w-36 truncate whitespace-nowrap text-sm font-medium text-fg sm:block">
          {name}
        </span>
        <Avatar customer={customer} className="h-9 w-9" />
        <ChevronDownIcon
          className={`hidden h-3.5 w-3.5 text-muted transition-transform sm:block ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        // pt-2 keeps the hover unbroken between the trigger and the panel.
        <div className="absolute right-0 top-full z-30 pt-2">
          <div
            role="menu"
            className="w-64 overflow-hidden rounded-lg border border-line bg-surface py-2 shadow-floating"
          >
            <div className="flex items-center gap-3 px-4 pb-3 pt-2">
              <Avatar customer={customer} className="h-10 w-10" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-fg">
                  {name}
                </p>
                {contact && (
                  <p className="truncate text-xs text-muted">{contact}</p>
                )}
              </div>
            </div>
            <div className="mx-2 border-t border-line" />

            <div className="py-1">
              <MenuRow
                to={hasStores === false ? '/mystores/new' : '/mystores'}
                crossRouter={crossRouter}
                onNavigate={() => setOpen(false)}
              >
                <StoreIcon className="h-[18px] w-[18px] text-muted" />
                {hasStores === false ? 'Create Store' : 'My Store'}
              </MenuRow>
              {ACCOUNT_MENU_ITEMS.map(({ label, to, icon: Icon }) => (
                <MenuRow
                  key={label}
                  to={to}
                  crossRouter={crossRouter}
                  onNavigate={() => setOpen(false)}
                >
                  <Icon className="h-[18px] w-[18px] text-muted" />
                  {label}
                </MenuRow>
              ))}
            </div>
            <div className="mx-2 border-t border-line" />

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                signOutFlow.request()
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
            >
              <LogoutIcon className="h-[18px] w-[18px]" />
              Logout
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={signOutFlow.confirming}
        title="Logout?"
        description="You'll need to sign in again to access your account."
        confirmLabel="Logout"
        busy={signOutFlow.busy}
        onConfirm={signOutFlow.confirm}
        onCancel={signOutFlow.cancel}
      />
    </div>
  )
}

/**
 * One navigation row of the dropdown. A react-router `Link` normally; a plain
 * anchor when the menu is rendered outside the marketplace router (see
 * `crossRouter` on `AccountMenu`), where these paths don't exist as routes.
 */
function MenuRow({
  to,
  crossRouter,
  onNavigate,
  children,
}: {
  to: string
  crossRouter: boolean
  onNavigate: () => void
  children: React.ReactNode
}) {
  const className =
    'flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-alt'

  if (crossRouter) {
    return (
      <a href={to} role="menuitem" onClick={onNavigate} className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link to={to} role="menuitem" onClick={onNavigate} className={className}>
      {children}
    </Link>
  )
}

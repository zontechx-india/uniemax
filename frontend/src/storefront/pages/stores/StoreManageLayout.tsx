import { useCallback, useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Link, Navigate, NavLink, Outlet, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { storesApi } from '../../features/stores/storesApi'
import type { StoreDashboard } from '../../features/stores/storesApi'
import { useStore } from '../../features/stores/useStores'
import type { ManagedStoreContext } from '../../features/stores/useManagedStore'
import { StorePublishCard } from './StorePublishCard'
import {
  ArrowLeftIcon,
  BankIcon,
  BoxIcon,
  CardIcon,
  CartIcon,
  ChartIcon,
  ClipboardIcon,
  FooterIcon,
  HomeIcon,
  PaletteIcon,
  StoreIcon,
  TagIcon,
  TruckIcon,
} from '../../layout/icons'

/**
 * Store management — Flipkart-account style split inside the app's main
 * outlet: a left card listing the manage sections, and a right card where
 * the selected section renders (nested routes → inner <Outlet/>).
 *
 * Children receive the loaded store through outlet context — use
 * `useManagedStore()` (features/stores) instead of refetching.
 */

interface SectionItem {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
  /** Exact-match highlighting (the index route only). */
  end?: boolean
  /** Renders the pending-order count. Only Orders carries live state. */
  badge?: boolean
}

/**
 * Sections grouped by what the seller is actually doing, because a flat list
 * of twelve made a once-ever setting (Bank Accounts) look as important as a
 * daily job (Orders).
 *
 * - **Overview / Catalog** are the daily work, so they lead — Catalog used to
 *   sit last despite Products being the most-opened section after Orders.
 *   Categories precedes Products because the app enforces that order anyway
 *   (Products is gated until a category exists).
 * - **Storefront** is what a customer sees (all four are safe to experiment
 *   with); **Settings** is how the business runs — money and fulfilment, three
 *   of which confirm before saving because they hit the live checkout. Store
 *   Details is branding, not configuration, so it sits under Storefront.
 * - Payments precedes Bank Accounts: payout accounts only matter once online
 *   payment is switched on, and that page already links across when it needs one.
 *
 * Deliberately NOT collapsible — twelve items over four groups fit on screen,
 * and an accordion would add a click before every navigation while hiding the
 * item being hunted for.
 */
const SECTION_GROUPS: { caption: string; items: SectionItem[] }[] = [
  {
    caption: 'Overview',
    items: [
      { label: 'Dashboard', to: '.', icon: ChartIcon, end: true },
      { label: 'Orders', to: 'orders', icon: CartIcon, badge: true },
    ],
  },
  {
    caption: 'Catalog',
    items: [
      { label: 'Categories', to: 'categories', icon: TagIcon },
      { label: 'Products', to: 'products', icon: BoxIcon },
    ],
  },
  {
    caption: 'Storefront',
    items: [
      { label: 'Store Details', to: 'details', icon: StoreIcon },
      { label: 'Appearance', to: 'appearance', icon: PaletteIcon },
      { label: 'Homepage', to: 'homepage', icon: HomeIcon },
      { label: 'Footer', to: 'footer', icon: FooterIcon },
    ],
  },
  {
    caption: 'Settings',
    items: [
      { label: 'Payments', to: 'payments', icon: CardIcon },
      { label: 'Bank Accounts', to: 'bank-accounts', icon: BankIcon },
      { label: 'Shipping', to: 'shipping', icon: TruckIcon },
      { label: 'Checkout', to: 'checkout', icon: ClipboardIcon },
    ],
  },
]

export function StoreManageLayout() {
  // The URL uses the store's slug (its public identity); the backend
  // resolves id or slug interchangeably, so the same hook works.
  const { storeSlug } = useParams()
  const { store, setStore } = useStore(storeSlug)
  const storeId = store?.id ?? null

  // The dashboard is fetched HERE, not on the Dashboard page: the nav badge
  // needs it too, and this layout outlives section navigation, so the seller
  // pays for it once per management session rather than on every visit to the
  // Dashboard section.
  const [dashboard, setDashboard] = useState<StoreDashboard | null>(null)
  const [dashboardError, setDashboardError] = useState<string | null>(null)
  // `inFlight` coalesces concurrent callers; `request` discards a response
  // that lands after the seller has switched stores.
  const inFlight = useRef(false)
  const request = useRef(0)

  const refreshDashboard = useCallback(() => {
    if (!storeId || inFlight.current) return
    inFlight.current = true
    const id = ++request.current
    storesApi
      .getDashboard(storeId)
      .then((data) => {
        if (request.current !== id) return
        setDashboard(data)
        setDashboardError(null)
      })
      .catch((err) => {
        if (request.current === id) setDashboardError(toApiError(err).message)
      })
      .finally(() => {
        inFlight.current = false
      })
  }, [storeId])

  // Runs on arrival and whenever the store changes (`refreshDashboard` is keyed
  // to `storeId`). The Dashboard page only re-fetches on RE-entry, so there is
  // no duplicate request on first load.
  useEffect(() => {
    setDashboard(null)
    setDashboardError(null)
    request.current++
    inFlight.current = false
    refreshDashboard()
  }, [refreshDashboard])

  if (store === undefined) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        Loading…
      </div>
    )
  }

  // Unknown/foreign store id → back to the list.
  if (store === null) return <Navigate to="/stores" replace />

  const pendingOrders = dashboard?.stats.pending ?? 0

  return (
    // The shell is full-width now; this workbench self-caps so form fields
    // and catalog rows stay a readable length on wide screens.
    <div className="mx-auto max-w-7xl space-y-3">
      <Link
        to="/stores"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        All stores
      </Link>

      <div className="items-start gap-3 space-y-3 lg:grid lg:grid-cols-[260px_1fr] lg:space-y-0">
        {/* Left: section picker */}
        <aside className="rounded-lg bg-surface shadow-floating">
          <div className="flex items-center gap-3 border-b border-line p-4">
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt=""
                className="h-11 w-11 shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                <StoreIcon className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs text-muted">Managing</p>
              <h1 className="truncate font-body text-sm font-semibold tracking-normal text-fg">
                {store.name}
              </h1>
            </div>
          </div>

          <nav className="p-2">
            {SECTION_GROUPS.map((group, index) => (
              <div key={group.caption} className={index > 0 ? 'mt-3' : ''}>
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">
                  {group.caption}
                </p>
                {group.items.map(({ label, to, icon: Icon, end, badge }) => (
                  <NavLink
                    key={label}
                    to={to}
                    end={end}
                    // Selection is carried by the solid left BAR plus the
                    // Light-Purple tint, with the label staying ink in both
                    // schemes — the brand purple has its own dark step, so
                    // this no longer needs to swap carrier per scheme (the
                    // gold did). The transparent border on every row keeps
                    // the text from shifting 3px.
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-md border-l-[3px] px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'border-brand bg-brand-soft font-semibold text-fg'
                          : 'border-transparent font-medium text-muted hover:bg-surface-alt hover:text-fg'
                      }`
                    }
                  >
                    <Icon className="h-[18px] w-[18px] shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {badge && pendingOrders > 0 && (
                      <span
                        // Not aria-hidden: "3 orders waiting" is the whole
                        // point of the badge for a screen-reader user too.
                        aria-label={`${pendingOrders} pending`}
                        className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-brand px-1.5 text-[11px] font-bold text-brand-contrast"
                      >
                        {pendingOrders > 99 ? '99+' : pendingOrders}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <StorePublishCard store={store} onStoreChange={setStore} />
        </aside>

        {/* Right: the selected section */}
        <section className="min-h-[400px] rounded-lg bg-surface p-4 shadow-floating sm:p-5">
          <Outlet
            context={
              {
                store,
                onStoreChange: setStore,
                dashboard,
                dashboardError,
                refreshDashboard,
              } satisfies ManagedStoreContext
            }
          />
        </section>
      </div>
    </div>
  )
}

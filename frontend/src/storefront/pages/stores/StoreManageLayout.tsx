import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { storesApi } from '../../features/stores/storesApi'
import type { StoreDashboard } from '../../features/stores/storesApi'
import { useStore } from '../../features/stores/useStores'
import type { StepState } from '../../features/stores/storeProfile'
import type { ManagedStoreContext } from '../../features/stores/useManagedStore'
import { StorePublishCard } from './StorePublishCard'
import { StoreSectionNav, useNavRail } from './StoreSectionNav'
import { ArrowLeftIcon, PanelLeftIcon, StoreIcon } from '../../layout/icons'

/**
 * Store management — Flipkart-account style split inside the app's main
 * outlet: a left card listing the manage sections, and a right card where
 * the selected section renders (nested routes → inner <Outlet/>).
 *
 * The section list itself (grouping, collapsing, the icon rail, the mobile
 * dropdown) lives in `StoreSectionNav`; this file owns the shell plus the
 * store and dashboard fetches the nav reads.
 *
 * Children receive the loaded store through outlet context — use
 * `useManagedStore()` (features/stores) instead of refetching.
 */

export function StoreManageLayout() {
  // The URL uses the store's slug (its public identity); the backend
  // resolves id or slug interchangeably, so the same hook works.
  const { storeSlug } = useParams()
  const { store, setStore } = useStore(storeSlug)
  const storeId = store?.id ?? null

  // Minimised-nav preference. Owned here because the grid track width is this
  // file's; the nav renders the icons.
  const [rail, toggleRail] = useNavRail()

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
  if (store === null) return <Navigate to="/mystores" replace />

  const pendingOrders = dashboard?.stats.pending ?? 0

  /**
   * Setup marks per nav row.
   *
   * A readiness step already declares the section it is edited in (`href`),
   * so this is grouped straight off the server's registry rather than a
   * second hardcoded list here — add a requirement to `storeReadiness.ts` and
   * its mark appears against the right row with no change to this file.
   *
   * Empty once the store is fully set up: a column of green ticks that can
   * never change again is decoration, and the same reasoning already hides
   * `SetupChecklist` at 100%.
   */
  const setupSteps = new Map<string, StepState[]>()
  if (!store.readiness.complete) {
    for (const step of store.readiness.steps) {
      if (step.totalCount === 0) continue
      setupSteps.set(step.href, [...(setupSteps.get(step.href) ?? []), step])
    }
  }

  return (
    // The shell is full-width now; this workbench self-caps so form fields
    // and catalog rows stay a readable length on wide screens.
    <div className="mx-auto max-w-7xl space-y-3">
      <Link
        to="/mystores"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        All stores
      </Link>

      <div
        className={`items-start gap-3 space-y-3 lg:grid lg:space-y-0 ${
          rail ? 'lg:grid-cols-[64px_1fr]' : 'lg:grid-cols-[264px_1fr]'
        }`}
      >
        {/* Left: section picker */}
        <aside className="min-w-0 rounded-lg bg-surface shadow-floating">
          {/* Store identity + the rail toggle. In rail mode the logo alone
              carries the identity (the name is its tooltip) — a 64px column
              has no room for a second line, and the seller knows which store
              they opened. */}
          {/* Rail is a DESKTOP mode — below `lg` the nav is a dropdown and
              this header stays full — so every rail rule here is `lg:`-only. */}
          <div
            className={`flex items-center gap-3 border-b border-line p-4 ${
              rail ? 'lg:flex-col lg:gap-2 lg:p-2' : ''
            }`}
          >
            {store.logoUrl ? (
              <img
                src={store.logoUrl}
                alt=""
                title={rail ? store.name : undefined}
                className={`h-11 w-11 shrink-0 rounded-md object-cover ${rail ? 'lg:h-10 lg:w-10' : ''}`}
              />
            ) : (
              <div
                title={rail ? store.name : undefined}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand ${
                  rail ? 'lg:h-10 lg:w-10' : ''
                }`}
              >
                <StoreIcon className="h-5 w-5" />
              </div>
            )}
            <div className={`min-w-0 flex-1 ${rail ? 'lg:hidden' : ''}`}>
              <p className="text-xs text-muted">Managing</p>
              <h1 className="truncate font-body text-sm font-semibold tracking-normal text-fg">
                {store.name}
              </h1>
            </div>
            <button
              type="button"
              onClick={toggleRail}
              aria-pressed={rail}
              title={rail ? 'Expand sections' : 'Minimise sections'}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-surface-alt hover:text-fg lg:inline-flex"
            >
              <PanelLeftIcon className="h-4 w-4" />
              <span className="sr-only">
                {rail ? 'Expand sections' : 'Minimise sections'}
              </span>
            </button>
          </div>

          <StoreSectionNav
            rail={rail}
            pendingOrders={pendingOrders}
            setupSteps={setupSteps}
          />

          {/* Publish & share needs prose width, so rail mode keeps only its
              state — a dot the seller can hover. The rail is a desktop idea
              (below `lg` the nav is a dropdown), so the full card still
              renders on a phone whatever the stored preference says. */}
          {rail && (
            <div
              className="hidden justify-center border-t border-line py-3 lg:flex"
              title={store.isPublished ? 'Published' : 'Not published'}
            >
              <span
                role="img"
                aria-label={store.isPublished ? 'Published' : 'Not published'}
                className={`h-2.5 w-2.5 rounded-full ${
                  store.isPublished ? 'bg-success' : 'bg-line'
                }`}
              />
            </div>
          )}
          <div className={rail ? 'lg:hidden' : ''}>
            <StorePublishCard store={store} onStoreChange={setStore} />
          </div>
        </aside>

        {/* Right: the selected section.

            `min-w-0` is load-bearing: a grid item defaults to
            `min-width: auto`, so anything wide inside (a horizontal card
            strip, a table, a long unbroken string) grows the `1fr` track past
            its share and pushes the whole panel off the right edge instead of
            scrolling or truncating within it. */}
        <section className="min-w-0 min-h-[400px] rounded-lg bg-surface p-4 shadow-floating sm:p-5">
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

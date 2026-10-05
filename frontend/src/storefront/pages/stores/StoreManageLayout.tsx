import { usePrivatePageTitle } from '../../../shared/seo'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { storesApi } from '../../features/stores/storesApi'
import type { StoreDashboard } from '../../features/stores/storesApi'
import { useStore } from '../../features/stores/useStores'
import { isLaunchStep } from '../../features/stores/storeProfile'
import type { StepState } from '../../features/stores/storeProfile'
import type { ManagedStoreContext } from '../../features/stores/useManagedStore'
import { StorePublishCard, StoreShareSheet } from './StorePublishCard'
import { StoreSectionNav, useNavRail } from './StoreSectionNav'
import { StoreMobileNav } from './StoreMobileNav'
import { buttonClass } from '../../../shared/ui/Button'
import {
  ArrowLeftIcon,
  PanelLeftIcon,
  ShareIcon,
  ShieldCheckIcon,
  StoreIcon,
} from '../../layout/icons'
import { useStoreManageScope } from '../../features/stores/storeManageScope'
import { MediaImg } from '../../../shared/media/MediaImg'
import { ToastHost } from './ui/Toast'

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
  // A tab title a seller can find among open tabs ("Manage · Lakshmi Sarees").
  usePrivatePageTitle('Manage', store?.name)
  // Owner by default; the admin console wraps these routes to say otherwise.
  const scope = useStoreManageScope()

  // Minimised-nav preference. Owned here because the grid track width is this
  // file's; the nav renders the icons.
  const [rail, toggleRail] = useNavRail()
  // Phone Share / Publish sheet, opened from the store strip.
  const [shareOpen, setShareOpen] = useState(false)

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

  // Readiness is derived from the catalog server-side; catalog pages call
  // this after they change it so the nav badges and publish card follow.
  const refreshStore = useCallback(() => {
    if (!storeId) return
    storesApi
      .get(storeId)
      .then((fresh) => setStore(fresh))
      .catch(() => {})
  }, [storeId, setStore])

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
    // The shape of the page, not the word "Loading…".
    return (
      <div aria-busy="true" aria-label="Loading your shop" className="mx-auto max-w-7xl space-y-3">
        <div className="glass h-[68px] animate-pulse rounded-glass lg:hidden" />
        <div className="items-start gap-3 lg:grid lg:grid-cols-[264px_1fr]">
          <div className="glass hidden h-[520px] animate-pulse rounded-glass lg:block" />
          <div className="glass h-[420px] animate-pulse rounded-glass" />
        </div>
      </div>
    )
  }

  // Unknown/foreign store id → back to the list this store was opened from
  // (the seller's own stores, or the admin console's store list).
  if (store === null) return <Navigate to={scope.indexPath} replace />

  const pendingOrders = dashboard?.stats.pending ?? 0

  /**
   * Setup marks per nav row.
   *
   * A readiness step already declares the section it is edited in (`href`),
   * so this is grouped straight off the server's registry rather than a
   * second hardcoded list here — add a requirement to `storeReadiness.ts` and
   * its mark appears against the right row with no change to this file.
   *
   * Only steps that block PUBLISHING, and only until the store is live.
   * Address, tax and payout are optional for a cash-on-delivery shop; marking
   * them "Pending" kept Business Details looking unfinished forever for
   * sellers who never want online payment. They are surfaced on the
   * Dashboard's "Accept online payments" card and enforced where they apply.
   */
  const setupSteps = new Map<string, StepState[]>()
  if (!store.isPublished) {
    for (const step of store.readiness.steps) {
      if (step.totalCount === 0 || !isLaunchStep(step)) continue
      setupSteps.set(step.href, [...(setupSteps.get(step.href) ?? []), step])
    }
  }

  return (
    // The shell is full-width now; this workbench self-caps so form fields
    // and catalog rows stay a readable length on wide screens.
    //
    // `--seller-dock` is the height of the phone tab bar (`StoreMobileNav`):
    // the page pads by it so the last row is not hidden under the bar, and
    // sticky save bars / toasts read it to sit above the bar. Zero from `lg`,
    // where there is no bar.
    <div className="mx-auto max-w-7xl space-y-3 pb-[var(--seller-dock)] [--seller-dock:calc(84px+env(safe-area-inset-bottom))] lg:pb-0 lg:[--seller-dock:0px]">
      <Link
        to={scope.indexPath}
        className="hidden min-h-tap items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg lg:inline-flex"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        All stores
      </Link>

      {/* Phone: one glass strip naming the shop, whether it is live, and the
          ONE thing to do with it — Share once live, Publish until then. It
          replaced the sidebar card that stacked above every section. */}
      <div className="glass flex items-center gap-2 rounded-glass p-2 lg:hidden">
        <Link
          to={scope.indexPath}
          aria-label="All stores"
          className="flex size-tap shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-fg/5 hover:text-fg"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        {store.logoUrl ? (
          <MediaImg
            sizes="40px"
            src={store.logoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <StoreIcon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-[16px] font-bold text-fg">{store.name}</p>
          <span
            className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${
              store.isPublished ? 'text-success' : 'text-pending'
            }`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${store.isPublished ? 'bg-success' : 'bg-pending'}`}
            />
            {store.isPublished ? 'Live' : 'Not live yet'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShareOpen(true)}
          aria-haspopup="dialog"
          className={buttonClass({
            variant: store.isPublished ? 'secondary' : 'primary',
            size: 'md',
            className: 'px-3.5',
          })}
        >
          <ShareIcon className="h-4 w-4" />
          {store.isPublished ? 'Share' : 'Publish'}
        </button>
      </div>

      {/* Acting on someone else's shop.
          Every screen below this point is the seller's own dashboard, pixel
          for pixel — which is the point (support sees what the caller is
          describing) and also the risk: an admin four clicks in could forget
          whose catalog they are editing. So the warning is not a one-time
          toast but a permanent band, naming the shop, that stays on screen
          for as long as the admin view is open. */}
      {scope.mode === 'admin' && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-glass border border-pending/40 bg-pending-soft px-4 py-2.5 text-sm"
        >
          <ShieldCheckIcon className="h-4 w-4 shrink-0 text-pending" />
          <span className="font-semibold text-fg">Admin view</span>
          <span className="text-muted">
            You are editing{' '}
            <span className="font-medium text-fg">{store.name}</span> on behalf
            of its owner. Changes save as the seller&rsquo;s own and are
            recorded in the activity log.
          </span>
        </div>
      )}

      <div
        className={`items-start gap-3 space-y-3 lg:grid lg:space-y-0 ${
          rail ? 'lg:grid-cols-[64px_1fr]' : 'lg:grid-cols-[264px_1fr]'
        }`}
      >
        {/* Left: section picker — desktop only; phones use the tab bar.
            Sticky so the publish card stays in view beside a long form. */}
        <aside className="glass hidden min-w-0 rounded-glass lg:sticky lg:top-[4.5rem] lg:block">
          {/* The sidebar scrolls itself once it is taller than the window. */}
          <div className="max-h-[calc(100dvh-5.5rem)] overflow-y-auto">

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
              <MediaImg
                sizes="44px"
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
          </div>
        </aside>

        {/* Right: the selected section.

            `min-w-0` is load-bearing: a grid item defaults to
            `min-width: auto`, so anything wide inside (a horizontal card
            strip, a table, a long unbroken string) grows the `1fr` track past
            its share and pushes the whole panel off the right edge instead of
            scrolling or truncating within it. */}
        <section className="glass min-h-[400px] min-w-0 rounded-glass p-4 sm:p-6">
          <Outlet
            context={
              {
                store,
                onStoreChange: setStore,
                dashboard,
                dashboardError,
                refreshDashboard,
                refreshStore,
              } satisfies ManagedStoreContext
            }
          />
        </section>
      </div>

      {/* Phone navigation + its share sheet. Outside every glass panel on
          purpose: the bar is `fixed`, and a `backdrop-filter` ancestor would
          become its containing block. */}
      <StoreMobileNav
        storeName={store.name}
        pendingOrders={pendingOrders}
        setupSteps={setupSteps}
      />
      <StoreShareSheet
        open={shareOpen}
        store={store}
        onStoreChange={setStore}
        onClose={() => setShareOpen(false)}
      />

      {/* "Saved ✓" confirmations for instant saves (stores/ui `showToast`). */}
      <ToastHost />
    </div>
  )
}

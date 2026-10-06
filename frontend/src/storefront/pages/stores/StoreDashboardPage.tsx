import { useEffect, useRef } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { buttonClass } from '../../../shared/ui/Button'
import { ErrorNote } from '../../../shared/ui/form'
import { formatPrice, publicStoreUrl } from '../../features/stores/storesApi'
import type { Store, StoreDashboard } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { useStoreManageScope } from '../../features/stores/storeManageScope'
import {
  ArrowRightIcon,
  BoxIcon,
  CartIcon,
  CheckIcon,
  ShareIcon,
  StoreIcon,
} from '../../layout/icons'
import { SellerOrderRow } from './orderMeta'
import { SetupChecklist } from './SetupChecklist'
import { ShopTrustTips } from './ShopTrustTips'
import { launchSteps, stepAction, stepMissing } from './setupSteps'
import { usePublishActions, whatsAppShareUrl } from './usePublishActions'
import { EmptyState } from './ui/EmptyState'
import { WhatsAppShareLink } from './ui/WhatsAppShareLink'

/**
 * Dashboard — the landing view of store management.
 *
 * It opens on a HERO — a tinted glass card (`glass-tint`), not a solid block,
 * so the one strong colour on it is the next-step button — that answers the
 * only two questions a seller has when
 * they arrive: *how am I doing?* (today's orders, waiting orders, sales) and
 * *what should I do now?* — ONE next step with ONE button, picked from the
 * shop's state:
 *
 *   not live, something missing → the first missing launch step
 *   not live, ready             → Publish my shop
 *   live, orders waiting        → See waiting orders
 *   live, no orders yet         → Share on WhatsApp
 *   live, all caught up         → Share on WhatsApp again
 *
 * Under it: the order pipeline as tappable chips (scrolling sideways on a
 * phone), the latest orders as cards, and the setup checklist — above the
 * numbers until the shop is live, below them once orders are coming in. Last,
 * `ShopTrustTips`: what the shop page still lacks (WhatsApp number, about
 * line, logo) for customers to trust it.
 */

const PIPELINE: {
  key: keyof StoreDashboard['stats']
  label: string
  /** Deep link into the Orders section (relative to the manage layout). */
  to?: string
  dot: string
}[] = [
  { key: 'pending', label: 'Waiting', to: 'orders?status=PENDING', dot: 'bg-pending' },
  // Processing spans two statuses (Confirmed + Packed) — link to the full
  // list rather than pretending one status covers it.
  { key: 'processing', label: 'Getting ready', to: 'orders', dot: 'bg-accent' },
  { key: 'shipped', label: 'Sent', to: 'orders?status=SHIPPED', dot: 'bg-brand' },
  { key: 'completed', label: 'Delivered', to: 'orders?status=DELIVERED', dot: 'bg-success' },
  { key: 'cancelled', label: 'Cancelled', to: 'orders?status=CANCELLED', dot: 'bg-muted' },
  { key: 'refunded', label: 'Refunded', dot: 'bg-muted' },
]

export function StoreDashboardPage() {
  // The layout owns this data — it also feeds the Orders badge in the nav, and
  // keeping it there means re-entering this section is instant instead of
  // re-fetching (see ManagedStoreContext).
  const {
    store,
    onStoreChange,
    dashboard,
    dashboardError: error,
    refreshDashboard,
  } = useManagedStore()

  // Snapshot at mount: with data already in hand we are RE-entering the
  // section, so pull a fresh copy. Empty means the layout's own initial load
  // is already in flight — asking again would just duplicate it.
  const reEntered = useRef(dashboard !== null)
  useEffect(() => {
    if (reEntered.current) refreshDashboard()
  }, [refreshDashboard])

  const hasOrders = (dashboard?.stats.totalOrders ?? 0) > 0
  // Once a LIVE store has orders, they are the daily job: the optional
  // online-payments setup moves below them. (Unpublished, "get live" leads.)
  const setupBelow = store.isPublished && hasOrders

  return (
    <div className="space-y-5">
      <Hero store={store} dashboard={dashboard} onStoreChange={onStoreChange} />

      {error && <ErrorNote>{error}</ErrorNote>}

      {!setupBelow && <SetupChecklist store={store} onStoreChange={onStoreChange} />}

      {dashboard === null && !error && <DashboardSkeleton />}

      {/* Six tiles reading 0 teach a new seller nothing — the numbers
          appear with the first order. */}
      {dashboard && hasOrders && (
        <>
          <section aria-labelledby="pipeline-heading">
            <h3 id="pipeline-heading" className="mb-2.5 text-base font-bold text-fg">
              Your orders
            </h3>
            {/* Phone: one row that scrolls sideways (the fade on the right
                says there is more). From sm: a grid, nothing hidden. */}
            <div className="-mx-4 [mask-image:linear-gradient(to_right,#000_85%,transparent)] sm:mx-0 sm:[mask-image:none]">
              <div className="flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:px-0 lg:grid-cols-6">
                {PIPELINE.map(({ key, label, to, dot }) => {
                  const body = (
                    <>
                      <span className="flex items-center gap-1.5 text-hint font-semibold text-muted">
                        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
                        {label}
                      </span>
                      <span className="mt-1 block font-figure text-3xl leading-none font-bold text-fg">
                        {dashboard.stats[key]}
                      </span>
                    </>
                  )
                  const chip =
                    'glass-card block min-w-[124px] shrink-0 snap-start rounded-2xl px-3.5 py-3 sm:min-w-0'
                  return to ? (
                    <Link key={key} to={to} className={`${chip} transition hover:border-brand/40`}>
                      {body}
                    </Link>
                  ) : (
                    <div key={key} className={chip}>
                      {body}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <section aria-labelledby="latest-heading">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <h3 id="latest-heading" className="text-base font-bold text-fg">
                Latest orders
              </h3>
              <Link
                to="orders"
                className="inline-flex min-h-tap items-center gap-1 rounded-xl px-2 text-sm font-semibold text-brand transition hover:bg-brand-soft"
              >
                See all
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
            {dashboard.recentOrders.length > 0 && (
              <ul className="glass-card divide-y divide-line overflow-hidden rounded-glass">
                {dashboard.recentOrders.map((order) => (
                  <li key={order.id}>
                    <SellerOrderRow order={order} to={`orders/${order.id}`} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {setupBelow && <SetupChecklist store={store} onStoreChange={onStoreChange} />}
        </>
      )}

      {/* Live with no orders yet: say so plainly under the hero (which
          already offers the WhatsApp share) instead of a blank page. */}
      {dashboard && !hasOrders && store.isPublished && (
        <div className="glass-card rounded-glass">
          <EmptyState
            icon={CartIcon}
            title="No orders yet"
            description="When a customer orders, it shows up here straight away."
          />
        </div>
      )}

      {/* What the shop page still lacks to win a stranger's first order —
          contact number, an about line, a logo. Gone once all are done. */}
      <ShopTrustTips store={store} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function Hero({
  store,
  dashboard,
  onStoreChange,
}: {
  store: Store
  dashboard: StoreDashboard | null
  onStoreChange: (store: Store) => void
}) {
  const stats = dashboard?.stats
  const showStats = store.isPublished && stats !== undefined && stats.totalOrders > 0

  return (
    <section className="glass-tint rounded-glass p-4 sm:p-6">
      <p className="text-sm font-medium text-muted">{greeting(new Date().getHours())}</p>
      <h2 className="mt-0.5 font-heading text-2xl leading-tight font-bold break-words text-fg">
        {store.name}
      </h2>

      {showStats && (
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          {/* Phone: Today + Waiting side by side, sales on its own full row
              so any amount fits; three across from sm. */}
          <HeroStat label="Today" value={stats.today} />
          <HeroStat
            label="Waiting"
            value={stats.pending}
            dot={stats.pending > 0 ? 'bg-pending' : undefined}
          />
          <HeroStat
            label="Total sales"
            value={formatPrice(stats.revenue)}
            small
            className="col-span-2 sm:col-span-1"
          />
        </dl>
      )}

      <NextStep store={store} dashboard={dashboard} onStoreChange={onStoreChange} />
    </section>
  )
}

/**
 * One number in the hero: a frosted tile (a light pane, not a fill) so the
 * numbers float on the glass. `dot` marks a number that wants attention.
 */
function HeroStat({
  label,
  value,
  small = false,
  dot,
  className = '',
}: {
  label: string
  value: ReactNode
  small?: boolean
  /** A status dot before the label (e.g. pending orange when waiting > 0). */
  dot?: string
  className?: string
}) {
  return (
    <div className={`min-w-0 ${className} rounded-2xl border border-glass-border bg-surface/55 px-3 py-2.5 shadow-[inset_0_1px_0_var(--glass-border)]`}>
      <dt className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        {dot && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
        {label}
      </dt>
      <dd
        className={`mt-0.5 font-figure leading-tight font-bold text-fg ${
          small ? 'break-words text-xl' : 'truncate text-2xl'
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * The ONE thing to do next — a lighter pane inside the hero with an icon
 * chip, so the button is the only solid colour on the card. See the
 * component doc above for the order.
 */
function NextStep({
  store,
  dashboard,
  onStoreChange,
}: {
  store: Store
  dashboard: StoreDashboard | null
  onStoreChange: (store: Store) => void
}) {
  const { hiddenSections } = useStoreManageScope()
  const actions = usePublishActions(store, onStoreChange)
  const url = publicStoreUrl(store.slug)

  let icon: ComponentType<{ className?: string }>
  let title: string
  let detail: string
  let action: ReactNode

  if (!store.isPublished) {
    const next = launchSteps(store).find((step) => !step.complete)
    if (next) {
      const go = stepAction(next)
      icon = next.key === 'catalog' ? BoxIcon : StoreIcon
      title = go.label
      detail = `To open your shop, add: ${stepMissing(next).join(' · ')}`
      action = hiddenSections.includes(next.href) ? null : (
        <Link to={go.to} className={buttonClass({ size: 'lg', full: true })}>
          {go.label}
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      )
    } else {
      icon = CheckIcon
      title = 'Your shop is ready'
      detail = 'Publish it so customers can see it and order.'
      action = (
        <button
          type="button"
          onClick={actions.publish}
          disabled={actions.busy || !store.readiness.gates.PUBLISH.allowed}
          className={buttonClass({ variant: 'primary', size: 'lg', full: true })}
        >
          {actions.busy ? 'Publishing…' : 'Publish my shop'}
        </button>
      )
    }
  } else if (dashboard && dashboard.stats.pending > 0) {
    const waiting = dashboard.stats.pending
    icon = CartIcon
    title = `${waiting} order${waiting === 1 ? ' is' : 's are'} waiting`
    detail = 'Confirm them so your customers know their order is coming.'
    action = (
      <Link to="orders?status=PENDING" className={buttonClass({ size: 'lg', full: true })}>
        See waiting orders
        <ArrowRightIcon className="h-4 w-4" />
      </Link>
    )
  } else {
    const first = (dashboard?.stats.totalOrders ?? 0) === 0
    icon = first ? ShareIcon : CheckIcon
    title = first ? 'Get your first order' : 'All caught up'
    detail = first
      ? 'Send your shop link to your customers on WhatsApp.'
      : 'No orders are waiting. Share your shop to get more.'
    action = (
      <WhatsAppShareLink href={whatsAppShareUrl(store.name, url)} />
    )
  }

  const Icon = icon
  return (
    <div className="mt-4 rounded-2xl border border-glass-border bg-surface/70 p-3.5 shadow-[inset_0_1px_0_var(--glass-border)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-brand-contrast shadow-[0_6px_16px_-8px_var(--cta-glow)]">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-[0.06em] text-brand uppercase">Next step</p>
          <p className="text-base leading-snug font-bold text-fg">{title}</p>
          <p className="mt-0.5 text-hint text-muted">{detail}</p>
        </div>
      </div>
      {action && <div className="mt-3">{action}</div>}
      {actions.error && (
        <p role="alert" className="mt-2 text-hint font-medium text-danger">
          {actions.error}
        </p>
      )}
    </div>
  )
}

/** Shape of the numbers while the layout's dashboard fetch is in flight. */
function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your orders" className="space-y-3">
      <div className="h-5 w-32 animate-pulse rounded-md bg-fg/10" />
      <div className="flex gap-2.5">
        {[0, 1, 2].map((key) => (
          <div key={key} className="glass-card h-[76px] flex-1 animate-pulse rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

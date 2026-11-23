import { useState } from 'react'
import type { ComponentType } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Dialog } from '../../../shared/ui/Dialog'
import { useSlidingPill } from '../../../shared/ui/useSlidingPill'
import { useStoreManageScope } from '../../features/stores/storeManageScope'
import {
  BoxIcon,
  CartIcon,
  ChartIcon,
  ChevronRightIcon,
  DotsIcon,
  PaletteIcon,
  StoreIcon,
  TruckIcon,
} from '../../layout/icons'
import {
  OrderBadge,
  SectionSheetList,
  useActiveSection,
  useSectionGroups,
  useSectionLink,
} from './StoreSectionNav'
import type { NavData } from './StoreSectionNav'

/**
 * Phone navigation for store management: a floating tab bar (`ws-bar`) with the
 * four jobs a seller does daily, and **More** for everything else.
 *
 * It replaced a single dropdown at the top of the page, which put Orders and
 * Products two taps away and out of thumb reach. The four tabs are the
 * sections sellers open most (Orders, Products) plus the two places they
 * start from (Home = Dashboard, Design = Store Builder). Every tab is an icon
 * WITH a word — an icon alone asks a seller to guess.
 *
 * The chosen tab's icon sits on a solid ink pill (`bg-fg`, white icon —
 * flipped in dark mode), the same look as the `SegmentedControl` tabs. The
 * pill SLIDES to a new tab with the same rubber stretch, and the tapped icon
 * hops once (`useSlidingPill`); "reduce motion" turns both off.
 *
 * The bar is `fixed`, so it must never render inside a transformed or filtered panel (a
 * `backdrop-filter` ancestor would trap it); the layout mounts it at its root.
 * It publishes its height as `--seller-dock` (set by the layout) so sticky
 * save bars and toasts sit above it instead of under it.
 */

const TABS: { to: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { to: '.', label: 'Home', icon: ChartIcon },
  { to: 'orders', label: 'Orders', icon: CartIcon },
  { to: 'products', label: 'Products', icon: BoxIcon },
  { to: 'builder', label: 'Design', icon: PaletteIcon },
  // A supplier account has no Orders or Design; this is its daily row (D-49).
  { to: 'orders-to-ship', label: 'To ship', icon: TruckIcon },
]

export function StoreMobileNav({
  storeName,
  ...data
}: NavData & { storeName: string }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const active = useActiveSection()
  const groups = useSectionGroups()
  const { indexPath } = useStoreManageScope()
  const sectionLink = useSectionLink()

  // Only tabs this mode can open (an admin's mount hides some sections).
  const available = new Set(groups.flatMap((g) => g.items.map((i) => i.to)))
  const tabs = TABS.filter((tab) => available.has(tab.to))
  const toShip = groups.flatMap((g) => g.items).find((i) => i.to === 'orders-to-ship')?.count ?? 0
  const onMore = !tabs.some((tab) => tab.to === active.item.to)
  const activeKey = onMore ? 'more' : active.item.to
  const pill = useSlidingPill(activeKey)

  return (
    <>
      <nav
        aria-label="Store sections"
        // The bar stands on a band of the PAGE colour, so the white cards
        // scrolling under it stop short of it — it never reads as one more
        // card. Only the bar itself takes taps.
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-bg/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <div
          ref={pill.containerRef}
          className="ws-dock pointer-events-auto relative mx-auto grid max-w-md grid-cols-5 gap-1 rounded-sheet p-1.5"
        >
          {/* The chosen tab's pill — moved by useSlidingPill, under the icons. */}
          <span ref={pill.pillRef} aria-hidden className="pointer-events-none absolute rounded-pill bg-fg opacity-0" />
          {tabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '.'}
              {...sectionLink(to)}
              onClick={() => pill.hop(to)}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold transition-colors ${
                activeKey === to ? 'text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              <span
                ref={pill.target(to)}
                className={`relative flex h-7 w-12 items-center justify-center rounded-pill transition-colors duration-200 ${
                  activeKey === to ? 'text-surface' : ''
                }`}
              >
                <Icon className="h-[22px] w-[22px]" />
                {to === 'orders' && data.pendingOrders > 0 && (
                  <OrderBadge count={data.pendingOrders} className="absolute -top-1.5 right-0" />
                )}
                {to === 'orders-to-ship' && toShip > 0 && (
                  <OrderBadge count={toShip} className="absolute -top-1.5 right-0" />
                )}
              </span>
              {label}
            </NavLink>
          ))}

          <button
            type="button"
            onClick={() => {
              pill.hop('more')
              setMoreOpen(true)
            }}
            aria-haspopup="dialog"
            className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-semibold transition-colors ${
              onMore ? 'text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            <span
              ref={pill.target('more')}
              className={`relative flex h-7 w-12 items-center justify-center rounded-pill transition-colors duration-200 ${
                onMore ? 'text-surface' : ''
              }`}
            >
              <DotsIcon className="h-[22px] w-[22px]" />
            </span>
            {/* Always the word "More" — a section name here was cut to
                "Categori…". The highlight says you are in one of these; the
                page heading names which. */}
            More
          </button>
        </div>
      </nav>

      <Dialog
        open={moreOpen}
        title="All sections"
        subtitle={storeName}
        onClose={() => setMoreOpen(false)}
        flush
      >
        <SectionSheetList data={data} onNavigate={() => setMoreOpen(false)} />
        <div className="border-t border-line px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Link
            to={indexPath}
            className="flex min-h-[52px] items-center gap-3 rounded-xl px-2.5 text-base font-medium text-fg/80 transition-colors hover:bg-fg/5 hover:text-fg"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fg/5">
              <StoreIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="flex-1">Switch to another shop</span>
            <ChevronRightIcon className="h-4 w-4 text-muted" />
          </Link>
        </div>
      </Dialog>
    </>
  )
}

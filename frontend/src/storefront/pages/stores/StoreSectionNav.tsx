import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { NavLink, useLocation, useResolvedPath } from 'react-router-dom'
import type { StepState } from '../../features/stores/storeProfile'
import { StatusMark, StatusTag, sectionStatus } from './SetupStatus'
import {
  BankIcon,
  BoxIcon,
  CardIcon,
  CartIcon,
  ChartIcon,
  ChatIcon,
  ChevronDownIcon,
  ClipboardIcon,
  FooterIcon,
  HomeIcon,
  LifebuoyIcon,
  PaletteIcon,
  StoreIcon,
  TagIcon,
  TruckIcon,
  ShieldCheckIcon,
} from '../../layout/icons'

/**
 * The store-management section picker, in three presentations of ONE list:
 *
 *  - **Desktop, expanded** — groups as collapsible disclosures. The caption
 *    is now a real header (a button with a chevron, at ink contrast) instead
 *    of the 10px grey whisper it was, because with sixteen rows the captions
 *    are the only thing making the list scannable, and they read as
 *    decoration if they are quieter than the rows they label.
 *  - **Desktop, rail** — icons only, at 64px, for sellers who want the width
 *    back on the section they are actually working in.
 *  - **Mobile** — a single dropdown naming where you are, because stacking
 *    sixteen rows above the content pushed the actual page a screen and a
 *    half down.
 *
 * Collapsing is a genuine trade (a click before a cross-group jump), so it is
 * paid for in three ways: the group you are IN opens itself and stays open, a
 * collapsed group still shows what it is hiding (pending setup, waiting
 * orders), and the state is remembered — a seller who wants the old flat list
 * opens all five once and never sees an accordion again.
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

interface SectionGroup {
  /** Stable persistence id — renaming `caption` must not reset preferences. */
  key: string
  caption: string
  items: SectionItem[]
}

/**
 * Sections grouped by what the seller is actually doing, because a flat list
 * of sixteen made a once-ever setting (Bank Accounts) look as important as a
 * daily job (Orders).
 *
 * - **Overview / Catalog** are the daily work, so they lead — Catalog used to
 *   sit last despite Products being the most-opened section after Orders.
 *   Categories precedes Products because the app enforces that order anyway
 *   (Products is gated until a category exists). Both are open by default.
 * - **Storefront** is what a customer sees (all five are safe to experiment
 *   with). **Payments & Delivery** is how the business runs — money and
 *   fulfilment, three of which confirm before saving because they hit the
 *   live checkout. It is named for its contents rather than the old
 *   "Settings", which described nothing: every group here is settings.
 *   Store Details is branding, not configuration, so it sits under Storefront.
 * - Payments precedes Bank Accounts: payout accounts only matter once online
 *   payment is switched on, and that page already links across when it needs
 *   one.
 * - **Help** sits last, holding the two support channels that must not be
 *   confused: **Customer Support** is the shop's own inbox (buyers writing to
 *   the seller — daily work, so it leads) and **UnieMax Support** is the
 *   seller writing to the platform. Naming them by *who is on the other end*
 *   is the only labelling that stays unambiguous once both exist.
 */
const SECTION_GROUPS: SectionGroup[] = [
  {
    key: 'overview',
    caption: 'Overview',
    items: [
      { label: 'Dashboard', to: '.', icon: ChartIcon, end: true },
      { label: 'Orders', to: 'orders', icon: CartIcon, badge: true },
    ],
  },
  {
    key: 'catalog',
    caption: 'Catalog',
    items: [
      { label: 'Categories', to: 'categories', icon: TagIcon },
      { label: 'Products', to: 'products', icon: BoxIcon },
    ],
  },
  {
    key: 'storefront',
    caption: 'Storefront',
    items: [
      { label: 'Store Details', to: 'details', icon: StoreIcon },
      // Business identity sits beside Store Details rather than under
      // Payments: it is who the seller IS, which orders and invoices need
      // long before any payout does.
      { label: 'Business Details', to: 'business', icon: ShieldCheckIcon },
      { label: 'Appearance', to: 'appearance', icon: PaletteIcon },
      { label: 'Homepage', to: 'homepage', icon: HomeIcon },
      { label: 'Footer', to: 'footer', icon: FooterIcon },
    ],
  },
  {
    key: 'settings',
    caption: 'Payments & Delivery',
    items: [
      { label: 'Payments', to: 'payments', icon: CardIcon },
      { label: 'Bank Accounts', to: 'bank-accounts', icon: BankIcon },
      { label: 'Shipping', to: 'shipping', icon: TruckIcon },
      { label: 'Checkout', to: 'checkout', icon: ClipboardIcon },
    ],
  },
  {
    key: 'help',
    caption: 'Help',
    items: [
      { label: 'Customer Support', to: 'customer-support', icon: ChatIcon },
      { label: 'UnieMax Support', to: 'support', icon: LifebuoyIcon },
    ],
  },
]

// ---------------------------------------------------------------------------
// Remembered preferences
// ---------------------------------------------------------------------------

const RAIL_KEY = 'uniemax.storeNav.rail'
const GROUPS_KEY = 'uniemax.storeNav.collapsed'

/**
 * Storefront and the two config groups start closed: they hold the
 * set-it-once work, so a returning seller opens on four rows of daily work
 * plus three headers instead of sixteen rows of everything.
 */
const DEFAULT_COLLAPSED = ['storefront', 'settings', 'help']

function readCollapsed(): string[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY)
    if (raw === null) return DEFAULT_COLLAPSED
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.filter((key): key is string => typeof key === 'string')
      : DEFAULT_COLLAPSED
  } catch {
    return DEFAULT_COLLAPSED
  }
}

/**
 * Rail state lives here but is READ by the layout (it owns the grid track
 * width), so it is exported as a hook rather than kept private to the nav.
 */
export function useNavRail(): [boolean, () => void] {
  const [rail, setRail] = useState(() => {
    try {
      return localStorage.getItem(RAIL_KEY) === '1'
    } catch {
      return false
    }
  })

  const toggle = () => {
    setRail((on) => {
      try {
        localStorage.setItem(RAIL_KEY, on ? '0' : '1')
      } catch {
        /* private mode — the preference just does not survive the session */
      }
      return !on
    })
  }

  return [rail, toggle]
}

// ---------------------------------------------------------------------------
// Where am I?
// ---------------------------------------------------------------------------

/**
 * The section the URL is currently in — needed by the mobile trigger (which
 * has to NAME it) and by the auto-open rule. `NavLink` works this out for
 * itself per row; this is the same answer one level up, for the group.
 *
 * Matching is segment-wise and longest-wins, so `support` never claims
 * `customer-support` and `orders/123` still resolves to Orders.
 */
function useActiveSection(): { group: SectionGroup; item: SectionItem } {
  const base = useResolvedPath('.').pathname
  const { pathname } = useLocation()

  return useMemo(() => {
    const root = base.endsWith('/') ? base.slice(0, -1) : base
    const rest =
      pathname === root || pathname === `${root}/`
        ? ''
        : pathname.startsWith(`${root}/`)
          ? pathname.slice(root.length + 1)
          : null

    let best: { group: SectionGroup; item: SectionItem } | null = null
    if (rest !== null) {
      for (const group of SECTION_GROUPS) {
        for (const item of group.items) {
          const seg = item.to === '.' ? '' : item.to
          const hit =
            seg === '' ? rest === '' : rest === seg || rest.startsWith(`${seg}/`)
          const bestLen = best === null || best.item.to === '.' ? 0 : best.item.to.length
          if (hit && (best === null || seg.length > bestLen)) best = { group, item }
        }
      }
    }

    // A URL under the layout that matches no row (a future child route) still
    // has to render something — fall back to the landing section.
    return best ?? { group: SECTION_GROUPS[0], item: SECTION_GROUPS[0].items[0] }
  }, [base, pathname])
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

interface NavData {
  pendingOrders: number
  /** Readiness steps keyed by the section `to` they are edited in. */
  setupSteps: Map<string, StepState[]>
}

/** Does anything inside this group still want the seller's attention? */
function groupSignals(group: SectionGroup, { pendingOrders, setupSteps }: NavData) {
  const pendingSetup = group.items.some((item) => {
    const steps = setupSteps.get(item.to)
    return steps !== undefined && !sectionStatus(steps).complete
  })
  const orders = group.items.some((item) => item.badge) ? pendingOrders : 0
  return { pendingSetup, orders }
}

function OrderBadge({ count, className = '' }: { count: number; className?: string }) {
  return (
    <span
      // Not aria-hidden: "3 orders waiting" is the whole point of the badge
      // for a screen-reader user too.
      aria-label={`${count} pending`}
      className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-brand px-1.5 text-[11px] font-bold text-brand-contrast ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function SectionRow({
  item,
  data,
  onNavigate,
}: {
  item: SectionItem
  data: NavData
  onNavigate?: () => void
}) {
  const { label, to, icon: Icon, end, badge } = item
  const steps = data.setupSteps.get(to)
  const setup = steps ? sectionStatus(steps) : null

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      // Selection is carried by the solid left BAR plus the Light-Purple
      // tint, with the label staying ink in both schemes. The transparent
      // border on every row keeps the text from shifting 3px.
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md border-l-[3px] py-2 pr-3 pl-2.5 text-sm transition-colors ${
          isActive
            ? 'border-brand bg-brand-soft font-semibold text-fg'
            : 'border-transparent font-medium text-muted hover:bg-surface-alt hover:text-fg'
        }`
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {setup && <StatusTag status={setup} section={label} />}
      {badge && data.pendingOrders > 0 && <OrderBadge count={data.pendingOrders} />}
    </NavLink>
  )
}

/**
 * One disclosure. The header is a button at ink weight; the panel animates on
 * `grid-template-rows` so the rows slide rather than snap (reduced-motion
 * neutralises the duration globally), and is `inert` while closed so a
 * keyboard never lands on a row nobody can see.
 */
function SectionDisclosure({
  group,
  data,
  open,
  activeInside,
  onToggle,
  onNavigate,
}: {
  group: SectionGroup
  data: NavData
  open: boolean
  activeInside: boolean
  onToggle: () => void
  onNavigate?: () => void
}) {
  const panelId = `store-nav-${group.key}`
  const { pendingSetup, orders } = groupSignals(group, data)

  return (
    <div className="border-t border-line/70 first:border-t-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-alt ${
          activeInside && !open ? 'text-brand' : 'text-fg'
        }`}
      >
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200 ${
            open ? '' : '-rotate-90'
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold tracking-[0.08em] uppercase">
          {group.caption}
        </span>

        {/* A collapsed group must not hide a signal — otherwise the accordion
            costs the seller the very thing the sidebar is for. */}
        {!open && (
          <>
            {pendingSetup && (
              <StatusMark
                complete={false}
                size="sm"
                label={`${group.caption} setup pending`}
              />
            )}
            {orders > 0 && <OrderBadge count={orders} />}
            <span className="shrink-0 text-[11px] font-medium text-muted" aria-hidden>
              {group.items.length}
            </span>
          </>
        )}
      </button>

      <div
        id={panelId}
        inert={open ? undefined : true}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="overflow-hidden">
          <div className="pb-1.5">
            {group.items.map((item) => (
              <SectionRow key={item.label} item={item} data={data} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The full grouped list — shared by the desktop column and the mobile sheet. */
function SectionList({
  data,
  collapsed,
  onToggleGroup,
  activeKey,
  onNavigate,
}: {
  data: NavData
  collapsed: string[]
  onToggleGroup: (key: string) => void
  activeKey: string
  onNavigate?: () => void
}) {
  return (
    <div className="p-2">
      {SECTION_GROUPS.map((group) => (
        <SectionDisclosure
          key={group.key}
          group={group}
          data={data}
          open={!collapsed.includes(group.key)}
          activeInside={group.key === activeKey}
          onToggle={() => onToggleGroup(group.key)}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The nav
// ---------------------------------------------------------------------------

export function StoreSectionNav({ rail, ...data }: NavData & { rail: boolean }) {
  const active = useActiveSection()
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileRef = useRef<HTMLDivElement | null>(null)

  /**
   * The group you navigate INTO opens itself — keyed on the group changing,
   * not on every render, so a seller who deliberately collapses the group
   * they are standing in does not have it spring back open under them.
   */
  const lastGroup = useRef<string | null>(null)
  useEffect(() => {
    if (lastGroup.current === active.group.key) return
    lastGroup.current = active.group.key
    setCollapsed((keys) =>
      keys.includes(active.group.key)
        ? keys.filter((key) => key !== active.group.key)
        : keys,
    )
  }, [active.group.key])

  useEffect(() => {
    try {
      localStorage.setItem(GROUPS_KEY, JSON.stringify(collapsed))
    } catch {
      /* private mode — the preference just does not survive the session */
    }
  }, [collapsed])

  // Mobile sheet: dismiss on an outside press or Escape, like any menu.
  useEffect(() => {
    if (!mobileOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!mobileRef.current?.contains(event.target as Node)) setMobileOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileOpen])

  const toggleGroup = (key: string) =>
    setCollapsed((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    )

  const list = (
    <SectionList
      data={data}
      collapsed={collapsed}
      onToggleGroup={toggleGroup}
      activeKey={active.group.key}
      onNavigate={() => setMobileOpen(false)}
    />
  )

  const ActiveIcon = active.item.icon

  return (
    <>
      {/* Mobile: one row naming where you are, opening the same list. */}
      <div ref={mobileRef} className="relative p-2 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          className="flex w-full items-center gap-3 rounded-md border border-line bg-surface-alt px-3 py-2.5 text-left transition hover:bg-line/40"
        >
          <ActiveIcon className="h-[18px] w-[18px] shrink-0 text-brand" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold tracking-widest text-muted uppercase">
              {active.group.caption}
            </span>
            <span className="block truncate text-sm font-semibold text-fg">
              {active.item.label}
            </span>
          </span>
          {data.pendingOrders > 0 && !mobileOpen && <OrderBadge count={data.pendingOrders} />}
          <ChevronDownIcon
            className={`h-4 w-4 shrink-0 text-muted transition-transform duration-200 ${
              mobileOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {mobileOpen && (
          <div className="absolute inset-x-2 top-[calc(100%-0.25rem)] z-30 max-h-[70vh] overflow-y-auto rounded-lg border border-line bg-surface shadow-floating">
            {list}
          </div>
        )}
      </div>

      {/* Desktop: the column, or the icon rail. */}
      <nav className="hidden lg:block" aria-label="Store sections">
        {rail ? (
          <div className="flex flex-col items-center gap-1 p-2">
            {SECTION_GROUPS.map((group, index) => (
              <div
                key={group.key}
                className={`flex w-full flex-col items-center gap-1 ${
                  index > 0 ? 'mt-1 border-t border-line/70 pt-2' : ''
                }`}
              >
                {group.items.map(({ label, to, icon: Icon, end, badge }) => {
                  const steps = data.setupSteps.get(to)
                  const pending = steps ? !sectionStatus(steps).complete : false

                  return (
                    <NavLink
                      key={label}
                      to={to}
                      end={end}
                      title={`${group.caption} · ${label}`}
                      className={({ isActive }) =>
                        `relative flex h-10 w-10 items-center justify-center rounded-md transition-colors ${
                          isActive
                            ? 'bg-brand-soft text-brand'
                            : 'text-muted hover:bg-surface-alt hover:text-fg'
                        }`
                      }
                    >
                      <Icon className="h-[18px] w-[18px]" />
                      <span className="sr-only">{label}</span>
                      {pending && (
                        <StatusMark
                          complete={false}
                          size="sm"
                          label={`${label} setup pending`}
                          className="absolute -top-0.5 -right-0.5"
                        />
                      )}
                      {badge && data.pendingOrders > 0 && (
                        <OrderBadge
                          count={data.pendingOrders}
                          className="absolute -top-1 -right-1"
                        />
                      )}
                    </NavLink>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          list
        )}
      </nav>
    </>
  )
}

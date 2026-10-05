import { useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { NavLink, useLocation, useResolvedPath } from 'react-router-dom'
import type { StepState } from '../../features/stores/storeProfile'
import { useStoreManageScope } from '../../features/stores/storeManageScope'
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
  LifebuoyIcon,
  MegaphoneIcon,
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
 *  - **Mobile** — not here: a bottom tab bar for the daily four plus a
 *    "More" sheet listing everything (`StoreMobileNav` + `SectionSheetList`).
 *
 * Collapsing is a genuine trade (a click before a cross-group jump), so it is
 * paid for in three ways: the group you are IN opens itself and stays open, a
 * collapsed group still shows what it is hiding (pending setup, waiting
 * orders), and the state is remembered — a seller who wants the old flat list
 * opens all five once and never sees an accordion again.
 */

export interface SectionItem {
  label: string
  to: string
  icon: ComponentType<{ className?: string }>
  /** Exact-match highlighting (the index route only). */
  end?: boolean
  /** Renders the pending-order count. Only Orders carries live state. */
  badge?: boolean
}

export interface SectionGroup {
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
      { label: 'Shop name & logo', to: 'details', icon: StoreIcon },
      // Business identity sits beside Store Details rather than under
      // Payments: it is who the seller IS, which orders and invoices need
      // long before any payout does.
      { label: 'Business details', to: 'business', icon: ShieldCheckIcon },
      // ONE row where there were four. Appearance, Homepage, Banners and
      // Footer all described the same object — the shop — and splitting them
      // made a seller learn the platform's filing system before they could
      // move a heading. The builder is also the only one of the five that can
      // show them the result.
      { label: 'Design your shop', to: 'builder', icon: PaletteIcon },
    ],
  },
  {
    key: 'settings',
    caption: 'Payments & Delivery',
    items: [
      { label: 'Payments', to: 'payments', icon: CardIcon },
      { label: 'Bank account', to: 'bank-accounts', icon: BankIcon },
      { label: 'Delivery', to: 'shipping', icon: TruckIcon },
      { label: 'Checkout', to: 'checkout', icon: ClipboardIcon },
    ],
  },
  {
    key: 'marketing',
    caption: 'Marketing',
    items: [{ label: 'Affiliate Marketing', to: 'affiliate', icon: MegaphoneIcon }],
  },
  {
    key: 'help',
    caption: 'Help',
    items: [
      { label: 'Customer messages', to: 'customer-support', icon: ChatIcon },
      { label: 'Help from UnieMax', to: 'support', icon: LifebuoyIcon },
    ],
  },
]

/**
 * The sections THIS mode may open.
 *
 * Admins render the same nav as sellers minus the rows their mount does not
 * serve (payout accounts, the two support inboxes); a group left with no
 * rows disappears rather than showing an empty caption. Sellers hide nothing,
 * so they keep the exact array above — same object identity, no re-render.
 */
export function useSectionGroups(): SectionGroup[] {
  const { hiddenSections } = useStoreManageScope()
  return useMemo(() => {
    if (hiddenSections.length === 0) return SECTION_GROUPS
    return SECTION_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => !hiddenSections.includes(item.to)),
    })).filter((group) => group.items.length > 0)
  }, [hiddenSections])
}

// ---------------------------------------------------------------------------
// Remembered preferences
// ---------------------------------------------------------------------------

const RAIL_KEY = 'uniemax.storeNav.rail'
const GROUPS_KEY = 'uniemax.storeNav.collapsed'

/**
 * The two config groups start closed: they hold the set-it-once work, so a
 * returning seller opens on the daily rows plus a couple of headers instead of
 * every row at once. Storefront stays OPEN — it is three rows now, and one of
 * them is where a seller designs their shop.
 */
const DEFAULT_COLLAPSED = ['settings', 'help']

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
const BUILDER_PARTS = new Set(['banners', 'footer'])

export function useActiveSection(): { group: SectionGroup; item: SectionItem } {
  const base = useResolvedPath('.').pathname
  const { pathname } = useLocation()
  const groups = useSectionGroups()

  return useMemo(() => {
    const root = base.endsWith('/') ? base.slice(0, -1) : base
    const raw =
      pathname === root || pathname === `${root}/`
        ? ''
        : pathname.startsWith(`${root}/`)
          ? pathname.slice(root.length + 1)
          : null
    // Banners and Footer are Store Builder editors with standalone pages of
    // their own; name the Builder rather than falling back to "Dashboard".
    const rest = raw !== null && BUILDER_PARTS.has(raw.split('/')[0]!) ? 'builder' : raw

    let best: { group: SectionGroup; item: SectionItem } | null = null
    if (rest !== null) {
      for (const group of groups) {
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
    return best ?? { group: groups[0], item: groups[0].items[0] }
  }, [base, pathname, groups])
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface NavData {
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

export function OrderBadge({ count, className = '' }: { count: number; className?: string }) {
  return (
    <span
      // Not aria-hidden: "3 orders waiting" is the whole point of the badge
      // for a screen-reader user too.
      aria-label={`${count} pending`}
      className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-brand px-1.5 text-xs font-bold text-brand-contrast ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function SectionRow({
  item,
  data,
  large = false,
  onNavigate,
}: {
  item: SectionItem
  data: NavData
  /** Phone sheet size: 52px rows, 15px label, icon in a chip. */
  large?: boolean
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
      // Selection is a Light-Purple PILL with the icon and label in brand —
      // the glass redesign dropped the old 3px left bar, which read as a
      // table-row highlight rather than "you are here".
      className={({ isActive }) =>
        `group/row flex items-center gap-3 rounded-xl transition-colors ${
          large ? 'min-h-[52px] px-2.5 text-base' : 'min-h-10 px-3 text-sm'
        } ${
          isActive
            ? 'bg-brand-soft font-semibold text-brand'
            : 'font-medium text-fg/80 hover:bg-fg/5 hover:text-fg'
        }`
      }
    >
      {large ? (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-fg/5 group-aria-[current=page]/row:bg-brand group-aria-[current=page]/row:text-brand-contrast">
          <Icon className="h-[18px] w-[18px]" />
        </span>
      ) : (
        <Icon className="h-[18px] w-[18px] shrink-0" />
      )}
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
        className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-fg/5 ${
          activeInside && !open ? 'text-brand' : 'text-fg'
        }`}
      >
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200 ${
            open ? '' : '-rotate-90'
          }`}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-bold tracking-[0.08em] uppercase">
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
            <span className="shrink-0 text-xs font-medium text-muted" aria-hidden>
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

/**
 * Every section, flat and fully open, at thumb size — the phone "More" sheet.
 *
 * No accordions here: a sheet is opened to FIND something, and collapsed
 * groups would cost a second tap on a small screen. The group captions stay,
 * as plain headings, because sixteen rows without them are a wall.
 */
export function SectionSheetList({
  data,
  onNavigate,
}: {
  data: NavData
  onNavigate: () => void
}) {
  const groups = useSectionGroups()
  return (
    <div className="space-y-3 px-3 py-3">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`sheet-group-${group.key}`}>
          <h3
            id={`sheet-group-${group.key}`}
            className="px-2.5 pb-1 text-xs font-bold tracking-[0.06em] text-muted uppercase"
          >
            {group.caption}
          </h3>
          <div className="space-y-0.5">
            {group.items.map((item) => (
              <SectionRow
                key={item.label}
                item={item}
                data={data}
                large
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** The full grouped list — the desktop column. */
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
  const groups = useSectionGroups()
  return (
    <div className="p-2">
      {groups.map((group) => (
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
  const groups = useSectionGroups()
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)

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
    />
  )

  // Desktop only. Phones get the bottom tab bar + "More" sheet
  // (`StoreMobileNav`), which replaced the old one-row dropdown here.
  return (
    <>
      {/* The column, or the icon rail. */}
      <nav aria-label="Store sections">
        {rail ? (
          <div className="flex flex-col items-center gap-1 p-2">
            {groups.map((group, index) => (
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
                        `relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                          isActive
                            ? 'bg-brand-soft text-brand'
                            : 'text-muted hover:bg-fg/5 hover:text-fg'
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

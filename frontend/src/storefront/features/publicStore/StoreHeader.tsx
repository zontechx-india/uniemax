import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import type { Customer } from '../../../shared/auth/authApi'
import type { SessionState } from '../../../shared/auth/useSession'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import {
  cartUrl,
  publicStoreUrl,
  storeCategoryUrl,
  storeHomeUrl,
  storeShopUrl,
  storeSupportUrl,
  type PublicStore,
} from '../stores/storesApi'
import { useCart } from '../cart/cart'
import { useMarketSession } from '../../app/marketSession'
import { SessionProvider } from '../../app/SessionProvider'
import { ACCOUNT_MENU_ITEMS } from '../../app/navigation'
import { AccountMenu } from '../../layout/AccountMenu'
import { Avatar } from '../../layout/Avatar'
import { useSignOutConfirm } from '../../layout/useSignOutConfirm'
import { openAuthDialog, storeAuthRequest } from '../auth/authDialogStore'
import { ShareButton } from './ShareButton'
import {
  CartIcon,
  ChevronDownIcon,
  CloseIcon,
  LogoutIcon,
  MenuIcon,
  SearchIcon,
  StoreIcon,
} from '../../layout/icons'
import type { Skin } from './storeTheme'

/**
 * Storefront chrome: logo · Home · Shop · Categories ▾ · Help · search ·
 * share · cart · **account**.
 *
 * The Categories menu lists **categories and subcategories only, never
 * products** — a dropdown that enumerated products would be unusable the
 * moment a store grew. Product discovery happens through search, category
 * pages and the homepage sections instead.
 *
 * Desktop opens the menu on hover (and on click/keyboard for accessibility);
 * below `lg` the hamburger opens a drawer where categories expand as an
 * accordion.
 *
 * **Help** goes to this shop's own Help & Support — the seller answers it,
 * not UnieMax. It sits in the nav rather than behind an icon because a
 * shopper looking for "how do I reach them" scans for the word; the footer
 * carries the same link for anyone who reads to the bottom instead.
 *
 * Nav items whose features don't exist yet (Offers, Track Order, About) are
 * deliberately absent rather than rendered as dead links.
 *
 * **Account** sits at the end of the bar, exactly as on the marketplace
 * homepage — a seller shares `/store/{slug}`, not `/`, so this is the only
 * header most visitors ever see and it has to carry the same avatar dropdown
 * (orders, addresses, logout) and the same Sign in call to action. Below `sm`
 * the bar has no room for it beside the search field, so the account block
 * moves into the hamburger drawer instead.
 *
 * The session comes from `useMarketSession()`, and every account destination
 * lives in the marketplace router — hence `crossRouter`, which turns those
 * rows into full page loads.
 */
export function StoreHeader({ store, skin }: { store: PublicStore; skin: Skin }) {
  const { state, signOut } = useMarketSession()
  const bar = <StoreHeaderBar store={store} skin={skin} session={state} />

  // The dropdown and the drawer's logout row both read the signed-in customer
  // through `useCustomerSession()`; that context only ever holds a real
  // customer, so it is provided from here only once there is one.
  if (state.status === 'authed') {
    return (
      <SessionProvider customer={state.user} signOut={signOut}>
        {bar}
      </SessionProvider>
    )
  }
  return bar
}

function StoreHeaderBar({
  store,
  skin,
  session,
}: {
  store: PublicStore
  skin: Skin
  session: SessionState<Customer>
}) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  // Any navigation closes the mobile drawer.
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname, location.search])

  return (
    <header className={`sticky top-0 z-30 border-b ${skin.border} bg-bg`}>
      <div className="mx-auto flex max-w-[1920px] items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 lg:px-10">
        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border lg:hidden ${skin.border} ${skin.chip} ${skin.text}`}
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        {/* Logo + name */}
        <Link
          to={storeHomeUrl(store.slug)}
          className="flex min-w-0 shrink-0 items-center gap-2.5"
        >
          {store.logoUrl ? (
            <img
              src={store.logoUrl}
              alt=""
              loading="lazy"
              className="h-10 w-10 shrink-0 rounded-md object-cover"
            />
          ) : (
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${skin.cta}`}
            >
              <StoreIcon className="h-5 w-5" />
            </span>
          )}
          {/* Brand mark in gradient display text (prototype's gold-text). */}
          <span className="metal-text hidden max-w-40 truncate font-heading text-lg font-semibold sm:block">
            {store.name}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 lg:flex">
          <NavLink to={storeHomeUrl(store.slug)} skin={skin}>
            Home
          </NavLink>
          <NavLink to={storeShopUrl(store.slug)} skin={skin}>
            Shop
          </NavLink>
          <CategoriesMenu store={store} skin={skin} />
          <NavLink to={storeSupportUrl(store.slug)} skin={skin}>
            Help
          </NavLink>
        </nav>

        {/* Search */}
        <SearchBox store={store} skin={skin} />

        {/* Share this store (native sheet / copy link) */}
        <ShareButton
          title={store.name}
          url={publicStoreUrl(store.slug)}
          skin={skin}
          ariaLabel="Share this store"
        />

        {/* Cart */}
        <CartButton skin={skin} storeSlug={store.slug} />

        {/* Account — from `sm` up; below that it lives in the drawer, where
            there is room for it beside the search field. */}
        <div className="hidden shrink-0 sm:block">
          <AccountSlot store={store} session={session} skin={skin} />
        </div>
      </div>

      {drawerOpen && (
        <MobileDrawer
          store={store}
          skin={skin}
          session={session}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </header>
  )
}

function NavLink({
  to,
  skin,
  children,
}: {
  to: string
  skin: Skin
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors hover:text-brand ${skin.text}`}
    >
      {children}
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Categories dropdown (desktop)
// ---------------------------------------------------------------------------

function CategoriesMenu({ store, skin }: { store: PublicStore; skin: Skin }) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onClick)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onClick)
    }
  }, [open])

  if (store.categories.length === 0) return null

  return (
    <div
      ref={wrapper}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors hover:text-brand ${skin.text}`}
      >
        Categories
        <ChevronDownIcon
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          className={`absolute left-0 top-full z-40 max-h-[70vh] w-[34rem] overflow-y-auto rounded-lg border p-4 shadow-floating ${skin.border} ${skin.surface}`}
        >
          <ul className="grid grid-cols-2 gap-x-6 gap-y-4">
            {store.categories.map((category) => (
              <li key={category.id}>
                <Link
                  to={storeCategoryUrl(store.slug, category.slug)}
                  onClick={() => setOpen(false)}
                  className={`flex items-baseline gap-2 text-sm font-bold hover:text-brand ${skin.text}`}
                >
                  {category.name}
                  <span className={`text-[11px] font-semibold ${skin.muted}`}>
                    {category.productCount}
                  </span>
                </Link>
                {category.subcategories.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {category.subcategories.map((sub) => (
                      <li key={sub.id}>
                        <Link
                          to={storeCategoryUrl(store.slug, sub.slug)}
                          onClick={() => setOpen(false)}
                          className={`block text-xs hover:text-brand ${skin.muted}`}
                        >
                          {sub.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mobile drawer — expandable category accordion
// ---------------------------------------------------------------------------

function MobileDrawer({
  store,
  skin,
  session,
  onClose,
}: {
  store: PublicStore
  skin: Skin
  session: SessionState<Customer>
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--overlay)]"
      />
      <div
        className={`relative z-10 flex h-full w-[85%] max-w-sm flex-col border-r ${skin.border} ${skin.surface}`}
      >
        <div
          className={`flex items-center justify-between border-b p-4 ${skin.border}`}
        >
          <span className="metal-text font-heading text-lg font-semibold">
            {store.name}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`flex h-8 w-8 items-center justify-center rounded-full ${skin.muted}`}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          {/* Account first: on a phone this drawer is the only place the
              profile section fits, and it is what a visitor arriving on a
              shared store link looks for. */}
          <DrawerAccount store={store} session={session} skin={skin} onClose={onClose} />

          <Link
            to={storeHomeUrl(store.slug)}
            onClick={onClose}
            className={`block rounded-md px-3 py-2.5 text-sm font-bold ${skin.text}`}
          >
            Home
          </Link>
          <Link
            to={storeShopUrl(store.slug)}
            onClick={onClose}
            className={`block rounded-md px-3 py-2.5 text-sm font-bold ${skin.text}`}
          >
            Shop
          </Link>
          <Link
            to={storeSupportUrl(store.slug)}
            onClick={onClose}
            className={`block rounded-md px-3 py-2.5 text-sm font-bold ${skin.text}`}
          >
            Help &amp; Support
          </Link>

          <p
            className={`mt-3 px-3 pb-1 text-[11px] font-bold uppercase tracking-wide ${skin.muted}`}
          >
            Categories
          </p>

          <ul>
            {store.categories.map((category) => {
              const isOpen = expanded === category.id
              const hasSubs = category.subcategories.length > 0
              return (
                <li key={category.id}>
                  <div className="flex items-center">
                    <Link
                      to={storeCategoryUrl(store.slug, category.slug)}
                      onClick={onClose}
                      className={`flex-1 rounded-md px-3 py-2.5 text-sm font-semibold ${skin.text}`}
                    >
                      {category.name}
                      <span className={`ml-2 text-[11px] ${skin.muted}`}>
                        {category.productCount}
                      </span>
                    </Link>
                    {hasSubs && (
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : category.id)}
                        aria-expanded={isOpen}
                        aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${category.name}`}
                        className={`flex h-9 w-9 items-center justify-center rounded-md ${skin.muted}`}
                      >
                        <ChevronDownIcon
                          className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                    )}
                  </div>
                  {hasSubs && isOpen && (
                    <ul className="mb-1 ml-3 border-l border-line pl-3">
                      {category.subcategories.map((sub) => (
                        <li key={sub.id}>
                          <Link
                            to={storeCategoryUrl(store.slug, sub.slug)}
                            onClick={onClose}
                            className={`block py-2 text-xs ${skin.muted}`}
                          >
                            {sub.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Search + cart
// ---------------------------------------------------------------------------

function SearchBox({ store, skin }: { store: PublicStore; skin: Skin }) {
  const navigate = useNavigate()
  const [value, setValue] = useState('')

  return (
    <form
      className="relative min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault()
        const q = value.trim()
        if (q) navigate(storeShopUrl(store.slug, { q }))
      }}
    >
      <SearchIcon
        className={`pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${skin.muted}`}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search products…"
        aria-label="Search products"
        className={`h-10 w-full rounded-full border ${skin.border} bg-surface-alt pl-10 pr-4 text-sm ${skin.text} outline-none transition-colors placeholder:text-muted focus:border-brand`}
      />
    </form>
  )
}

function CartButton({ skin, storeSlug }: { skin: Skin; storeSlug: string }) {
  const items = useCart()
  /**
   * THIS store's items only. The cart is one cart across stores, but this
   * button opens `/cart?from={slug}`, which leads with this store's group —
   * a badge counting other stores' items would promise a number the next
   * screen doesn't show. The marketplace header, which opens the unscoped
   * cart, still counts everything.
   */
  const count = items.reduce(
    (sum, item) => (item.storeSlug === storeSlug ? sum + item.qty : sum),
    0,
  )

  return (
    <a
      // ?from= makes the cart continue THIS store's theme (see cartUrl).
      href={cartUrl(storeSlug)}
      aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${skin.border} ${skin.chip} transition hover:opacity-80`}
    >
      <CartIcon className={`h-5 w-5 ${skin.text}`} />
      {count > 0 && (
        <span
          className={`absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-bold ${skin.cta}`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </a>
  )
}

// ---------------------------------------------------------------------------
// Account — the marketplace profile section, carried into the storefront
// ---------------------------------------------------------------------------

/**
 * Bar slot (sm+): skeleton → Sign in → the shared avatar dropdown.
 *
 * Sign in opens the auth dialog IN PLACE, dressed in this store's palette
 * and identity (`storeAuthRequest`) — no trip to `/login` and back. The
 * session flips on success and this slot re-renders into the menu.
 */
function AccountSlot({
  store,
  session,
  skin,
}: {
  store: PublicStore
  session: SessionState<Customer>
  skin: Skin
}) {
  if (session.status === 'loading') {
    return (
      <div
        className={`h-10 w-10 animate-pulse rounded-full border ${skin.border} ${skin.chip}`}
      />
    )
  }

  if (session.status === 'guest') {
    return (
      <button
        type="button"
        onClick={() => openAuthDialog(storeAuthRequest(store))}
        className={`flex h-10 shrink-0 items-center whitespace-nowrap rounded-md px-4 text-sm font-semibold ${skin.cta} transition hover:opacity-90`}
      >
        Sign in
      </button>
    )
  }

  return <AccountMenu crossRouter />
}

/** Drawer block (below sm, where the bar has no room for the slot above). */
function DrawerAccount({
  store,
  session,
  skin,
  onClose,
}: {
  store: PublicStore
  session: SessionState<Customer>
  skin: Skin
  onClose: () => void
}) {
  if (session.status === 'loading') {
    return (
      <div
        className={`mb-2 h-16 animate-pulse rounded-md border ${skin.border} ${skin.chip}`}
      />
    )
  }

  if (session.status === 'guest') {
    return (
      <div className={`mb-2 rounded-md border p-3 ${skin.border} ${skin.surface}`}>
        <p className={`text-sm font-bold ${skin.text}`}>Your account</p>
        <p className={`mt-0.5 text-xs ${skin.muted}`}>
          Sign in to track orders and check out faster.
        </p>
        <button
          type="button"
          // Close the drawer first: on success the bar behind the dialog
          // re-renders with the account menu, which is where they'll look.
          onClick={() => {
            onClose()
            openAuthDialog(storeAuthRequest(store))
          }}
          className={`mt-3 flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold ${skin.cta} transition hover:opacity-90`}
        >
          Sign in
        </button>
      </div>
    )
  }

  return (
    <DrawerAccountMenu customer={session.user} skin={skin} onClose={onClose} />
  )
}

/**
 * The dropdown's rows, flattened into the drawer. Every link is a plain
 * anchor (marketplace routes — see `crossRouter` on `AccountMenu`), so the
 * drawer needs no closing; logout keeps it open because the confirm dialog
 * portals over it and closing would unmount the dialog with it.
 *
 * The store row is a static "My Store" rather than the dropdown's
 * Create/Manage split: that split costs a `GET /stores` on open, and
 * `/mystores` already handles the "no stores yet" case.
 */
function DrawerAccountMenu({
  customer,
  skin,
  onClose,
}: {
  customer: Customer
  skin: Skin
  onClose: () => void
}) {
  const signOutFlow = useSignOutConfirm({ crossRouter: true })
  const name = customer.name ?? 'Customer'
  const contact = customer.email ?? customer.phone ?? ''
  const rowClass = `flex items-center gap-3 rounded-md px-2 py-2.5 text-sm font-semibold ${skin.text}`

  return (
    <div className={`mb-2 rounded-md border p-3 ${skin.border} ${skin.surface}`}>
      <div className="flex items-center gap-3">
        <Avatar customer={customer} className="h-10 w-10" />
        <div className="min-w-0">
          <p className={`truncate text-sm font-bold ${skin.text}`}>{name}</p>
          {contact && (
            <p className={`truncate text-xs ${skin.muted}`}>{contact}</p>
          )}
        </div>
      </div>

      <div className={`mt-2 border-t pt-1 ${skin.border}`}>
        <a href="/mystores" onClick={onClose} className={rowClass}>
          <StoreIcon className={`h-[18px] w-[18px] ${skin.muted}`} />
          My Store
        </a>
        {ACCOUNT_MENU_ITEMS.map(({ label, to, icon: Icon }) => (
          <a key={label} href={to} onClick={onClose} className={rowClass}>
            <Icon className={`h-[18px] w-[18px] ${skin.muted}`} />
            {label}
          </a>
        ))}
        <button
          type="button"
          onClick={signOutFlow.request}
          className={`${rowClass} w-full text-danger`}
        >
          <LogoutIcon className="h-[18px] w-[18px]" />
          Logout
        </button>
      </div>

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

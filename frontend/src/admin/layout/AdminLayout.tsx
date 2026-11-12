import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { storefrontOrigin } from '../../shared/appOrigin'
import { useTheme } from '../../shared/theme/ThemeProvider'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useAdminSession } from '../app/adminSession'
import { NAV_GROUPS, titleForPath } from '../app/navigation'
import type { NavGroup } from '../app/navigation'
import { IconButton } from '../ui/primitives'
import { NotificationBell } from './NotificationBell'
import { Icon } from './icons'

/**
 * The console shell (ADMIN_UI_THEME.md §6).
 *
 *   ┌──────────────┬──────────────────────────────────────┐
 *   │ brand        │ top bar: [☰] [ search pages… / ] [🔔][☾] │ 52px
 *   │ nav          ├──────────────────────────────────────┤
 *   │  (sections)  │ page (max 1640px)                    │
 *   │ signed-in    │                                      │
 *   └──────────────┴──────────────────────────────────────┘
 *       232px
 *
 * **One nav, two presentations.** The same sidebar is a sticky 232px rail
 * above 900px and a slide-in drawer (`body.nav-open`) below it, so a nav
 * change lands in both at once. The page scrolls the WINDOW (the rail and
 * top bar are sticky), which keeps every page's own scroll handling working.
 *
 * The drawer closes on navigation, on Escape and on a tap outside it.
 */
export function AdminLayout() {
  const { admin, isSuperAdmin, signOut } = useAdminSession()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const { mode, toggle } = useTheme()
  // The Suppliers entry shows only while the supplier package is on. Loaded
  // lazily so the console's own bundle never carries the package.
  const [dropshipOn, setDropshipOn] = useState(false)
  useEffect(() => {
    let live = true
    void import('../../packages/dropship')
      .then((m) => m.isDropshipEnabled())
      .then((on) => {
        if (live) setDropshipOn(on)
      })
    return () => {
      live = false
    }
  }, [])

  // The nav this admin may see — shared by the sidebar and the page search.
  const groups = useMemo<NavGroup[]>(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) => (!item.superAdminOnly || isSuperAdmin) && (!item.dropship || dropshipOn),
        ),
      })).filter((group) => group.items.length > 0),
    [isSuperAdmin, dropshipOn],
  )

  // Close the drawer on navigation, and keep the tab title in step.
  useEffect(() => {
    setDrawerOpen(false)
    document.title = titleForPath(location.pathname)
  }, [location.pathname])

  // The drawer is a body class (admin.css slides the sidebar in). While it
  // is open the page behind it must not scroll, and Escape closes it.
  useEffect(() => {
    document.body.classList.toggle('nav-open', drawerOpen)
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    if (!drawerOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('nav-open')
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  const name = admin.name ?? admin.email
  const initials =
    name
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'A'

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="brandmark">
          {/* The lockup art has blank space on its right; pull "Admin" in. */}
          <AppLogoLockup className="-mr-5 h-6" />
          <b>Admin</b>
          <IconButton
            icon="x"
            label="Close menu"
            className="only-sm ml-auto"
            onClick={() => setDrawerOpen(false)}
          />
        </div>

        <nav className="nav">
          {groups.map((group, index) => (
            <div key={group.title}>
              {/* The first group (Dashboard) needs no heading. */}
              {index > 0 ? <div className="nav-sec">{group.title}</div> : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end ?? false}
                  className={({ isActive }) => (isActive ? 'on' : '')}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <span className="av av-28" style={{ ['--av' as string]: 'var(--brand)' }}>
            {initials}
          </span>
          <div>
            <b title={admin.email}>{name}</b>
            <span>{admin.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}</span>
          </div>
          <IconButton icon="logout" label="Sign out" danger onClick={() => setConfirmSignOut(true)} />
        </div>
      </aside>
      {/* Drawer backdrop (below 900px only): a tap outside closes the menu. */}
      <div className="side-back" aria-hidden="true" onClick={() => setDrawerOpen(false)} />

      <div className="shell-body">
        <header className="top">
          <IconButton
            icon="menu"
            label="Open navigation"
            className="only-sm"
            onClick={() => setDrawerOpen(true)}
          />
          <PageSearch groups={groups} />
          <div className="top-r">
            <a href={`${storefrontOrigin()}/`} className="lnk">
              View marketplace
            </a>
            <NotificationBell />
            <IconButton
              icon={mode === 'dark' ? 'sun' : 'moon'}
              label={mode === 'dark' ? 'Light theme' : 'Dark theme'}
              onClick={toggle}
            />
          </div>
        </header>

        {/* Re-keyed per page so the short fade-in plays on every route. */}
        <main className="page" key={location.pathname}>
          <Outlet />
        </main>
      </div>

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        description="You'll need to sign in again to reach the console."
        confirmLabel="Sign out"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false)
          void signOut()
        }}
      />
    </div>
  )
}

/**
 * The top bar's search: finds a console PAGE by name ("pay" → Payments,
 * Seller payouts) and opens it. `/` or Ctrl/⌘+K focuses it; arrow keys move,
 * Enter opens, Escape closes. It searches the nav, not records — each list
 * page has its own record search.
 */
function PageSearch({ groups }: { groups: NavGroup[] }) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  // `/` (when not typing) or Ctrl/⌘+K focuses the search.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
      if ((event.key === '/' && !typing) || (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey))) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const term = query.trim().toLowerCase()
  const results = term
    ? groups
        .map((group) => ({
          title: group.title,
          items: group.items.filter(
            (item) => item.label.toLowerCase().includes(term) || group.title.toLowerCase().includes(term),
          ),
        }))
        .filter((group) => group.items.length > 0)
    : []
  const flat = results.flatMap((group) => group.items)

  const go = (to: string) => {
    navigate(to)
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  return (
    <form
      className="gsearch"
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        const target = flat[active]
        if (target) go(target.to)
      }}
    >
      <label>
        <Icon name="search" size={15} />
        <span className="sr-only">Search pages</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search pages…"
          autoComplete="off"
          aria-expanded={open && term !== ''}
          aria-controls="gsearch-results"
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((index) => Math.min(index + 1, flat.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((index) => Math.max(index - 1, 0))
            } else if (event.key === 'Escape') {
              setQuery('')
              inputRef.current?.blur()
            }
          }}
        />
        <kbd>/</kbd>
      </label>

      {open && term ? (
        <div className="gres" id="gsearch-results">
          {flat.length === 0 ? (
            <p className="gr-empty">No page called “{query.trim()}”.</p>
          ) : (
            results.map((group) => (
              <div key={group.title}>
                <div className="gr-g">{group.title}</div>
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={flat[active]?.to === item.to ? 'on' : ''}
                    // mousedown, not click: the input's blur would close the
                    // list before a click could land.
                    onMouseDown={(event) => {
                      event.preventDefault()
                      go(item.to)
                    }}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon name={item.icon} />
                      <b>{item.label}</b>
                    </span>
                    <em>Open</em>
                  </Link>
                ))}
              </div>
            ))
          )}
        </div>
      ) : null}
    </form>
  )
}

import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { ThemeToggle } from '../../shared/theme/ThemeToggle'
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog'
import { useAdminSession } from '../app/adminSession'
import { NAV_GROUPS, titleForPath } from '../app/navigation'
import { NotificationBell } from './NotificationBell'
import { CloseIcon, LogoutIcon, MenuIcon } from './icons'

/**
 * The console shell.
 *
 * **Responsive strategy — one nav, two presentations.** The same
 * `<SidebarNav/>` renders as a fixed 16rem rail from `lg` up and as a
 * slide-in drawer below it. There is no second mobile menu to keep in sync,
 * so a nav change lands in both at once.
 *
 * The rail is fixed rather than sticky so long tables scroll under it, and
 * the drawer closes on navigation — on a phone, tapping a link and being
 * left staring at the menu is the classic console annoyance.
 */
export function AdminLayout() {
  const { admin, isSuperAdmin, signOut } = useAdminSession()
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  // Close the drawer on navigation, and keep the tab title in step.
  useEffect(() => {
    setDrawerOpen(false)
    document.title = titleForPath(location.pathname)
  }, [location.pathname])

  // A drawer over a scrolling page scrolls the page behind it; lock it.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.superAdminOnly || isSuperAdmin)
        if (items.length === 0) return null
        return (
          <div key={group.title}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end ?? false}
                    className={({ isActive }) =>
                      `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-soft text-fg'
                          : 'text-muted hover:bg-surface-alt hover:text-fg'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )

  const identity = (
    <div className="border-t border-line px-4 py-3">
      <p className="truncate text-sm font-medium text-fg">{admin.name ?? admin.email}</p>
      <p className="truncate text-xs text-muted">
        {admin.email} · {admin.role === 'SUPER_ADMIN' ? 'Super admin' : 'Admin'}
      </p>
      <button
        type="button"
        onClick={() => setConfirmSignOut(true)}
        className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-danger"
      >
        <LogoutIcon />
        Sign out
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-bg">
      {/* Fixed rail — lg and up. */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center gap-2 border-b border-line px-5">
          <AppLogoLockup className="h-7" />
          <span className="rounded-pill bg-brand-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg">
            Admin
          </span>
        </div>
        {nav}
        {identity}
      </aside>

      {/* Drawer — below lg. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-lifted">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <div className="flex items-center gap-2">
                <AppLogoLockup className="h-7" />
                <span className="font-heading text-base font-semibold text-fg">Admin</span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-surface-alt"
                aria-label="Close menu"
              >
                <CloseIcon />
              </button>
            </div>
            {nav}
            {identity}
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-2 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-md text-muted hover:bg-surface-alt hover:text-fg lg:hidden"
            aria-label="Open menu"
          >
            <MenuIcon />
          </button>
          <span className="flex items-center gap-2 truncate font-heading text-base font-semibold text-fg lg:hidden">
            <AppLogoLockup className="h-7" /> Admin
          </span>
          <div className="ml-auto flex items-center gap-1">
            <a
              href="/"
              className="hidden rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-surface-alt hover:text-fg sm:block"
            >
              View marketplace
            </a>
            <NotificationBell />
            <ThemeToggle />
          </div>
        </header>

        {/* Capped for ultrawides, matching the storefront's soft 1920px cap. */}
        <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-6">
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

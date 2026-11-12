import { Suspense } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { ThemeToggle } from '../../shared/theme'
import { AppLogoLockup } from '../../shared/ui/AppLogo'
import { AccountMenu } from './AccountMenu'
import { NotificationBell } from './NotificationBell'
import { PageSkeleton } from '../../shared/ui/states'

/**
 * Authed storefront shell — a sticky top bar over the page, nothing more.
 * Navigation lives entirely in the top-bar account menu (the old sidebar
 * duplicated it and was removed); the brand links back to the marketplace
 * homepage.
 *
 * Every account page, the seller workspace (`/mystores/**`) included, is
 * flat: a grey page under a plain top bar. (The workspace's frosted-glass
 * theme was replaced by the console look on 12 Nov 2026.)
 *
 * Pages render into <Outlet/>; they are lazy-loaded by the router, so the
 * Suspense fallback here covers per-page chunk loads.
 */
export function AppLayout() {
  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="UnieMax home" className="flex shrink-0 items-center">
          <AppLogoLockup className="h-8" />
        </Link>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <NotificationBell />
          <ThemeToggle />
          <AccountMenu />
        </div>
      </header>

      {/* Full-width like the storefront — soft cap for ultrawides only.
          Form-heavy pages constrain themselves (max-w-xl etc.). */}
      <main className="px-3 py-4 sm:px-5 lg:px-8">
        <div className="mx-auto w-full max-w-[1920px]">
          <Suspense
            fallback={
              <PageSkeleton />
            }
          >
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  )
}

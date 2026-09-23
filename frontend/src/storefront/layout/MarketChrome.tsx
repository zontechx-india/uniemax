import { MarketFooter, MarketHeader } from '../pages/HomePage'

/**
 * The marketplace shell — sticky header (brand · global search · theme ·
 * cart · session) over the page, platform footer under it.
 *
 * The header and footer still live in `HomePage.tsx`, where they were written
 * and where all their state (session, cart, search intent bus) already sits.
 * This wrapper exists so a second marketplace page — the global category
 * landing pages — can reuse them without either duplicating the chrome or
 * moving four hundred lines of working code to gain nothing. If a third
 * page arrives, that is the moment to lift them here properly.
 */
export function MarketChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <MarketHeader />
      <main className="flex-1">{children}</main>
      <MarketFooter />
    </div>
  )
}

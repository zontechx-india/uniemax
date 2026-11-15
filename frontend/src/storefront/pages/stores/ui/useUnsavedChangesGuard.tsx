import { useContext, useEffect } from 'react'
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom'
import type { Location } from 'react-router-dom'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'

/**
 * Warn before a seller walks away from unsaved edits.
 *
 * Two exits to cover:
 *   - **Leaving the app** (reload, close the tab, type a URL) — the browser's
 *     own `beforeunload` prompt; no custom wording is allowed there.
 *   - **Navigating inside it** (the section nav, a back tap, the phone's back
 *     button) — react-router's `useBlocker`, answered by our own sheet in
 *     plain words.
 *
 * `useBlocker` only exists under a DATA router. The storefront has one; the
 * admin console mounts these same pages under a plain `<BrowserRouter>`,
 * where calling it would throw — so the in-app half renders only when a data
 * router is present, and the console keeps the browser prompt alone.
 *
 * The blocker is mounted ONLY while there are unsaved edits. A router honours
 * just the most recently mounted blocker, so a clean guard that stayed mounted
 * (a footer page embedded in the builder, a second save bar) used to switch
 * off the one guard that actually had something to protect.
 *
 * `leaving` decides which moves count. By default only a move to a DIFFERENT
 * page does — a query-string change (a tab, a filter) keeps the form. A page
 * whose editors live in the query string (the Store Builder's `?edit=`) passes
 * its own rule.
 *
 * Returns the sheet to render; place it anywhere in the page.
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  { leaving }: { leaving?: (current: Location, next: Location) => boolean } = {},
) {
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const dataRouter = useContext(UNSAFE_DataRouterContext)
  return dataRouter && dirty ? <NavigationPrompt leaving={leaving ?? otherPage} /> : null
}

const otherPage = (current: Location, next: Location) =>
  current.pathname !== next.pathname

function NavigationPrompt({
  leaving,
}: {
  leaving: (current: Location, next: Location) => boolean
}) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    leaving(currentLocation, nextLocation),
  )

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      title="Leave without saving?"
      description="You changed some details on this page but did not save them. If you leave now, those changes will be lost."
      confirmLabel="Leave"
      cancelLabel="Stay here"
      onConfirm={() => blocker.proceed?.()}
      onCancel={() => blocker.reset?.()}
    />
  )
}

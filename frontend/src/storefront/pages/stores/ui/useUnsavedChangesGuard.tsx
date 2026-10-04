import { useContext, useEffect } from 'react'
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'

/**
 * Warn before a seller walks away from unsaved edits.
 *
 * Two exits to cover:
 *   - **Leaving the app** (reload, close the tab, type a URL) — the browser's
 *     own `beforeunload` prompt; no custom wording is allowed there.
 *   - **Navigating inside it** (the section nav, a back tap) — react-router's
 *     `useBlocker`, answered by our own sheet in plain words.
 *
 * `useBlocker` only exists under a DATA router. The storefront has one; the
 * admin console mounts these same pages under a plain `<BrowserRouter>`,
 * where calling it would throw — so the in-app half renders only when a data
 * router is present, and the console keeps the browser prompt alone.
 *
 * Returns the sheet to render; place it anywhere in the page.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
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
  return dataRouter ? <NavigationPrompt when={dirty} /> : null
}

function NavigationPrompt({ when }: { when: boolean }) {
  // Only a move to a DIFFERENT page counts — a query-string change (a tab,
  // a filter) on the same page keeps the form, so it must not ask.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && currentLocation.pathname !== nextLocation.pathname,
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

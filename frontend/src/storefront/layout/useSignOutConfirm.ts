import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCustomerSession } from '../app/sessionContext'

/**
 * Confirm-then-sign-out flow shared by every logout entry point
 * (sidebar profile section, top-bar account menu). The session is only
 * revoked after `confirm()` — `request()` merely opens the dialog.
 *
 * **Logging out always lands on the marketplace homepage.**
 *
 * The navigation happens BEFORE the session is revoked, and that order is
 * deliberate. Signing out from a guarded route (`/mystores/motocore`, `/orders`
 * …) flips the session to guest while that route is still mounted, so
 * `RequireCustomer` sees a guest on a protected path and redirects to
 * `/login?next=/mystores/motocore` — logout dumped the customer on a login
 * page, and signing back in returned them to the page they had just left.
 * Moving to `/` first means the guest state lands on a public route and the
 * guard never runs.
 *
 * `replace` so the page they logged out of is not one Back press away.
 *
 * `crossRouter` is for the callers inside the anonymous shopping router
 * (the `/store/{slug}` header): `/` is not a route there, so a client-side
 * navigate would land on that router's "Page not found". Those sign out
 * FIRST and then hard-replace the location — the store page underneath is
 * public, so it survives the moment of being a guest, and the full load
 * brings up the marketplace router at `/`.
 */
export function useSignOutConfirm({ crossRouter = false } = {}) {
  const { signOut } = useCustomerSession()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    setBusy(true)
    try {
      if (crossRouter) {
        await signOut()
        window.location.replace('/')
        return
      }
      navigate('/', { replace: true })
      await signOut()
      // No cleanup needed on success: the session gate unmounts this tree.
    } catch {
      setBusy(false)
      setConfirming(false)
    }
  }

  return {
    confirming,
    busy,
    request: () => setConfirming(true),
    cancel: () => setConfirming(false),
    confirm,
  }
}

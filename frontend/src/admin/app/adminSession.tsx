import { createContext, useContext, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { adminAuth } from '../../shared/auth/authApi'
import type { Admin } from '../../shared/auth/authApi'
import { http } from '../../shared/auth/http'

/**
 * Admin session context + the console's session-hardening rules.
 *
 * The console is the highest-privilege surface on the platform, so it does
 * three things the storefront does not:
 *
 * 1. **Silent refresh on a timer.** The access token lives 15 minutes; the
 *    console rotates it every 10 so a long shift on one screen never dies
 *    mid-action. Rotation is a cookie exchange — no token touches JS.
 * 2. **Idle sign-out.** An unattended console on a shared desk is the real
 *    risk, so 30 minutes without a keystroke, click or scroll ends the
 *    session server-side. `visibilitychange` is deliberately NOT treated as
 *    activity: a background tab is not someone at the desk.
 * 3. **Global 401 handling.** The shared http client answers every 401 with
 *    one silent refresh + replay first (so a laptop waking from sleep past
 *    the token's 15 minutes just carries on). A 401 that reaches this
 *    provider is therefore one the refresh could not fix — the session was
 *    revoked from another device, or the admin was deactivated — and the
 *    whole app drops to the login screen at once instead of leaving
 *    half-loaded pages showing stale data.
 */

export interface AdminSession {
  admin: Admin
  isSuperAdmin: boolean
  signOut: () => Promise<void>
}

const AdminSessionContext = createContext<AdminSession | null>(null)

export function useAdminSession(): AdminSession {
  const session = useContext(AdminSessionContext)
  if (!session) throw new Error('useAdminSession must be used inside AdminSessionProvider')
  return session
}

/** Rotate the access token this often (token TTL is 15 min). */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000
/** End the session after this much inactivity. */
const IDLE_LIMIT_MS = 30 * 60 * 1000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'focus'] as const

export function AdminSessionProvider({
  admin,
  onSignedOut,
  children,
}: {
  admin: Admin
  onSignedOut: () => void
  children: ReactNode
}) {
  const lastActivity = useRef(Date.now())
  const signedOut = useRef(false)

  // One place ends the session, however it ended, so the timers and the
  // 401 interceptor can't race into two sign-outs.
  const endSession = useRef(async () => {
    if (signedOut.current) return
    signedOut.current = true
    try {
      await adminAuth.logout()
    } finally {
      onSignedOut()
    }
  })

  useEffect(() => {
    const markActive = () => {
      lastActivity.current = Date.now()
    }
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, markActive, { passive: true })
    }

    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current >= IDLE_LIMIT_MS) {
        void endSession.current()
        return
      }
      // Only worth rotating while someone is actually here.
      void adminAuth.refresh().catch(() => void endSession.current())
    }, REFRESH_INTERVAL_MS)

    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, markActive)
      window.clearInterval(timer)
    }
  }, [])

  // A 401 from any admin call that the shared client's refresh-and-replay
  // could not clear means the session is gone — drop out now rather than
  // letting each page render its own "Unauthorized" error.
  useEffect(() => {
    const interceptor = http.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error?.response?.status
        const url: string = error?.config?.url ?? ''
        // The login POST answers 401 for bad credentials — that is a form
        // error, not an expired session. And once we have signed out, the
        // failed replay's own rejection must not sign out a second time.
        if (
          status === 401 &&
          !signedOut.current &&
          url.startsWith('/api/v1/admin') &&
          !url.includes('/auth/')
        ) {
          signedOut.current = true
          onSignedOut()
        }
        return Promise.reject(error)
      },
    )
    return () => http.interceptors.response.eject(interceptor)
  }, [onSignedOut])

  return (
    <AdminSessionContext.Provider
      value={{
        admin,
        isSuperAdmin: admin.role === 'SUPER_ADMIN',
        signOut: () => endSession.current(),
      }}
    >
      {children}
    </AdminSessionContext.Provider>
  )
}

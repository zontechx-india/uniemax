import { useCallback, useEffect, useState } from 'react'
import { resolveSession } from './authApi'

/**
 * Cookie-session state for an app shell (storefront or admin).
 *
 *   loading → probing /me on mount (the http client refreshes + retries an
 *             expired access cookie by itself)
 *   guest   → no valid session; show the login page
 *   authed  → `user` is the signed-in principal
 */
export type SessionState<TUser> =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'authed'; user: TUser }

export function useSession<TUser>(api: {
  me(): Promise<TUser>
  logout(): Promise<unknown>
}) {
  const [state, setState] = useState<SessionState<TUser>>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    resolveSession(api)
      .then((user) => {
        if (!cancelled) setState(user ? { status: 'authed', user } : { status: 'guest' })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'guest' })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- api objects are module singletons
  }, [])

  /** Call after a successful login/register/verify with the returned user. */
  const signedIn = useCallback((user: TUser) => {
    setState({ status: 'authed', user })
  }, [])

  /** Revokes the session server-side and drops to guest. */
  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setState({ status: 'guest' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- api objects are module singletons
  }, [])

  return { state, signedIn, signOut }
}

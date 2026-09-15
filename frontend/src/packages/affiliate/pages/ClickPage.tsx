import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { publicAffiliateApi } from '../api'
import { saveAttribution } from '../attribution'

/**
 * /a/:token — the short link an affiliate shares. Records the click, keeps
 * the attribution token for checkout, then hands the visitor to the store.
 * The storefront is a separate router, so this is a full navigation.
 */
export function ClickPage() {
  const { token = '' } = useParams()
  const [error, setError] = useState<string | null>(null)
  // StrictMode runs effects twice in dev; a click must only be counted once.
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    publicAffiliateApi
      .click(token)
      .then((result) => {
        saveAttribution(result.storeSlug, result.ref, result.expiresAt)
        window.location.replace(result.path)
      })
      .catch((err) => setError(toApiError(err).message))
  }, [token])

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-sm text-center">
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-fg">{error}</h1>
            <a href="/" className="mt-4 inline-block text-sm font-semibold text-brand hover:underline">
              Go to UnieMax
            </a>
          </>
        ) : (
          <p className="text-sm text-muted">Taking you to the store…</p>
        )}
      </div>
    </div>
  )
}

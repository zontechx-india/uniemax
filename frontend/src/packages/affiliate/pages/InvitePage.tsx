import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { AppLogoLockup } from '../../../shared/ui/AppLogo'
import { Button } from '../../../shared/ui/Button'
import { ErrorNote } from '../../../shared/ui/form'
import { useMarketSession } from '../../../storefront/app/marketSession'
import { openAuthDialog } from '../../../storefront/features/auth/authDialogStore'
import { publicAffiliateApi } from '../api'
import { rateText, shortDate, useLoad } from '../ui'

/**
 * /affiliate/invite/:token — where the emailed invitation lands. Public, so a
 * person with no account can read it; accepting needs a session, which the
 * sign-in dialog provides in place.
 */
export function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { state } = useMarketSession()
  const invite = useLoad(() => publicAffiliateApi.invite(token), [token])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accept = async () => {
    setBusy(true)
    setError(null)
    try {
      await publicAffiliateApi.accept(token)
      navigate('/affiliate', { replace: true })
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  const data = invite.data
  const open = data?.status === 'PENDING'

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 sm:p-8">
        <Link to="/" className="inline-flex">
          <AppLogoLockup className="h-8" />
        </Link>

        {invite.loading && <p className="mt-6 text-sm text-muted">Loading invitation…</p>}
        {invite.error && <div className="mt-6"><ErrorNote>{invite.error}</ErrorNote></div>}

        {data && (
          <>
            <h1 className="mt-6 text-xl font-semibold text-fg">
              {data.storeName} invited you to be an affiliate partner
            </h1>
            <p className="mt-2 text-sm text-muted">
              Hi {data.name} — share {data.storeName}&apos;s products with your audience and
              earn <span className="font-semibold text-fg">{rateText(data.commissionType, data.commissionRate)}</span>{' '}
              on every order that comes through your links.
            </p>

            {open ? (
              <div className="mt-6 space-y-3">
                {state.status === 'authed' ? (
                  <Button full loading={busy} onClick={accept}>
                    Accept invitation
                  </Button>
                ) : (
                  <Button full onClick={() => openAuthDialog()}>
                    Sign in or create an account to accept
                  </Button>
                )}
                {error && <ErrorNote>{error}</ErrorNote>}
                <p className="text-center text-xs text-muted">
                  Valid until {shortDate(data.expiresAt)}
                </p>
              </div>
            ) : (
              <p className="mt-6 rounded-md bg-surface-alt p-3 text-sm text-muted">
                {data.status === 'ACCEPTED' && 'This invitation has already been accepted.'}
                {data.status === 'EXPIRED' && 'This invitation has expired — ask the store for a new one.'}
                {data.status === 'CANCELLED' && 'This invitation was withdrawn by the store.'}
                {data.status === 'CLOSED' && 'This store is not running an affiliate programme right now.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

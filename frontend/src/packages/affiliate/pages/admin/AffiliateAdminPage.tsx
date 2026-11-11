import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { adminAffiliateApi } from '../../api'
import { CommissionsTable } from '../CommissionsTable'
import { CommissionActions } from './CommissionActions'
import { Empty, Pager, StatusChip, shortDate, useLoad } from '../../ui'

/**
 * Platform oversight: every affiliate account, every commission, and the
 * approval job on demand. Sellers run their programmes; this is the view
 * from above them. Each account opens its full record
 * (`AffiliateAdminDetailPage`).
 *
 * On a phone both lists run edge to edge like a native list; each account
 * keeps its Suspend / Reinstate on the row, and commissions turn into cards
 * (see `CommissionsTable`).
 */
export default function AffiliateAdminPage() {
  const [page, setPage] = useState(1)
  const affiliates = useLoad(() => adminAffiliateApi.affiliates(page), [page])
  const [error, setError] = useState<string | null>(null)
  const [runResult, setRunResult] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>, then?: () => void) => {
    setError(null)
    try {
      await fn()
      then?.()
    } catch (err) {
      setError(toApiError(err).message)
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-fg">Affiliates</h1>
          <p className="mt-1 text-sm text-muted">
            Partner accounts across every store, and the commissions they have earned.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            run(async () => {
              const { approved } = await adminAffiliateApi.approveNow()
              setRunResult(`Approved ${approved} matured commission${approved === 1 ? '' : 's'}.`)
            })
          }
        >
          Run approval now
        </Button>
      </header>

      {error && <p className="text-sm text-danger">{error}</p>}
      {runResult && <p className="text-sm text-muted">{runResult}</p>}

      <section>
        <h2 className="text-lg font-semibold text-fg">Accounts</h2>
        {affiliates.error && <p className="mt-2 text-sm text-danger">{affiliates.error}</p>}
        {affiliates.data?.items.length === 0 && <div className="mt-2"><Empty>No affiliates yet.</Empty></div>}
        {affiliates.data && affiliates.data.items.length > 0 ? (
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
            {affiliates.data.items.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                <Link
                  to={`/affiliates/${row.id}`}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-surface-alt text-sm font-semibold text-muted"
                    aria-hidden
                  >
                    {row.displayName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg group-hover:underline">
                      {row.displayName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {row.stores} store{row.stores === 1 ? '' : 's'} · {row.links} link
                      {row.links === 1 ? '' : 's'} · joined {shortDate(row.createdAt)}
                    </p>
                    {/* The status sits under the name on a phone, beside it from `sm`. */}
                    <div className="mt-1.5 sm:hidden">
                      <StatusChip status={row.status} />
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <StatusChip status={row.status} />
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className={row.status === 'ACTIVE' ? 'text-danger!' : ''}
                  onClick={() =>
                    run(
                      () =>
                        adminAffiliateApi.setStatus(
                          row.id,
                          row.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                        ),
                      affiliates.reload,
                    )
                  }
                >
                  {row.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {affiliates.data && <Pager meta={affiliates.data.meta} onPage={setPage} />}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-fg">Commissions</h2>
        <div className="mt-3">
          <CommissionsTable
            load={(q) => adminAffiliateApi.commissions(q)}
            showAffiliate
            showStore
            actions={(row, reload) => (
              <CommissionActions row={row} reload={reload} onError={setError} />
            )}
          />
        </div>
      </section>
    </div>
  )
}

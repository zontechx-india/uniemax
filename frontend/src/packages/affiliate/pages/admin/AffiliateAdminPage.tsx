import { useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { adminAffiliateApi } from '../../api'
import { CommissionsTable } from '../CommissionsTable'
import { Empty, Pager, StatusChip, shortDate, useLoad } from '../../ui'

/**
 * Platform oversight: every affiliate account, every commission, and the
 * approval job on demand. Sellers run their programmes; this is the view
 * from above them.
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
        <div>
          <h1 className="font-heading text-2xl font-bold text-fg">Affiliates</h1>
          <p className="mt-1 text-sm text-muted">
            Partner accounts across every store, and the commissions they have earned.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const { approved } = await adminAffiliateApi.approveNow()
              setRunResult(`Approved ${approved} matured commission${approved === 1 ? '' : 's'}.`)
            })
          }
          className="rounded-md border border-line px-3 py-2 text-sm font-medium text-fg hover:bg-surface-alt"
        >
          Run approval now
        </button>
      </header>

      {error && <p className="text-sm text-danger">{error}</p>}
      {runResult && <p className="text-sm text-muted">{runResult}</p>}

      <section>
        <h2 className="text-base font-semibold text-fg">Accounts</h2>
        {affiliates.error && <p className="mt-2 text-sm text-danger">{affiliates.error}</p>}
        {affiliates.data?.items.length === 0 && <div className="mt-2"><Empty>No affiliates yet.</Empty></div>}
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {affiliates.data?.items.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{row.displayName}</p>
                <p className="text-xs text-muted">
                  {row.stores} stores · {row.links} links · joined {shortDate(row.createdAt)}
                </p>
              </div>
              <StatusChip status={row.status} />
              <button
                type="button"
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
                className="text-xs font-medium text-muted hover:text-fg"
              >
                {row.status === 'ACTIVE' ? 'Suspend' : 'Reinstate'}
              </button>
            </li>
          ))}
        </ul>
        {affiliates.data && <Pager meta={affiliates.data.meta} onPage={setPage} />}
      </section>

      <section>
        <h2 className="text-base font-semibold text-fg">Commissions</h2>
        <div className="mt-2">
          <CommissionsTable
            load={(q) => adminAffiliateApi.commissions(q)}
            showAffiliate
            showStore
            actions={(row, reload) =>
              row.status === 'PENDING' || row.status === 'APPROVED' ? (
                <div className="flex justify-end gap-2">
                  {row.status === 'PENDING' && (
                    <button
                      type="button"
                      onClick={() =>
                        run(() => adminAffiliateApi.updateCommission(row.id, { status: 'APPROVED' }), reload)
                      }
                      className="text-xs font-medium text-success hover:underline"
                    >
                      Approve
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const note = window.prompt('Reason for rejecting this commission?') ?? ''
                      void run(
                        () => adminAffiliateApi.updateCommission(row.id, { status: 'REJECTED', note }),
                        reload,
                      )
                    }}
                    className="text-xs font-medium text-danger hover:underline"
                  >
                    Reject
                  </button>
                </div>
              ) : null
            }
          />
        </div>
      </section>
    </div>
  )
}

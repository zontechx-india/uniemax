import { useState } from 'react'
import type { ReactNode } from 'react'
import { ErrorNote } from '../../../shared/ui/form'
import type { Commission, CommissionStatus, Page } from '../api'
import { COMMISSION_STATUSES, Empty, Pager, StatusChip, money, rateText, shortDate, useLoad } from '../ui'

/**
 * One commissions list for all three audiences. `who` adds the affiliate
 * column (seller/admin), `store` the store column (partner/admin).
 */
export function CommissionsTable({
  load,
  showAffiliate = false,
  showStore = false,
  actions,
}: {
  load: (query: { page: number; status?: CommissionStatus }) => Promise<Page<Commission>>
  showAffiliate?: boolean
  showStore?: boolean
  actions?: (row: Commission, reload: () => void) => ReactNode
}) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<CommissionStatus | ''>('')
  const list = useLoad(
    () => load({ page, ...(status ? { status } : {}) }),
    [page, status],
  )

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted" htmlFor="commission-status">
          Status
        </label>
        <select
          id="commission-status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as CommissionStatus | '')
            setPage(1)
          }}
          className="h-9 rounded-md border border-line bg-input px-2 text-sm text-fg"
        >
          <option value="">All</option>
          {COMMISSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0) + s.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      {list.error && <div className="mt-3"><ErrorNote>{list.error}</ErrorNote></div>}
      {list.data && list.data.items.length === 0 && (
        <div className="mt-3"><Empty>No commissions{status ? ' with this status' : ' yet'}.</Empty></div>
      )}

      {list.data && list.data.items.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Order</th>
                {showStore && <th className="px-3 py-2">Store</th>}
                {showAffiliate && <th className="px-3 py-2">Affiliate</th>}
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Sale</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Commission</th>
                <th className="px-3 py-2">Status</th>
                {actions && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.data.items.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-fg">
                    <p className="font-medium">{row.orderNumber}</p>
                    <p className="text-xs text-muted">{shortDate(row.createdAt)}</p>
                  </td>
                  {showStore && <td className="px-3 py-2 text-fg">{row.storeName}</td>}
                  {showAffiliate && <td className="px-3 py-2 text-fg">{row.affiliate.displayName}</td>}
                  <td className="px-3 py-2 text-fg">{row.productName}</td>
                  <td className="px-3 py-2 text-right text-fg">{money(row.lineTotal)}</td>
                  <td className="px-3 py-2 text-right text-muted">
                    {rateText(row.commissionType, row.commissionRate)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-fg">{money(row.amount)}</td>
                  <td className="px-3 py-2">
                    <StatusChip status={row.status} />
                    {row.status === 'PENDING' && row.maturesAt && (
                      <p className="mt-0.5 text-xs text-muted">approves {shortDate(row.maturesAt)}</p>
                    )}
                    {row.note && <p className="mt-0.5 text-xs text-muted">{row.note}</p>}
                  </td>
                  {actions && <td className="px-3 py-2 text-right">{actions(row, list.reload)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data && <Pager meta={list.data.meta} onPage={setPage} />}
    </div>
  )
}

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { storeFinanceApi } from '../../../features/stores/storesApi'
import type { SellerTransaction } from '../../../features/stores/storesApi'
import { useStoreManageScope } from '../../../features/stores/storeManageScope'
import { RupeeIcon } from '../../../layout/icons'
import { PanelCard } from '../ui/PanelCard'
import { StatusPill } from '../ui/StatusPill'
import { money, moneyCounts, paymentModeLabel, settlementNote, settlementPill } from './settlementMeta'

/**
 * The order page's **Money** card — this order's row from Transactions
 * (docs/seller-finance/ §8): the bill, how the customer paid, the fee, what
 * the seller gets, and whether that money has reached them. Read-only; it
 * reloads when the order's status or payment changes (`version`).
 */
export function MoneyCard({ storeId, orderId, version }: { storeId: string; orderId: string; version: string }) {
  const { hiddenSections } = useStoreManageScope()
  const [row, setRow] = useState<SellerTransaction | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    storeFinanceApi
      .transaction(storeId, orderId)
      .then((data) => {
        if (!cancelled) setRow(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toApiError(err).message)
      })
    return () => {
      cancelled = true
    }
  }, [storeId, orderId, version])

  const status = row ? settlementPill(row) : null
  const gatewayFee = row ? Number(row.gatewayFee) : 0

  return (
    <PanelCard
      icon={RupeeIcon}
      title="Money"
      aside={status ? <StatusPill tone={status.tone}>{status.label}</StatusPill> : undefined}
    >
      {error ? (
        <p className="text-sm text-muted">Could not load the money details. {error}</p>
      ) : !row ? (
        <div aria-busy="true" aria-label="Loading money details" className="ws-well h-28 animate-pulse rounded-md" />
      ) : (
        <div className="space-y-3">
          <dl className="space-y-1.5 text-base">
            <Line label="Bill amount" value={money(row.billAmount)} />
            <Line label="Paid by" value={paymentModeLabel(row.paymentMethod)} />
            {moneyCounts(row) && (
              <>
                <Line label="Platform fee" value={money(row.platformFee)} />
                {gatewayFee > 0 &&
                  (row.gatewayFeeBearer === 'SELLER' ? (
                    <Line label="Gateway fee" value={money(row.gatewayFee)} />
                  ) : (
                    // UnieMax pays it — shown as the seller's discount, not taken from them.
                    <Line
                      label={
                        <>
                          Gateway fee
                          <span className="block text-sm text-success">Paid by UnieMax</span>
                        </>
                      }
                      value={<span className="text-muted line-through">{money(row.gatewayFee)}</span>}
                    />
                  ))}
                <div className="flex justify-between gap-3 border-t border-line pt-2">
                  <dt className="font-bold text-fg">You get</dt>
                  <dd className="font-figure font-bold text-fg">{money(row.youGet)}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="ws-well rounded-md px-3 py-2.5 text-sm text-fg">{settlementNote(row)}</p>
          {!hiddenSections.includes('transactions') && (
            <Link to="../transactions" className="inline-block text-sm font-medium text-brand hover:underline">
              See all transactions
            </Link>
          )}
        </div>
      )}
    </PanelCard>
  )
}

function Line({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-figure text-fg">{value}</dd>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { Card, CardHeader } from '../../../shared/ui/Card'
import { EmptyState, ErrorState, Skeleton } from '../../../shared/ui/states'
import { Button } from '../../../shared/ui/Button'
import { BUCKET_LABEL, ENTRY_LABEL, signed } from '../../../shared/finance/ledgerLabels'
import { storeFinanceApi } from '../../features/stores/storesApi'
import type { SellerEarnings } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { RupeeIcon } from '../../layout/icons'
import { PageHeader } from './ui/PageHeader'
import { StatusPill } from './ui/StatusPill'
import type { StatusTone } from './ui/StatusPill'

/**
 * Earnings — the seller's side of seller finance (docs/seller-finance/).
 * Read-only: what UnieMax will pay them, what is on its way, what they owe
 * (platform fees on cash orders), the payouts made and every entry behind
 * those numbers, newest first. Every figure comes from the server.
 */

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })
const money = (value: string) => inr.format(Number(value))
const day = (value: string | null, withTime = false) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
      })
    : '—'

const PAYOUT_STATUS: Record<SellerEarnings['payouts'][number]['status'], { label: string; tone: StatusTone }> = {
  PENDING: { label: 'Not sent yet', tone: 'pending' },
  PROCESSING: { label: 'On its way', tone: 'pending' },
  SUCCEEDED: { label: 'Paid', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  REVERSED: { label: 'Came back', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
}

export function StoreEarningsPage() {
  const { store } = useManagedStore()
  const [page, setPage] = useState(1)
  const [data, setData] = useState<SellerEarnings | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(null)
    storeFinanceApi
      .earnings(store.id, page)
      .then(setData)
      .catch((err: unknown) => setError(toApiError(err).message))
  }, [store.id, page])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="space-y-4">
      <PageHeader
        icon={RupeeIcon}
        title="Earnings"
        description="What UnieMax pays you for online orders, and the platform fee on your sales."
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <Skeleton rows={8} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Tile label={BUCKET_LABEL.PAYABLE.seller} value={money(data.balance.payable)} hint="From delivered online orders, after the platform fee." />
            <Tile label={BUCKET_LABEL.IN_PAYOUT.seller} value={money(data.balance.inPayout)} hint="Sent or being sent to your bank account." />
            <Tile
              label={BUCKET_LABEL.OWED.seller}
              value={money(data.balance.owed)}
              hint="Platform fee on cash-on-delivery orders. Taken from your next payout."
              warn={Number(data.balance.owed) > 0}
            />
          </div>

          <Card>
            <p className="text-base text-fg">
              <span className="font-semibold">Platform fee: {Number(data.rates.platform.percent)}%</span>{' '}
              <span className="text-muted">
                of the product price, on every delivered order (never on shipping). Customers don’t see it.
              </span>
            </p>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Totals title="Online orders delivered" t={data.delivered.online} />
            <Totals title="Cash on delivery orders delivered" t={data.delivered.cod} />
          </div>

          <Card>
            <CardHeader title="Payouts" subtitle="Money UnieMax sent to your bank account." />
            {data.payouts.length === 0 ? (
              <p className="text-base text-muted">No payouts yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.payouts.map((payout) => (
                  <li key={payout.id} className="flex flex-wrap items-start justify-between gap-2 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="font-figure text-base font-semibold text-fg">{money(payout.amount)}</p>
                      <p className="text-sm text-muted">
                        Order{' '}
                        <Link to={`../orders/${payout.order.id}`} className="text-brand hover:underline">
                          {payout.order.orderNumber}
                        </Link>
                        {payout.paidAt ? ` · ${day(payout.paidAt, payout.paidAtTimeKnown)}` : ''}
                        {payout.utr ? ` · UTR ${payout.utr}` : ''}
                      </p>
                      {Number(payout.duesDeducted) > 0 ? (
                        <p className="text-sm text-muted">
                          {money(payout.duesDeducted)} of your COD dues was taken from this payout.
                        </p>
                      ) : null}
                    </div>
                    <StatusPill tone={PAYOUT_STATUS[payout.status].tone}>{PAYOUT_STATUS[payout.status].label}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="All entries" subtitle="Every amount added to or taken from your balances, newest first." />
            {data.ledger.rows.length === 0 ? (
              <EmptyState compact title="Nothing yet" description="Entries appear when your orders are delivered." />
            ) : (
              <ul className="divide-y divide-line">
                {data.ledger.rows.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-base font-medium text-fg">{ENTRY_LABEL[row.type]}</p>
                      <p className="text-sm text-muted">
                        {row.description} · {day(row.createdAt, true)}
                      </p>
                      <p className="text-sm text-muted">{BUCKET_LABEL[row.bucket].seller}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-figure text-base font-semibold text-fg">{signed(row.amount, money)}</p>
                      <p className="font-figure text-sm text-muted">now {money(row.balanceAfter)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {data.ledger.meta.totalPages > 1 ? (
              <div className="mt-4 flex items-center justify-between gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Newer
                </Button>
                <span className="text-sm text-muted">
                  Page {data.ledger.meta.page} of {data.ledger.meta.totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= data.ledger.meta.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Older
                </Button>
              </div>
            ) : null}
          </Card>
        </>
      )}
    </div>
  )
}

function Tile({ label, value, hint, warn = false }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <Card className={warn ? 'border-warning/40' : ''}>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 font-figure text-2xl font-bold text-fg">{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </Card>
  )
}

function Totals({ title, t }: { title: string; t: SellerEarnings['delivered']['online'] }) {
  const rows: [string, string][] = [
    ['Orders', String(t.orders)],
    ['Sales', money(t.sales)],
    ['Platform fee', money(t.platformFees)],
  ]
  return (
    <Card>
      <CardHeader title={title} className="mb-2" />
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2 border-b border-line py-2 last:border-0">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="font-figure text-sm font-medium text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

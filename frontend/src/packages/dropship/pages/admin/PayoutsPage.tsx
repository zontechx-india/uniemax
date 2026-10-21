import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../../../shared/ui/Badge'
import { Button } from '../../../../shared/ui/Button'
import { InfoNote } from '../../../../shared/ui/form'
import { EmptyState, ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { adminPayoutsApi } from '../../api'
import type { PayoutRow } from '../../api'
import { dateTime, money, shortDate, useLoad } from '../../ui'

const STATE: Record<string, { text: string; tone: 'success' | 'pending' | 'danger' | 'neutral' }> = {
  DONE: { text: 'Split done', tone: 'success' },
  WAITING: { text: 'Waiting for the split', tone: 'neutral' },
  REQUESTED: { text: 'Requested', tone: 'pending' },
  FAILED: { text: 'Split failed — retrying', tone: 'danger' },
  FALLBACK_DIRECT: { text: 'Paid directly instead', tone: 'neutral' },
}

/**
 * Admin → Payouts: every order paid, or meant to be paid, by Easy Split — who
 * got what, the reference, and when the supplier's bank is paid out. Read-only.
 * While payouts run in the sandbox no money moves; the labels say so.
 */
export default function PayoutsPage() {
  const [page, setPage] = useState(1)
  const list = useLoad(() => adminPayoutsApi.list(page), [page])

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-fg">Payouts</h1>
        <p className="mt-1 text-sm text-muted">
          Orders paid to suppliers and sellers through Easy Split, and where each split stands.
        </p>
      </header>
      <InfoNote>Sandbox: these are simulated splits. No money moves and no payment gateway is called.</InfoNote>

      {list.loading && !list.data && <PageSkeleton label="Loading payouts" />}
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {list.data && list.data.items.length === 0 && (
        <EmptyState title="No split payouts yet" description="Prepaid supplier orders show up here once Easy Split is on." />
      )}

      {list.data && list.data.items.length > 0 && (
        <ul className="space-y-3">
          {list.data.items.map((p) => (
            <PayoutCard key={p.supplierOrderId} p={p} />
          ))}
        </ul>
      )}

      {list.data && list.data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {list.data.meta.page} of {list.data.meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= list.data.meta.totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function PayoutCard({ p }: { p: PayoutRow }) {
  const s = STATE[p.state] ?? { text: p.state, tone: 'neutral' as const }
  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/orders/${p.orderId}`} className="text-sm font-semibold text-brand underline">
          Order #{p.orderNumber}
        </Link>
        <Badge tone={s.tone} dot>
          {s.text}
        </Badge>
        <span className="ml-auto text-xs text-muted">{p.paidAt ? `Paid ${dateTime(p.paidAt)}` : '—'}</span>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Row label={`Supplier — ${p.supplier}`} value={p.supplierGets != null ? money(p.supplierGets) : '—'} />
        <Row label={`Seller — ${p.seller}`} value={p.sellerGets != null ? money(p.sellerGets) : '—'} />
        <Row label="UnieMax fee (kept)" value={p.platformFee != null ? money(p.platformFee) : '—'} />
        <Row label="Customer paid" value={p.orderTotal != null ? money(p.orderTotal) : '—'} />
      </dl>
      <p className="mt-2 text-xs text-muted">
        {p.ref ? `Reference ${p.ref}` : 'No reference yet'}
        {p.payoutOn ? ` · pays out ${shortDate(p.payoutOn)}` : ''}
        {p.attempts > 0 ? ` · ${p.attempts} ${p.attempts === 1 ? 'attempt' : 'attempts'}` : ''}
        {p.error ? ` · ${p.error}` : ''}
      </p>
    </li>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-fg">{value}</dd>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { Button } from '../../../shared/ui/Button'
import { Card } from '../../../shared/ui/Card'
import { ErrorNote } from '../../../shared/ui/form'
import { storeFinanceApi } from '../../features/stores/storesApi'
import type { SellerTransaction, SellerTransactions, SellerTransactionsQuery } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ChevronRightIcon, ReceiptIcon, SearchIcon } from '../../layout/icons'
import {
  money,
  moneyCounts,
  moneyDay,
  paymentModeLabel,
  sellerFee,
  settlementNote,
  settlementPill,
} from './orders/settlementMeta'
import { EmptyState } from './ui/EmptyState'
import { PageHeader } from './ui/PageHeader'
import { StatusPill } from './ui/StatusPill'

/**
 * Transactions — the seller's bill book (docs/seller-finance/ §8). One row
 * per order: what the customer paid, how they paid, and whether the money
 * has reached the seller yet. Earnings shows the same money as balances and
 * ledger entries; this page answers "what about THIS order?".
 *
 * Filters live in the URL (?period=&mode=) so a link opens the same view.
 * Every amount and every status comes from the server.
 */

const PAGE_SIZE = 20

// --- Period -----------------------------------------------------------------

type Period = 'month' | 'last-month' | '7d' | 'all'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'all', label: 'All time' },
]

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
/** A date as an India calendar day, "2026-11-19" — what the server filters on. */
const istDay = (date: Date) => new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)

function periodRange(period: Period): { from?: string; to?: string } {
  if (period === 'all') return {}
  const today = istDay(new Date())
  if (period === '7d') {
    return { from: istDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)), to: today }
  }
  const [y, m] = today.split('-').map(Number) as [number, number]
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today }
  // Last month: day 0 of this month (UTC maths, no time zone involved) is its last day.
  const lastDay = new Date(Date.UTC(y, m - 1, 0))
  const ym = lastDay.toISOString().slice(0, 7)
  return { from: `${ym}-01`, to: lastDay.toISOString().slice(0, 10) }
}

// --- Mode ---------------------------------------------------------------------

type Mode = 'ALL' | 'ONLINE' | 'COD'

const MODES: { key: Mode; label: string }[] = [
  { key: 'ALL', label: 'All payments' },
  { key: 'ONLINE', label: 'Online' },
  { key: 'COD', label: 'Cash on delivery' },
]

export function StoreTransactionsPage() {
  const { store } = useManagedStore()
  const [params, setParams] = useSearchParams()
  const periodParam = params.get('period')
  const period: Period = PERIODS.some((p) => p.key === periodParam) ? (periodParam as Period) : 'month'
  const modeParam = params.get('mode')
  const mode: Mode = modeParam === 'ONLINE' || modeParam === 'COD' ? modeParam : 'ALL'

  const [search, setSearch] = useState('')
  const [q, setQ] = useState('') // debounced
  const [data, setData] = useState<SellerTransactions | null>(null)
  const [rows, setRows] = useState<SellerTransaction[] | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  // Out-of-order responses (fast typing, chip hopping) must never win.
  const requestSeq = useRef(0)

  useEffect(() => {
    const handle = setTimeout(() => setQ(search.trim()), 350)
    return () => clearTimeout(handle)
  }, [search])

  const query = (page: number): SellerTransactionsQuery => ({
    ...periodRange(period),
    mode: mode === 'ALL' ? undefined : mode,
    q: q || undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  useEffect(() => {
    const seq = ++requestSeq.current
    setData(null)
    setRows(null)
    setError(null)
    storeFinanceApi
      .transactions(store.id, query(1))
      .then((result) => {
        if (requestSeq.current !== seq) return
        setData(result)
        setRows(result.rows)
      })
      .catch((err: unknown) => {
        if (requestSeq.current === seq) setError(toApiError(err).message)
      })
    // `query` is rebuilt from these values each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.id, period, mode, q, reload])

  const loadMore = async () => {
    const meta = data?.meta
    if (!meta || meta.page >= meta.totalPages || loadingMore) return
    const seq = requestSeq.current
    setLoadingMore(true)
    try {
      const next = await storeFinanceApi.transactions(store.id, query(meta.page + 1))
      if (requestSeq.current !== seq) return
      setRows((prev) => [...(prev ?? []), ...next.rows])
      setData((prev) => (prev ? { ...prev, meta: next.meta } : next))
    } catch (err) {
      if (requestSeq.current === seq) setError(toApiError(err).message)
    } finally {
      if (requestSeq.current === seq) setLoadingMore(false)
    }
  }

  const setParam = (key: 'period' | 'mode', value: string | null) => {
    setParams(
      (prev) => {
        const copy = new URLSearchParams(prev)
        if (value === null) copy.delete(key)
        else copy.set(key, value)
        return copy
      },
      { replace: true },
    )
  }

  const filtered = q !== '' || mode !== 'ALL' || period !== 'all'
  const meta = data?.meta

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ReceiptIcon}
        title="Transactions"
        description="Every order's bill: how much, how the customer paid, and whether the money has reached you."
      />

      <ChipRow
        label="Time period"
        items={PERIODS}
        value={period}
        onChange={(key) => setParam('period', key === 'month' ? null : key)}
      />
      <ChipRow
        label="Payment mode"
        items={MODES}
        value={mode}
        onChange={(key) => setParam('mode', key === 'ALL' ? null : key)}
      />

      <label className="relative block">
        <span className="sr-only">Search transactions</span>
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order number or customer name"
          className="h-field w-full rounded-xl border border-line bg-input pr-4 pl-11 text-base text-fg outline-none placeholder:text-muted focus:border-accent"
        />
      </label>

      {error && (
        <div className="space-y-2">
          <ErrorNote>{error}</ErrorNote>
          <Button variant="secondary" size="sm" onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Total billed"
              value={money(data.summary.billed.amount)}
              hint={`${data.summary.billed.orders} ${data.summary.billed.orders === 1 ? 'order' : 'orders'}, not counting cancelled`}
            />
            <Tile label="Paid online" value={money(data.summary.online.amount)} hint={`${data.summary.online.orders} orders`} />
            <Tile label="Cash on delivery" value={money(data.summary.cod.amount)} hint={`${data.summary.cod.orders} orders`} />
            <Tile
              label="Sent to your bank"
              value={money(data.summary.paidToYou)}
              hint={
                Number(data.summary.onItsWay) > 0
                  ? `+ ${money(data.summary.onItsWay)} on its way`
                  : 'For the orders in this list'
              }
            />
          </div>
          <p className="text-sm text-muted">
            To see your full balance and what UnieMax pays you next, open{' '}
            <Link to="../earnings" className="font-medium text-brand hover:underline">
              Earnings
            </Link>
            .
          </p>
        </>
      )}

      {rows === null && !error && (
        <div aria-busy="true" aria-label="Loading transactions" className="space-y-2">
          {[0, 1, 2].map((key) => (
            <div key={key} className="ws-card h-[104px] animate-pulse rounded-2xl" />
          ))}
        </div>
      )}

      {rows !== null && rows.length === 0 && (
        <div className="ws-card rounded-lg">
          <EmptyState
            icon={ReceiptIcon}
            title={filtered ? 'No transactions here' : 'No transactions yet'}
            description={
              filtered
                ? 'Try another time period or payment mode, or search for a different order.'
                : 'Each order shows here with its bill and payment, the moment a customer places it.'
            }
          />
        </div>
      )}

      {rows !== null && rows.length > 0 && (
        <>
          <ul className="ws-card divide-y divide-line overflow-hidden rounded-lg">
            {rows.map((row) => (
              <li key={row.id}>
                <TransactionRow row={row} />
              </li>
            ))}
          </ul>

          {meta && meta.page < meta.totalPages && (
            <div className="flex justify-center">
              <Button variant="secondary" size="lg" className="w-full sm:w-auto" loading={loadingMore} onClick={() => void loadMore()}>
                {`Show more (${meta.total - rows.length} left)`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TransactionRow({ row }: { row: SellerTransaction }) {
  const status = settlementPill(row)
  return (
    <Link to={`../orders/${row.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-fg/3">
      <div className="min-w-0 flex-1 space-y-1">
        {/* Amount + status first: the two things a seller scans the list for. */}
        <div className="flex items-center justify-between gap-3">
          <p className="font-figure text-lg font-bold text-fg">{money(row.billAmount)}</p>
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </div>
        <p className="text-sm break-all text-fg">
          <span className="font-semibold">{row.orderNumber}</span>
          {row.customerName ? <span className="break-normal text-muted"> · {row.customerName}</span> : null}
        </p>
        <p className="text-sm text-muted">
          {moneyDay(row.placedAt)} · <span className="font-medium text-fg">{paymentModeLabel(row.paymentMethod)}</span>
        </p>
        {moneyCounts(row) && (
          <p className="font-figure text-sm text-muted">
            Fee {money(sellerFee(row))} · You get {money(row.youGet)}
          </p>
        )}
        <p className="text-sm text-muted">{settlementNote(row)}</p>
      </div>
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
    </Link>
  )
}

function ChipRow<K extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string
  items: { key: K; label: string }[]
  value: K
  onChange: (key: K) => void
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {items.map((item) => {
        const on = item.key === value
        return (
          <Button key={item.key} size="sm" variant={on ? 'primary' : 'secondary'} aria-pressed={on} onClick={() => onChange(item.key)}>
            {item.label}
          </Button>
        )
      })}
    </div>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 font-figure text-xl font-bold text-fg">{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </Card>
  )
}

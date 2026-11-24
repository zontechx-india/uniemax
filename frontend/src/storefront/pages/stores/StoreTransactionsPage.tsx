import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { Button } from '../../../shared/ui/Button'
import { fieldClass } from '../../../shared/ui/field'
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
  paymentModeShort,
  sellerFee,
  settlementPill,
  settlementShort,
  shortDay,
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
 * Dense, in the admin console's pattern (ADMIN_UI_THEME.md) at seller sizes
 * (DESIGN_GUIDELINES §18a): one filter bar, stat tiles, then a table on wide
 * screens and three-line rows on a phone. The full sentence for each status
 * lives on the order's Money card; rows carry a few words.
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

/** Short labels — they share one 44px switch on a phone. */
const MODES: { key: Mode; label: string; title: string }[] = [
  { key: 'ALL', label: 'All', title: 'All payments' },
  { key: 'ONLINE', label: 'Online', title: 'Paid online' },
  { key: 'COD', label: 'Cash', title: 'Cash on delivery and bills paid to you' },
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
  // Out-of-order responses (fast typing, filter hopping) must never win.
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
        description="Each order's bill, how it was paid, and whether the money has reached you."
      />

      {/* Filter bar — search, period, payment mode. One row from `sm`. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Search transactions</span>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number or customer"
            className={fieldClass({ dense: true, className: 'pl-9' })}
          />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <label className="block">
            <span className="sr-only">Time period</span>
            <select
              value={period}
              onChange={(e) => setParam('period', e.target.value === 'month' ? null : e.target.value)}
              className={fieldClass({ dense: true, className: 'sm:w-36' })}
            >
              {PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <ModeSwitch value={mode} onChange={(key) => setParam('mode', key === 'ALL' ? null : key)} />
        </div>
      </div>

      {error && (
        <div className="space-y-2">
          <ErrorNote>{error}</ErrorNote>
          <Button variant="secondary" size="sm" onClick={() => setReload((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}

      {data && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <Stat
              label="Total billed"
              value={money(data.summary.billed.amount)}
              sub={`${data.summary.billed.orders} ${data.summary.billed.orders === 1 ? 'order' : 'orders'}`}
            />
            <Stat label="Paid online" value={money(data.summary.online.amount)} sub={`${data.summary.online.orders} orders`} />
            <Stat label="Cash or paid to you" value={money(data.summary.cod.amount)} sub={`${data.summary.cod.orders} orders`} />
            <Stat
              label="Sent to your bank"
              value={money(data.summary.paidToYou)}
              sub={Number(data.summary.onItsWay) > 0 ? `+ ${money(data.summary.onItsWay)} on its way` : 'For these orders'}
            />
          </div>
          <p className="text-hint text-muted">
            Cancelled orders are not counted. Your full balance is on{' '}
            <Link to="../earnings" className="font-medium text-brand hover:underline">
              Earnings
            </Link>
          </p>
        </div>
      )}

      {rows === null && !error && (
        <div aria-busy="true" aria-label="Loading transactions" className="ws-card divide-y divide-line overflow-hidden rounded-lg">
          {[0, 1, 2, 3].map((key) => (
            <div key={key} className="h-[76px] animate-pulse bg-fg/3" />
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
          {/* Phone: three-line rows */}
          <ul className="ws-card divide-y divide-line overflow-hidden rounded-lg md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <TransactionRow row={row} />
              </li>
            ))}
          </ul>

          {/* Wider screens: a table */}
          <TransactionTable rows={rows} />

          {meta && meta.page < meta.totalPages && (
            <div className="flex justify-center">
              <Button variant="secondary" size="md" className="w-full sm:w-auto" loading={loadingMore} onClick={() => void loadMore()}>
                {`Show more (${meta.total - rows.length} left)`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** One order on a phone: who + amount, number · date · mode, status + a few words. */
function TransactionRow({ row }: { row: SellerTransaction }) {
  const status = settlementPill(row)
  const short = settlementShort(row)
  return (
    <Link to={`../orders/${row.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-fg/3">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-semibold text-fg">{row.customerName ?? row.orderNumber}</p>
          <p className="shrink-0 font-figure text-sm font-semibold tabular-nums text-fg">{money(row.billAmount)}</p>
        </div>
        <p className="mt-0.5 truncate text-hint text-muted">
          {row.customerName ? `${row.orderNumber} · ` : ''}
          {shortDay(row.placedAt)} · {paymentModeShort(row.paymentMethod)}
        </p>
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          {short && <span className="min-w-0 truncate text-hint text-muted">{short}</span>}
        </div>
      </div>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted" />
    </Link>
  )
}

function TransactionTable({ rows }: { rows: SellerTransaction[] }) {
  const navigate = useNavigate()
  const th = 'px-4 py-2.5 text-left text-hint font-medium whitespace-nowrap text-muted'
  return (
    <div className="ws-card hidden overflow-x-auto rounded-lg md:block">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-fg/3">
          <tr>
            <th className={th}>Order</th>
            <th className={th}>Placed</th>
            <th className={th}>Paid by</th>
            <th className={`${th} text-right`}>Bill</th>
            <th className={`${th} text-right`}>You get</th>
            <th className={th}>Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => {
            const status = settlementPill(row)
            const short = settlementShort(row)
            const counts = moneyCounts(row)
            return (
              <tr
                key={row.id}
                onClick={() => navigate(`../orders/${row.id}`)}
                className="cursor-pointer align-top transition-colors hover:bg-fg/3"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`../orders/${row.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-fg hover:underline"
                  >
                    {row.customerName ?? row.orderNumber}
                  </Link>
                  {row.customerName && <span className="block text-hint text-muted">{row.orderNumber}</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted">{moneyDay(row.placedAt)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-fg">{paymentModeLabel(row.paymentMethod)}</td>
                <td className="px-4 py-3 text-right font-figure font-medium whitespace-nowrap tabular-nums text-fg">
                  {money(row.billAmount)}
                </td>
                <td className="px-4 py-3 text-right font-figure whitespace-nowrap tabular-nums">
                  {counts ? (
                    <>
                      <span className="text-fg">{money(row.youGet)}</span>
                      <span className="block text-hint text-muted">Fee {money(sellerFee(row))}</span>
                    </>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusPill tone={status.tone}>{status.label}</StatusPill>
                  {short && <span className="mt-1 block max-w-64 text-hint text-muted">{short}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * All / Online / Cash — a segmented switch (ADMIN_UI_THEME §7.5 `segc`):
 * native radios, so arrow keys move between them. 44px tall for a thumb.
 */
function ModeSwitch({ value, onChange }: { value: Mode; onChange: (key: Mode) => void }) {
  const name = useId()
  return (
    <div role="radiogroup" aria-label="Payment mode" className="flex h-tap rounded-md border border-line bg-input p-1">
      {MODES.map((m) => {
        const on = m.key === value
        return (
          <label
            key={m.key}
            title={m.title}
            className={`flex flex-1 cursor-pointer items-center justify-center rounded-sm px-3 text-sm font-medium whitespace-nowrap transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
              on ? 'bg-brand-soft text-brand' : 'text-muted hover:text-fg'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={m.key}
              checked={on}
              onChange={() => onChange(m.key)}
              className="sr-only"
            />
            {m.label}
          </label>
        )
      })}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="ws-card rounded-lg px-3.5 py-3 sm:px-4">
      <p className="truncate text-hint font-medium text-muted">{label}</p>
      <p className="mt-1 font-figure text-lg font-semibold tabular-nums text-fg">{value}</p>
      <p className="mt-0.5 truncate text-hint text-muted">{sub}</p>
    </div>
  )
}

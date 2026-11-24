import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import type { ListMeta } from '../../../../shared/auth/http'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { ErrorNote } from '../../../../shared/ui/form'
import { billsApi } from '../../../features/bills/billsApi'
import type { Bill, BillListSummary, BillTab } from '../../../features/bills/billsApi'
import { useManagedStore } from '../../../features/stores/useManagedStore'
import { PlusIcon, ReceiptIcon } from '../../../layout/icons'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { BillStatus, rupees, spacedPhone } from './billUi'

/**
 * Bills — every bill the seller made for a phone / in-shop customer, newest
 * first, by tab (All · Waiting · Paid · Closed = expired or cancelled, deep-linkable
 * via ?tab=). A row opens the bill, where it is shared or followed.
 */

const PAGE_SIZE = 20
const TABS: { key: BillTab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'WAITING', label: 'Waiting' },
  { key: 'PAID', label: 'Paid' },
  { key: 'CLOSED', label: 'Closed' },
]
const isTab = (v: string | null): v is BillTab => TABS.some((t) => t.key === v)

const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return 'Yesterday'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function StoreBillsPage() {
  const { store } = useManagedStore()
  const [params] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: BillTab = isTab(tabParam) ? tabParam : 'ALL'
  const [bills, setBills] = useState<Bill[] | null>(null)
  const [meta, setMeta] = useState<ListMeta | null>(null)
  const [summary, setSummary] = useState<BillListSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const mine = ++seq.current
    setBills(null)
    setError(null)
    billsApi
      .list(store.id, { tab, page: 1, pageSize: PAGE_SIZE })
      .then((res) => {
        if (seq.current !== mine) return
        setBills(res.items)
        setMeta(res.meta)
        setSummary(res.summary)
      })
      .catch((err) => {
        if (seq.current === mine) setError(toApiError(err).message)
      })
  }, [store.id, tab])

  const loadMore = async () => {
    if (!meta || meta.page >= meta.totalPages || loadingMore) return
    const mine = seq.current
    setLoadingMore(true)
    try {
      const next = await billsApi.list(store.id, { tab, page: meta.page + 1, pageSize: PAGE_SIZE })
      if (seq.current !== mine) return
      setBills((prev) => [...(prev ?? []), ...next.items])
      setMeta(next.meta)
    } catch (err) {
      if (seq.current === mine) setError(toApiError(err).message)
    } finally {
      if (seq.current === mine) setLoadingMore(false)
    }
  }

  const create = (
    <Link to="new" className={buttonClass({ variant: 'ink', size: 'md' })}>
      <PlusIcon className="h-5 w-5" />
      Create a bill
    </Link>
  )
  const nothingYet = summary !== null && summary.tabs.ALL === 0
  const tabTo = (key: BillTab) => (key === 'ALL' ? '.' : `?tab=${key}`)

  return (
    <div className="ws-form space-y-4">
      <PageHeader icon={ReceiptIcon} title="Bills" description="For customers who order by phone or in your shop." action={nothingYet ? undefined : create} />
      {error && <ErrorNote>{error}</ErrorNote>}

      {nothingYet ? (
        <div className="ws-card rounded-lg">
          <EmptyState
            icon={ReceiptIcon}
            title="No bills yet"
            description="Make a bill from your products and send it on WhatsApp. It becomes an order when they pay."
            action={create}
          />
        </div>
      ) : (
        <>
          {summary && summary.waiting > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="ws-card rounded-lg px-4 py-3">
                <p className="text-sm text-muted">Waiting</p>
                <p className="mt-0.5 font-figure text-xl font-semibold tabular-nums text-fg">{rupees(summary.waitingTotal)}</p>
                <p className="text-sm text-muted">
                  {summary.waiting} bill{summary.waiting === 1 ? '' : 's'}
                </p>
              </div>
              <Link to="?tab=WAITING" replace className="ws-card rounded-lg px-4 py-3 transition-colors hover:bg-fg/5">
                <p className="text-sm text-muted">Not sent</p>
                <p className={`mt-0.5 font-figure text-xl font-semibold tabular-nums ${summary.notShared > 0 ? 'text-pending' : 'text-fg'}`}>{summary.notShared}</p>
                <p className="text-sm text-muted">{summary.notShared === 1 ? 'bill' : 'bills'}</p>
              </Link>
            </div>
          )}

          <section className="ws-card overflow-hidden rounded-lg">
            {/* Tabs: links (deep-linkable ?tab=), underlined when chosen; four short words fit a phone. */}
            <nav aria-label="Show bills" className="flex border-b border-line px-2 sm:px-3">
              {TABS.map((t) => {
                const on = tab === t.key
                const n = summary?.tabs[t.key] ?? 0
                return (
                  <Link
                    key={t.key}
                    to={tabTo(t.key)}
                    replace
                    aria-current={on ? 'page' : undefined}
                    className={`-mb-px flex min-h-12 items-center gap-1.5 border-b-2 px-2.5 text-sm font-semibold whitespace-nowrap transition-colors sm:px-3 ${
                      on ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg'
                    }`}
                  >
                    {t.label}
                    {t.key !== 'ALL' && n > 0 && <span className="font-figure text-xs font-medium tabular-nums text-muted">{n}</span>}
                  </Link>
                )
              })}
            </nav>

            {bills === null ? (
              <div aria-busy="true" className="divide-y divide-line">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="space-y-2 px-4 py-3.5 sm:px-5">
                    <div className="h-5 w-1/2 animate-pulse rounded bg-fg/6" />
                    <div className="h-4 w-1/3 animate-pulse rounded bg-fg/6" />
                  </div>
                ))}
              </div>
            ) : bills.length === 0 ? (
              <EmptyState icon={ReceiptIcon} title="No bills here" description="Try another tab." compact />
            ) : (
              <ul className="divide-y divide-line">
                {bills.map((bill) => (
                  <li key={bill.id}>
                    <Link to={bill.id} className="block px-4 py-3.5 transition-colors hover:bg-fg/5 sm:px-5">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-base font-medium text-fg">{bill.customerName ?? spacedPhone(bill.customerPhone)}</p>
                        <span className="shrink-0 font-figure text-base font-semibold tabular-nums text-fg">{rupees(bill.total)}</span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <BillStatus bill={bill} />
                        <span className="min-w-0 truncate text-sm text-muted">
                          {bill.itemCount} item{bill.itemCount === 1 ? '' : 's'} · {timeAgo(bill.createdAt)}
                        </span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {meta && meta.page < meta.totalPages && (
            <Button variant="secondary" size="lg" full loading={loadingMore} onClick={loadMore}>
              Show more
            </Button>
          )}
        </>
      )}
    </div>
  )
}

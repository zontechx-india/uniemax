import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import type { ListMeta } from '../../../../shared/auth/http'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { ErrorNote } from '../../../../shared/ui/form'
import { SegmentedControl } from '../../../../shared/ui/SegmentedControl'
import { billsApi, spacedNumber } from '../../../features/bills/billsApi'
import type { Bill, BillListSummary, BillTab } from '../../../features/bills/billsApi'
import { useManagedStore } from '../../../features/stores/useManagedStore'
import { ChevronRightIcon, ClockIcon, PlusIcon, ReceiptIcon } from '../../../layout/icons'
import { EmptyState } from '../ui/EmptyState'
import { PageHeader } from '../ui/PageHeader'
import { BILL_STAGE, BillStatePill, QuietTag, rupees } from './billUi'

/**
 * Bills — every bill the seller made for a phone / in-shop customer, newest
 * first, by tab (All · Waiting · Paid · Expired or cancelled, deep-linkable
 * via ?tab=). A row opens the bill, where it is shared or followed.
 */

const PAGE_SIZE = 20
const TABS: { key: BillTab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'WAITING', label: 'Waiting' },
  { key: 'PAID', label: 'Paid' },
  { key: 'CLOSED', label: 'Expired or cancelled' },
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
  const [params, setParams] = useSearchParams()
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
    <Link to="new" className={buttonClass({ variant: 'ink', size: 'lg' })}>
      <PlusIcon className="h-5 w-5" />
      Create a bill
    </Link>
  )
  const nothingYet = summary !== null && summary.tabs.ALL === 0

  return (
    <div className="ws-form space-y-4">
      <PageHeader
        icon={ReceiptIcon}
        title="Bills"
        description="For customers who order by phone or in your shop. Share the bill on WhatsApp — they see it and pay online."
        action={nothingYet ? undefined : create}
      />
      {error && <ErrorNote>{error}</ErrorNote>}

      {nothingYet ? (
        <div className="ws-card rounded-lg">
          <EmptyState
            icon={ReceiptIcon}
            title="No bills yet"
            description="A customer called or walked in? Make them a bill from your products and send it on WhatsApp. It becomes an order when they pay."
            action={create}
          />
        </div>
      ) : (
        <>
          {summary && summary.waiting > 0 && (
            <p className="flex items-center gap-2 text-sm text-fg">
              <ClockIcon className="h-4 w-4 shrink-0 text-muted" />
              <span>
                <span className="font-semibold">
                  {summary.waiting} bill{summary.waiting === 1 ? '' : 's'}
                </span>{' '}
                waiting · {rupees(summary.waitingTotal)}
                {summary.notShared > 0 && <span className="text-pending"> · {summary.notShared} not shared yet</span>}
              </span>
            </p>
          )}
          <div className="-mx-4 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0">
            <SegmentedControl
              label="Show bills"
              equal={false}
              value={tab}
              onChange={(next) =>
                setParams(
                  (prev) => {
                    const copy = new URLSearchParams(prev)
                    if (next === 'ALL') copy.delete('tab')
                    else copy.set('tab', next)
                    return copy
                  },
                  { replace: true },
                )
              }
              options={TABS.map((t) => ({
                value: t.key,
                label: (
                  <span className="flex items-center gap-1.5">
                    {t.label}
                    {summary && t.key !== 'ALL' && summary.tabs[t.key] > 0 && (
                      <span className="font-figure tabular-nums opacity-70">{summary.tabs[t.key]}</span>
                    )}
                  </span>
                ),
              }))}
            />
          </div>

          {bills === null ? (
            <div aria-busy="true" className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="ws-card h-[88px] animate-pulse rounded-lg" />
              ))}
            </div>
          ) : bills.length === 0 ? (
            <div className="ws-card rounded-lg">
              <EmptyState icon={ReceiptIcon} title="No bills here" description="Try another tab." compact />
            </div>
          ) : (
            <ul className="ws-card divide-y divide-line overflow-hidden rounded-lg">
              {bills.map((bill) => (
                <li key={bill.id}>
                  <Link to={bill.id} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-fg/5 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="min-w-0 truncate text-base font-medium text-fg">
                          {bill.customerName ?? bill.customerPhone}
                        </p>
                        <span className="shrink-0 font-figure text-base font-semibold tabular-nums text-fg">
                          {rupees(bill.total)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-muted">
                        {timeAgo(bill.createdAt)} · {bill.itemCount} item{bill.itemCount === 1 ? '' : 's'} ·{' '}
                        <span className="font-figure tabular-nums">{spacedNumber(bill.number)}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <BillStatePill state={bill.state} />
                        {bill.state === 'OPEN' && <QuietTag>{BILL_STAGE[bill.stage]}</QuietTag>}
                      </div>
                    </div>
                    <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
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

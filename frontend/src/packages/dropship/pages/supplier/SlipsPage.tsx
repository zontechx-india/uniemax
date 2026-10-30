import { Link, useSearchParams } from 'react-router-dom'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { ErrorState, PageSkeleton, EmptyState } from '../../../../shared/ui/states'
import { useManagedStore } from '../../../../storefront/features/stores/useManagedStore'
import { supplierOrdersApi } from '../../api'
import type { Slip } from '../../api'
import { money, useLoad } from '../../ui'

/**
 * Packing slips, one per sheet. *Sold by {seller}* leads — the customer
 * ordered from the seller — then *Shipped by {supplier}* with the return
 * address. Items carry the supplier's own code; there are no prices.
 * Cash on delivery is printed large so the courier can't miss it (F-14).
 */
export function SlipsPage() {
  const { store } = useManagedStore()
  const [params] = useSearchParams()
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean)
  const slips = useLoad(() => (ids.length ? supplierOrdersApi.slips(store.id, ids) : Promise.resolve([])), [store.id, params.toString()])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link to=".." relative="path" className={buttonClass({ variant: 'ghost', size: 'md' })}>
          Back to orders
        </Link>
        <Button size="md" disabled={!slips.data?.length} onClick={() => window.print()}>
          Print {slips.data && slips.data.length > 1 ? `${slips.data.length} slips` : 'slip'}
        </Button>
      </div>

      {slips.loading && !slips.data && <PageSkeleton label="Loading slips" />}
      {slips.error && <ErrorState message={slips.error} onRetry={slips.reload} />}
      {slips.data && slips.data.length === 0 && (
        <EmptyState title="No slips to print" description="Open Orders to ship and choose Print slip on an order." />
      )}

      {slips.data?.map((s) => <SlipSheet key={s.id} slip={s} />)}
    </div>
  )
}

function SlipSheet({ slip: s }: { slip: Slip }) {
  const d = s.delivery
  return (
    <article className="break-after-page rounded-lg border border-line bg-white p-5 text-black print:break-after-page print:rounded-none print:border-0 print:p-0">
      <header className="flex items-start justify-between gap-4 border-b border-black/20 pb-3">
        <div className="flex items-center gap-3">
          {s.soldBy.logoUrl && (
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded">
              <MediaImg src={s.soldBy.logoUrl} sizes="48px" alt="" className="h-full w-full object-cover" />
            </span>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide opacity-60">Sold by</p>
            <p className="text-lg font-bold">{s.soldBy.name}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide opacity-60">Order</p>
          <p className="text-lg font-bold">#{s.orderNumber}</p>
        </div>
      </header>

      <p className={`mt-4 border-2 border-black px-3 py-2 text-center text-2xl font-extrabold ${s.paymentMode === 'COD' ? '' : 'font-semibold'}`}>
        {s.paymentMode === 'COD' && s.collectAmount != null ? `COD ${money(s.collectAmount)}` : 'Prepaid'}
      </p>

      <section className="mt-4">
        <p className="text-xs uppercase tracking-wide opacity-60">Deliver to</p>
        <p className="text-base font-semibold">{d.name}</p>
        <p className="text-base">{[d.address, d.state, d.pincode].filter(Boolean).join(', ')}</p>
        {d.notes.length > 0 && (
          <p className="text-base">{d.notes.map((n) => `${n.label}: ${n.value}`).join(' · ')}</p>
        )}
        {d.phone && <p className="text-base">Phone {d.phone}</p>}
      </section>

      <table className="mt-4 w-full text-left text-base">
        <thead>
          <tr className="border-b border-black/20 text-xs uppercase tracking-wide opacity-60">
            <th className="py-1 font-medium">Item</th>
            <th className="py-1 font-medium">Code</th>
            <th className="py-1 text-right font-medium">Qty</th>
          </tr>
        </thead>
        <tbody>
          {s.items.map((i, n) => (
            <tr key={n} className="border-b border-black/10">
              <td className="py-1.5">
                {i.productName}
                {i.variantName ? ` — ${i.variantName}` : ''}
              </td>
              <td className="py-1.5">{i.sku ?? '—'}</td>
              <td className="py-1.5 text-right font-semibold">{i.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="mt-5 border-t border-black/20 pt-3 text-sm">
        <p>
          <span className="opacity-60">Shipped by </span>
          <span className="font-semibold">{s.shippedBy.name}</span>
          {s.shippedBy.phone ? ` · ${s.shippedBy.phone}` : ''}
        </p>
        {s.shippedBy.returnAddress && (
          <p>
            <span className="opacity-60">Return address: </span>
            {s.shippedBy.returnAddress}
          </p>
        )}
      </footer>
    </article>
  )
}

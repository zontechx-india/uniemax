import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../../../shared/ui/Badge'
import { Button } from '../../../../shared/ui/Button'
import { Select } from '../../../../shared/ui/form'
import { EmptyState, ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { useManagedStore } from '../../../../storefront/features/stores/useManagedStore'
import { TruckIcon } from '../../../../storefront/layout/icons'
import { PageHeader, showToast } from '../../../../storefront/pages/stores/ui'
import { sellerPartsApi } from '../../api'
import type { ShipmentState } from '../../api'
import { OrderStatusBadge, dateTime, shipByText, useLoad } from '../../ui'

const FILTERS: { key: ShipmentState | ''; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'in_transit', label: 'In transit' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'came_back', label: 'Came back' },
  { key: 'late', label: 'Late' },
]

/**
 * Every parcel your suppliers ship for you: the order, the supplier, the
 * courier and tracking number (tap to copy), and where it is. Filters match
 * what you'd ask: what's on its way, what arrived, what came back, what's late.
 */
export function ShipmentsPage() {
  const { store } = useManagedStore()
  const [state, setState] = useState<ShipmentState | ''>('')
  const [supplierId, setSupplierId] = useState('')
  const [page, setPage] = useState(1)
  const list = useLoad(
    () => sellerPartsApi.shipments(store.id, { page, ...(state ? { state } : {}), ...(supplierId ? { supplierId } : {}) }),
    [store.id, state, supplierId, page],
  )
  const data = list.data

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Tracking number copied')
    } catch {
      showToast('Could not copy — select it and copy by hand', 'danger')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={TruckIcon}
        title="Shipments"
        description="Parcels your suppliers ship to your customers, and where each one is."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <Button
              key={f.key || 'all'}
              size="sm"
              variant={state === f.key ? 'primary' : 'secondary'}
              aria-pressed={state === f.key}
              onClick={() => {
                setState(f.key)
                setPage(1)
              }}
            >
              {f.label}
            </Button>
          ))}
        </div>
        {data && data.suppliers.length > 1 && (
          <Select
            className="h-tap"
            containerClassName="w-48 sm:ml-auto"
            value={supplierId}
            onChange={(e) => {
              setSupplierId(e.target.value)
              setPage(1)
            }}
            aria-label="Supplier"
          >
            <option value="">All suppliers</option>
            {data.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
      </div>

      {list.loading && !data && <PageSkeleton label="Loading shipments" />}
      {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
      {data && data.items.length === 0 && (
        <EmptyState
          icon={TruckIcon}
          title={state ? 'Nothing here' : 'No shipments yet'}
          description={
            state
              ? 'No parcels match this filter.'
              : 'When a supplier ships an order for you, the parcel shows up here with its tracking number.'
          }
        />
      )}

      {data && data.items.length > 0 && (
        <ul className="space-y-3">
          {data.items.map((s) => (
            <li key={s.id} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`../orders/${s.orderId}`} className="text-sm font-semibold text-brand underline">
                  Order #{s.orderNumber}
                </Link>
                <OrderStatusBadge status={s.status} side="seller" />
                {s.late && <Badge tone="danger">{shipByText(s.shipBy, true)}</Badge>}
                <span className="ml-auto text-xs text-muted">{s.supplier}</span>
              </div>
              {s.parcel ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-fg">
                  <span>{s.parcel.carrier}</span>
                  {s.parcel.trackingNumber && (
                    <Button size="sm" variant="ghost" onClick={() => copy(s.parcel!.trackingNumber!)}>
                      {s.parcel.trackingNumber} · Copy
                    </Button>
                  )}
                  {s.parcel.trackingUrl && (
                    <a href={s.parcel.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand underline">
                      Track
                    </a>
                  )}
                  <span className="text-xs text-muted">
                    Shipped {dateTime(s.parcel.shippedAt)}
                    {s.parcel.deliveredAt ? ` · delivered ${dateTime(s.parcel.deliveredAt)}` : ''}
                    {s.parcel.returnedAt ? ` · came back ${dateTime(s.parcel.returnedAt)}` : ''}
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted">Not shipped yet.{s.shipBy ? ` ${shipByText(s.shipBy, s.late)}.` : ''}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            Page {data.meta.page} of {data.meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

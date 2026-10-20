import { copyToClipboard } from '../../../../shared/share'
import { Badge } from '../../../../shared/ui/Badge'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { parcelStatus } from '../../../features/stores/ParcelTracking'
import type { OrderShipment, PlacedOrder } from '../../../features/stores/storesApi'
import { ClipboardIcon, ExternalLinkIcon, PencilIcon, TruckIcon } from '../../../layout/icons'
import { formatOrderDateTime } from '../orderMeta'
import { GlassCard } from '../ui/GlassCard'
import { showToast } from '../ui/Toast'

/**
 * The seller's view of an order's parcels: courier, tracking number (copy),
 * where the customer follows it, when it went and what happened — and the
 * proof-of-delivery photo, which only the seller and support see. "Edit
 * tracking" while a parcel is on its way. An order sent before parcels
 * existed gets "Add tracking" instead.
 */
export function ParcelCard({
  order,
  onEdit,
  onAddTracking,
}: {
  order: PlacedOrder
  onEdit: (parcel: OrderShipment) => void
  onAddTracking: () => void
}) {
  const parcels = order.shipments

  if (parcels.length === 0) {
    return (
      <GlassCard icon={TruckIcon} title="Tracking">
        <p className="text-base text-muted">
          No courier or tracking number was added when this order was sent.
        </p>
        <Button type="button" variant="secondary" size="md" className="mt-3" onClick={onAddTracking}>
          Add tracking
        </Button>
      </GlassCard>
    )
  }

  return (
    <GlassCard icon={TruckIcon} title={parcels.length === 1 ? 'Parcel' : `Parcels (${parcels.length})`}>
      <ul className="divide-y divide-line">
        {parcels.map((parcel, i) => (
          <SellerParcel
            key={parcel.id}
            parcel={parcel}
            label={parcels.length > 1 ? `Parcel ${i + 1} of ${parcels.length}` : null}
            onEdit={() => onEdit(parcel)}
          />
        ))}
      </ul>
    </GlassCard>
  )
}

function SellerParcel({
  parcel,
  label,
  onEdit,
}: {
  parcel: OrderShipment
  label: string | null
  onEdit: () => void
}) {
  // The seller's word for a returned parcel is "Came back" (the customer's
  // is "Returned to the store").
  const status = parcel.returnedAt
    ? { label: 'Came back', tone: 'warning' as const }
    : parcelStatus(parcel)
  const onTheWay = !parcel.deliveredAt && !parcel.returnedAt
  const followAt = parcel.trackingUrl ?? (parcel.trackingNumber ? parcel.courierSite : null)

  const copy = async (value: string) => {
    try {
      await copyToClipboard(value)
      showToast('Tracking number copied')
    } catch {
      showToast('Could not copy — hold the number to copy it', 'danger')
    }
  }

  return (
    <li className="space-y-2.5 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-base font-semibold text-fg">
          {parcel.carrier}
          {label && <span className="ml-1.5 text-hint font-normal text-muted">· {label}</span>}
        </p>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </div>
      {parcel.senderName && (
        <p className="text-hint text-muted">Shipped by {parcel.senderName}</p>
      )}

      {parcel.trackingNumber ? (
        <div className="flex items-center justify-between gap-3 rounded-md bg-fg/5 py-2 pr-1 pl-3">
          <div className="min-w-0">
            <p className="text-hint text-muted">Tracking number</p>
            <p className="truncate font-figure text-base font-semibold text-fg">
              {parcel.trackingNumber}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void copy(parcel.trackingNumber!)}
            aria-label={`Copy tracking number ${parcel.trackingNumber}`}
          >
            <ClipboardIcon className="h-4 w-4" />
            Copy
          </Button>
        </div>
      ) : (
        parcel.carrierCode !== 'self' && (
          <p className="text-hint text-muted">
            No tracking number — your customer can&apos;t follow this parcel.
          </p>
        )
      )}

      <p className="text-hint text-muted">
        Sent {formatOrderDateTime(parcel.shippedAt)}
        {parcel.deliveredAt && <> · delivered {formatOrderDateTime(parcel.deliveredAt)}</>}
        {parcel.returnedAt && <> · came back {formatOrderDateTime(parcel.returnedAt)}</>}
      </p>

      {parcel.podUrl && (
        <a
          href={parcel.podUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md border border-line p-2 transition hover:bg-fg/5"
        >
          <MediaImg
            src={parcel.podUrl}
            sizes="64px"
            alt="Proof of delivery"
            loading="lazy"
            decoding="async"
            className="h-16 w-16 shrink-0 rounded-md object-cover"
          />
          <span className="text-sm font-semibold text-fg">Proof of delivery</span>
        </a>
      )}

      {(followAt || onTheWay) && (
        <div className="flex flex-wrap gap-2">
          {followAt && (
            <a
              href={followAt}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              {parcel.trackingUrl ? 'Track' : `Open ${parcel.carrier}`}
              <ExternalLinkIcon className="h-4 w-4" />
            </a>
          )}
          {onTheWay && (
            <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
              <PencilIcon className="h-4 w-4" />
              Edit tracking
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

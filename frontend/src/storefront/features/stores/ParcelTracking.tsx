import { useEffect, useState } from 'react'
import { copyToClipboard } from '../../../shared/share'
import { Badge } from '../../../shared/ui/Badge'
import type { BadgeTone } from '../../../shared/ui/Badge'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { ClipboardIcon, ExternalLinkIcon, TruckIcon } from '../../layout/icons'
import type { OrderShipment } from './storesApi'

/**
 * A customer's view of an order's parcels — courier, the tracking number to
 * copy, and where to follow it: the link the seller pasted, otherwise the
 * courier's own website (copy the number, paste it there). Never the proof
 * of delivery (the seller's). On someone else's view of the order link the
 * number is withheld by the server (`redacted`).
 */

const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' })

/** Status words + badge tone for one parcel. */
export function parcelStatus(parcel: OrderShipment): { label: string; tone: BadgeTone } {
  if (parcel.deliveredAt) {
    return { label: `Delivered ${dateFormat.format(new Date(parcel.deliveredAt))}`, tone: 'success' }
  }
  if (parcel.returnedAt) return { label: 'Returned to the store', tone: 'warning' }
  return { label: `On the way · sent ${dateFormat.format(new Date(parcel.shippedAt))}`, tone: 'info' }
}

/** "Copy" that says "Copied" for a moment — no toast needed on the storefront. */
function CopyNumber({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        copyToClipboard(value)
          .then(() => setCopied(true))
          .catch(() => setCopied(false))
      }}
      aria-label={`Copy tracking number ${value}`}
    >
      <ClipboardIcon className="h-4 w-4" />
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

function ParcelBlock({
  parcel,
  label,
  redacted,
}: {
  parcel: OrderShipment
  label: string | null
  redacted: boolean
}) {
  const status = parcelStatus(parcel)
  const own = parcel.carrierCode === 'self'
  const number = parcel.trackingNumber

  return (
    <li className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-base font-semibold text-fg">
          <TruckIcon className="h-5 w-5 shrink-0 text-muted" />
          <span className="truncate">{parcel.carrier}</span>
        </p>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
      </div>
      {(label || parcel.senderName) && (
        <p className="mt-1 text-sm text-muted">
          {[label, parcel.senderName ? `Shipped by ${parcel.senderName}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {own ? (
        <p className="mt-2 text-sm text-muted">The store is delivering this order themselves.</p>
      ) : number ? (
        <>
          <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-fg/5 py-2 pr-1 pl-3">
            <div className="min-w-0">
              <p className="text-xs text-muted">Tracking number</p>
              <p className="truncate font-figure text-base font-semibold text-fg">{number}</p>
            </div>
            <CopyNumber value={number} />
          </div>
          {parcel.trackingUrl ? (
            <a
              href={parcel.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: 'secondary', size: 'md', full: true, className: 'mt-3' })}
            >
              Track parcel
              <ExternalLinkIcon className="h-4 w-4" />
            </a>
          ) : parcel.courierSite ? (
            <>
              <a
                href={parcel.courierSite}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({ variant: 'secondary', size: 'md', full: true, className: 'mt-3' })}
              >
                Open the {parcel.carrier} website
                <ExternalLinkIcon className="h-4 w-4" />
              </a>
              <p className="mt-1.5 text-xs text-muted">
                Copy the tracking number, then paste it on their website.
              </p>
            </>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted">
          {redacted
            ? 'Sign in as the buyer to see the tracking number.'
            : 'The store has not added a tracking number.'}
        </p>
      )}
    </li>
  )
}

/** Every parcel of an order, oldest first — the customer's order page. */
export function ParcelTracking({
  shipments,
  redacted = false,
}: {
  shipments: OrderShipment[]
  redacted?: boolean
}) {
  return (
    <ul className="space-y-3">
      {shipments.map((parcel, i) => (
        <ParcelBlock
          key={parcel.id}
          parcel={parcel}
          label={shipments.length > 1 ? `Parcel ${i + 1} of ${shipments.length}` : null}
          redacted={redacted}
        />
      ))}
    </ul>
  )
}

/** One line per parcel — "Delhivery · 2123… · Track" — for an order card. */
export function ParcelLine({ parcel }: { parcel: OrderShipment }) {
  const href = parcel.trackingUrl ?? (parcel.trackingNumber ? parcel.courierSite : null)
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
      <TruckIcon className="h-4 w-4 shrink-0" />
      <span className="font-semibold text-fg">{parcel.carrier}</span>
      {parcel.trackingNumber && (
        <>
          · <span className="font-figure text-fg">{parcel.trackingNumber}</span>
        </>
      )}
      {href && (
        <>
          ·{' '}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-accent underline-offset-2 hover:underline"
          >
            Track
          </a>
        </>
      )}
    </p>
  )
}

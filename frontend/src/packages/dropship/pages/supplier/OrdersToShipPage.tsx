import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../../shared/auth/http'
import { MediaImg } from '../../../../shared/media/MediaImg'
import { Badge } from '../../../../shared/ui/Badge'
import { Button, buttonClass } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { ErrorNote, InfoNote, TextField } from '../../../../shared/ui/form'
import { EmptyState, ErrorState, PageSkeleton } from '../../../../shared/ui/states'
import { BankPrompt } from '../BankPrompt'
import { useManagedStore } from '../../../../storefront/features/stores/useManagedStore'
import type { OrderShipment } from '../../../../storefront/features/stores/storesApi'
import { BagIcon, BoxIcon, TruckIcon } from '../../../../storefront/layout/icons'
import { DeliveredDialog } from '../../../../storefront/pages/stores/orders/DeliveredDialog'
import type { PickedPhoto } from '../../../../storefront/pages/stores/orders/DeliveredDialog'
import { ShipDialog } from '../../../../storefront/pages/stores/orders/ShipDialog'
import { PageHeader, showToast } from '../../../../storefront/pages/stores/ui'
import { supplierOrdersApi } from '../../api'
import type { CantShipReason, SupplierOrder, SupplierTab, TrackingBody } from '../../api'
import { OrderStatusBadge, dateTime, money, shipByText, shortDate, useLoad } from '../../ui'

const TABS: { key: SupplierTab; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'done', label: 'Done' },
]

const REASONS: { key: CantShipReason; label: string }[] = [
  { key: 'OUT_OF_STOCK', label: 'Out of stock' },
  { key: 'DAMAGED', label: 'Damaged' },
  { key: 'PINCODE', label: "Can't deliver to this pincode" },
  { key: 'OTHER', label: 'Other' },
]

type Acting =
  | { kind: 'ship' | 'tracking' | 'delivered' | 'cantShip' | 'cameBack'; order: SupplierOrder }
  | null

/**
 * The supplier's Orders to ship: what to pack, when, and how much cash to
 * collect, sorted by "Ship by". Confirm is one optional tap; Ship needs the
 * courier and tracking number — the customer gets them at once.
 */
export function OrdersToShipPage() {
  const { store } = useManagedStore()
  const [tab, setTab] = useState<SupplierTab>('new')
  const inbox = useLoad(() => supplierOrdersApi.inbox(store.id, tab), [store.id, tab])
  const [acting, setActing] = useState<Acting>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const data = inbox.data

  const done = (message: string) => {
    setActing(null)
    showToast(message)
    inbox.reload()
  }

  const confirm = async (order: SupplierOrder) => {
    setBusyId(order.id)
    try {
      await supplierOrdersApi.confirm(store.id, order.id)
      done(`Order #${order.orderNumber} confirmed`)
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
      inbox.reload()
    } finally {
      setBusyId(null)
    }
  }

  const slipIds = (data?.items ?? []).filter((o) => o.status === 'NEW' || o.status === 'ACCEPTED').map((o) => o.id)

  return (
    <div className="space-y-5">
      <PageHeader
        icon={TruckIcon}
        title="Orders to ship"
        description="Orders your sellers' customers placed. Pack them, ship with a tracking number, and the customer is told straight away."
        action={
          tab === 'new' && slipIds.length > 0 ? (
            <Link to={`slips?ids=${slipIds.join(',')}`} className={buttonClass({ variant: 'secondary', size: 'md' })}>
              Print all slips
            </Link>
          ) : undefined
        }
      />

      <BankPrompt audience="supplier" />

      <div className="flex gap-2" role="group" aria-label="Show">
        {TABS.map((t) => {
          const count = data ? (t.key === 'new' ? data.counts.new : t.key === 'shipped' ? data.counts.shipped : 0) : 0
          return (
            <Button
              key={t.key}
              size="sm"
              variant={tab === t.key ? 'primary' : 'secondary'}
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {count > 0 && <span className="ml-1.5 opacity-85">{count}</span>}
            </Button>
          )
        })}
      </div>

      {inbox.loading && !data && <PageSkeleton label="Loading orders" />}
      {inbox.error && <ErrorState message={inbox.error} onRetry={inbox.reload} />}
      {data && data.items.length === 0 && (
        <EmptyState
          icon={BagIcon}
          title={tab === 'new' ? 'Nothing to ship right now' : tab === 'shipped' ? 'Nothing on its way' : 'Nothing finished yet'}
          description={
            tab === 'new'
              ? 'When a customer orders one of your products from a seller, it shows up here.'
              : 'Orders move here as you ship and finish them.'
          }
        />
      )}

      {data && data.items.length > 0 && (
        <ul className="space-y-3">
          {data.items.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              busy={busyId === o.id}
              onConfirm={() => confirm(o)}
              onAct={(kind) => setActing({ kind, order: o })}
            />
          ))}
        </ul>
      )}

      {acting && (acting.kind === 'ship' || acting.kind === 'tracking') && (
        <TrackingSheet
          storeId={store.id}
          order={acting.order}
          editing={acting.kind === 'tracking'}
          onClose={() => setActing(null)}
          onDone={() => done(acting.kind === 'ship' ? 'Shipped — your customer has the tracking' : 'Tracking updated')}
        />
      )}
      {acting?.kind === 'cantShip' && (
        <CantShipSheet storeId={store.id} order={acting.order} onClose={() => setActing(null)} onDone={() => done("Marked as can't ship")} />
      )}
      {acting?.kind === 'cameBack' && (
        <CameBackSheet storeId={store.id} order={acting.order} onClose={() => setActing(null)} onDone={() => done('Marked as came back')} />
      )}
      {acting?.kind === 'delivered' && (
        <DeliveredSheet storeId={store.id} order={acting.order} onClose={() => setActing(null)} onDone={() => done('Marked as delivered')} />
      )}
    </div>
  )
}

function OrderCard({
  order: o,
  busy,
  onConfirm,
  onAct,
}: {
  order: SupplierOrder
  busy: boolean
  onConfirm: () => void
  onAct: (kind: 'ship' | 'tracking' | 'delivered' | 'cantShip' | 'cameBack') => void
}) {
  const toShip = o.status === 'NEW' || o.status === 'ACCEPTED'
  const by = shipByText(o.shipBy, o.late)
  const d = o.delivery
  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-fg">Order #{o.orderNumber}</span>
        <OrderStatusBadge status={o.status} side="supplier" />
        {toShip && by && <Badge tone={o.late ? 'danger' : 'neutral'}>{by}</Badge>}
        <span className="ml-auto text-xs text-muted">{dateTime(o.createdAt)}</span>
      </div>

      {/* The one thing the courier must know: cash or not. */}
      <p
        className={`mt-3 rounded-md px-3 py-2 text-base font-semibold ${
          o.paymentMode === 'COD' ? 'bg-pending-soft text-pending' : 'bg-surface-alt text-fg'
        }`}
      >
        {o.paymentMode === 'COD' && o.collectAmount != null
          ? `Collect ${money(o.collectAmount)} cash`
          : "Prepaid — don't collect cash"}
      </p>

      {o.paidBy === 'UNIEMAX' && (
        <p className="mt-2 text-sm text-fg">
          You get {money(o.amounts.supplierShare)} from UnieMax
          {o.split?.payoutOn ? ` — it reaches your bank on ${shortDate(o.split.payoutOn)}` : ', once the order is paid out'}.
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {o.items.map((i) => (
          <li key={i.id} className="flex items-center gap-3">
            <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-surface-alt text-muted">
              {i.imageUrl ? (
                <MediaImg src={i.imageUrl} sizes="48px" alt="" className="h-full w-full object-cover" />
              ) : (
                <BoxIcon className="m-3 h-6 w-6" />
              )}
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-medium text-fg">
                {i.quantity} × {i.productName}
              </p>
              <p className="text-xs text-muted">
                {i.variantName ?? ''}
                {i.variantName && i.sku ? ' · ' : ''}
                {i.sku ? `Your code ${i.sku}` : ''}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <dl className="mt-3 space-y-1 text-sm">
        {d ? (
          <div>
            <dt className="text-xs text-muted">Deliver to</dt>
            <dd className="text-fg">
              {[d.name, d.phone].filter(Boolean).join(' · ')}
              <br />
              {[d.address, d.state, d.pincode].filter(Boolean).join(', ')}
            </dd>
          </div>
        ) : (
          <p className="text-xs text-muted">The customer's details are hidden once an order has been closed for a while.</p>
        )}
        {o.seller && (
          <div>
            <dt className="text-xs text-muted">Sold by</dt>
            <dd className="text-fg">{[o.seller.name, o.seller.phone].filter(Boolean).join(' · ')}</dd>
          </div>
        )}
        {o.parcel && (
          <div>
            <dt className="text-xs text-muted">Parcel</dt>
            <dd className="text-fg">{[o.parcel.carrier, o.parcel.trackingNumber].filter(Boolean).join(' · ')}</dd>
          </div>
        )}
        {o.closeReason && (
          <div>
            <dt className="text-xs text-muted">Why</dt>
            <dd className="text-fg">{o.closeReason}</dd>
          </div>
        )}
      </dl>
      <p className="mt-2 text-xs text-muted">Terms for this order: {o.terms}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {toShip && (
          <>
            <Button size="sm" onClick={() => onAct('ship')}>
              Ship
            </Button>
            {o.status === 'NEW' && (
              <Button size="sm" variant="secondary" loading={busy} onClick={onConfirm}>
                Confirm
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onAct('cantShip')}>
              Can't ship
            </Button>
            <Link to={`slips?ids=${o.id}`} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
              Print slip
            </Link>
          </>
        )}
        {o.status === 'SHIPPED' && (
          <>
            <Button size="sm" onClick={() => onAct('delivered')}>
              Delivered
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onAct('cameBack')}>
              Came back
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAct('tracking')}>
              Edit tracking
            </Button>
            <Link to={`slips?ids=${o.id}`} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
              Print slip
            </Link>
          </>
        )}
      </div>
    </li>
  )
}

/** Ship, or correct the tracking: the courier sheet the seller's own parcels use. */
function TrackingSheet({
  storeId,
  order,
  editing,
  onClose,
  onDone,
}: {
  storeId: string
  order: SupplierOrder
  editing: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The sheet pre-fills from a core parcel shape; ours carries the same fields.
  const parcel = editing && order.parcel ? ({ ...order.parcel } as unknown as OrderShipment) : null

  const submit = async (input: { carrierCode: string; carrierName?: string | null; trackingNumber?: string | null; trackingUrl?: string | null }) => {
    setBusy(true)
    setError(null)
    const body: TrackingBody = {
      carrierCode: input.carrierCode,
      carrierName: input.carrierName ?? null,
      trackingNumber: input.trackingNumber ?? '',
      trackingUrl: input.trackingUrl ?? null,
    }
    try {
      if (editing) await supplierOrdersApi.editTracking(storeId, order.id, body)
      else await supplierOrdersApi.ship(storeId, order.id, body)
      onDone()
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <ShipDialog
      open
      title={editing ? 'Edit tracking' : `Ship order #${order.orderNumber}`}
      submitLabel={editing ? 'Save tracking' : 'Mark as shipped'}
      parcel={parcel}
      requireTracking
      busy={busy}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    />
  )
}

function CantShipSheet({ storeId, order, onClose, onDone }: { storeId: string; order: SupplierOrder; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<CantShipReason | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!reason) {
      setError('Choose why you can’t ship it')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await supplierOrdersApi.cantShip(storeId, order.id, reason, note.trim() || null)
      onDone()
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title={`Can't ship order #${order.orderNumber}?`}
      subtitle="The stock goes back, and the seller is told. If it's only this seller's order, it is cancelled and the customer is refunded."
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Go back
          </Button>
          <Button variant="danger" loading={busy} onClick={submit}>
            Can't ship this order
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Why">
          {REASONS.map((r) => (
            <Button key={r.key} size="sm" variant={reason === r.key ? 'primary' : 'secondary'} aria-pressed={reason === r.key} onClick={() => setReason(r.key)}>
              {r.label}
            </Button>
          ))}
        </div>
        <TextField label="More detail (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Dialog>
  )
}

function CameBackSheet({ storeId, order, onClose, onDone }: { storeId: string; order: SupplierOrder; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const choose = async (restock: boolean) => {
    setBusy(restock)
    setError(null)
    try {
      await supplierOrdersApi.cameBack(storeId, order.id, restock)
      onDone()
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(null)
    }
  }

  return (
    <Dialog open title="Put the stock back?" subtitle={`The parcel for order #${order.orderNumber} came back to you.`} onClose={() => busy === null && onClose()}>
      <div className="space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        <InfoNote>Choose “Don't put back” if the items are damaged. The order is cancelled and the customer refunded either way.</InfoNote>
        <Button full loading={busy === true} disabled={busy === false} onClick={() => choose(true)}>
          Yes, put the stock back
        </Button>
        <Button full variant="secondary" loading={busy === false} disabled={busy === true} onClick={() => choose(false)}>
          Don't put back
        </Button>
      </div>
    </Dialog>
  )
}

function DeliveredSheet({ storeId, order, onClose, onDone }: { storeId: string; order: SupplierOrder; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (photo: PickedPhoto | null) => {
    setBusy(true)
    setError(null)
    try {
      await supplierOrdersApi.delivered(storeId, order.id, photo, setProgress)
      onDone()
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <DeliveredDialog open cod={order.paymentMode === 'COD'} busy={busy} progress={progress} error={error} onSubmit={submit} onClose={() => !busy && onClose()} />
  )
}

import { useCallback, useEffect, useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { ConfirmDialog } from '../../../../shared/ui/ConfirmDialog'
import { Dialog } from '../../../../shared/ui/Dialog'
import { ErrorNote, InfoNote } from '../../../../shared/ui/form'
import { TruckIcon } from '../../../../storefront/layout/icons'
import { GlassCard, showToast } from '../../../../storefront/pages/stores/ui'
import { sellerPartsApi } from '../../api'
import type { SellerPart, SellerParts } from '../../api'
import { OrderStatusBadge, dateTime, money, shipByText } from '../../ui'

/**
 * On the seller's order page, one block per supplier that ships part of the
 * order: its status, the parcel the customer is following, what you earn, and
 * the two things a seller may do — mark it delivered when the customer says it
 * arrived, and report a problem. When a part failed on an order that also has
 * the seller's own items, it asks in place whether to cancel the whole order
 * (partial cancel comes later).
 */
export function SupplierParts({
  storeId,
  orderId,
  onCancelOrder,
  onChanged,
}: {
  storeId: string
  orderId: string
  /** Opens the order page's own cancel dialog — cancelling stays core's action. */
  onCancelOrder: () => void
  /** The order changed (delivered) — reload it. */
  onChanged: () => void
}) {
  const [data, setData] = useState<SellerParts | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [delivering, setDelivering] = useState<SellerPart | null>(null)
  const [reporting, setReporting] = useState<SellerPart | null>(null)
  const [busy, setBusy] = useState(false)
  // "Not now" hides the prompt for this visit; it comes back on the next load.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const load = useCallback(() => {
    sellerPartsApi
      .parts(storeId, orderId)
      .then((d) => {
        setData(d)
        setError(null)
      })
      .catch((err) => setError(toApiError(err).message))
  }, [storeId, orderId])
  useEffect(load, [load])

  if (error) return <ErrorNote>{error}</ErrorNote>
  if (!data || data.parts.length === 0) return null

  const markDelivered = async () => {
    if (!delivering) return
    setBusy(true)
    try {
      setData(await sellerPartsApi.delivered(storeId, orderId, delivering.id))
      setDelivering(null)
      showToast('Marked as delivered')
      onChanged()
    } catch (err) {
      showToast(toApiError(err).message, 'danger')
      setDelivering(null)
      load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <GlassCard icon={TruckIcon} title="Shipped by supplier">
        <ul className="space-y-4">
          {data.parts.map((p) => (
            <li key={p.id} className="space-y-3 rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-fg">{p.supplier.name}</span>
                <OrderStatusBadge status={p.status} side="seller" />
                {p.late && <span className="text-xs font-semibold text-danger">{shipByText(p.shipBy, true)}</span>}
                {p.supplier.phone && (
                  <a href={`tel:${p.supplier.phone}`} className="ml-auto text-sm font-semibold text-brand underline">
                    {p.supplier.phone}
                  </a>
                )}
              </div>

              <ul className="text-sm text-fg">
                {p.items.map((i) => (
                  <li key={i.orderItemId}>
                    {i.quantity} × {i.productName}
                    {i.variantName ? ` (${i.variantName})` : ''}
                  </li>
                ))}
              </ul>

              {p.parcel && (
                <p className="text-sm text-fg">
                  <span className="text-muted">Parcel: </span>
                  {[p.parcel.carrier, p.parcel.trackingNumber].filter(Boolean).join(' · ')}
                  {p.parcel.deliveredAt ? ` · delivered ${dateTime(p.parcel.deliveredAt)}` : ''}
                </p>
              )}
              {p.closeReason && p.status !== 'DELIVERED' && <p className="text-sm text-fg">{p.closeReason}</p>}

              <p className="text-sm font-semibold text-fg">
                You earn {money(p.youEarn)} on this order
                <span className="block text-xs font-normal text-muted">{p.terms}</span>
              </p>

              {p.problem && !p.problem.resolvedAt && (
                <InfoNote>You reported a problem. UnieMax is looking into it and will get back to you.</InfoNote>
              )}

              {p.needsDecision && !dismissed.has(p.id) && (
                <div className="space-y-2 rounded-md bg-pending-soft p-3">
                  <p className="text-sm font-semibold text-pending">
                    {p.status === 'RETURNED'
                      ? `The parcel from ${p.supplier.name} came back.`
                      : `${p.supplier.name} can't ship ${p.items[0]?.productName ?? 'this'}.`}{' '}
                    Cancel the whole order and refund the customer?
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="danger" onClick={onCancelOrder}>
                      Cancel order
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setDismissed((d) => new Set(d).add(p.id))}>
                      Not now
                    </Button>
                  </div>
                </div>
              )}

              {(p.canMarkDelivered || p.canReportProblem) && (
                <div className="flex flex-wrap gap-2">
                  {p.canMarkDelivered && (
                    <Button size="sm" variant="secondary" onClick={() => setDelivering(p)}>
                      Mark as delivered
                    </Button>
                  )}
                  {p.canReportProblem && (
                    <Button size="sm" variant="ghost" onClick={() => setReporting(p)}>
                      Report a problem
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </GlassCard>

      <ConfirmDialog
        open={delivering !== null}
        title="Did the customer get it?"
        description={`Only mark it delivered if the customer told you it arrived. ${delivering?.supplier.name ?? 'The supplier'} usually does this itself.`}
        confirmLabel="Yes, it arrived"
        tone="neutral"
        busy={busy}
        onConfirm={markDelivered}
        onCancel={() => setDelivering(null)}
      />

      {reporting && (
        <ProblemSheet
          storeId={storeId}
          orderId={orderId}
          part={reporting}
          onClose={() => setReporting(null)}
          onDone={(next) => {
            setData(next)
            setReporting(null)
            showToast('Reported — UnieMax will look into it')
          }}
        />
      )}
    </>
  )
}

function ProblemSheet({
  storeId,
  orderId,
  part,
  onClose,
  onDone,
}: {
  storeId: string
  orderId: string
  part: SellerPart
  onClose: () => void
  onDone: (next: SellerParts) => void
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (note.trim().length < 5) {
      setError('Tell us briefly what went wrong')
      return
    }
    setBusy(true)
    setError(null)
    try {
      onDone(await sellerPartsApi.problem(storeId, orderId, part.id, note.trim()))
    } catch (err) {
      setError(toApiError(err).message)
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      title="Report a problem"
      subtitle={`With the parcel from ${part.supplier.name}. UnieMax gets the order and your note.`}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Go back
          </Button>
          <Button loading={busy} onClick={submit}>
            Send to UnieMax
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-fg">What went wrong?</span>
          <textarea
            value={note}
            maxLength={1000}
            rows={4}
            onChange={(e) => setNote(e.target.value)}
            placeholder="For example: the saree arrived torn, or the customer got the wrong colour."
            className="w-full rounded-md border border-line bg-input px-4 py-3 text-base text-fg outline-none placeholder:text-muted focus:border-accent"
          />
        </label>
      </div>
    </Dialog>
  )
}

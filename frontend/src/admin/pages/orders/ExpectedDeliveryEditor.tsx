import { useState } from 'react'
import { adminApi } from '../../features/adminApi'
import type { OrderParcel } from '../../features/adminApi'
import { Button } from '../../ui/primitives'
import { fieldClass } from '../../../shared/ui/field'

/**
 * A parcel's expected delivery day — typed by an admin from the courier's
 * estimate — and the "Show to customer" tick. Untick it and the customer's
 * order page stops receiving the date (the server leaves it out).
 *
 * Only while the parcel is on the way; once it is delivered or came back the
 * date means nothing to anyone, so it is shown as a note instead.
 *
 * Keeps its own saved copy from the server's reply rather than reloading the
 * order page, so saving never flashes the page skeleton.
 */

const dayFormat = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const showDay = (day: string) => dayFormat.format(new Date(`${day}T00:00:00Z`))

export function ExpectedDeliveryEditor({
  orderId,
  parcel,
}: {
  orderId: string
  parcel: OrderParcel
}) {
  const [saved, setSaved] = useState({
    date: parcel.expectedDeliveryAt,
    visible: parcel.expectedDeliveryVisible,
  })
  const [date, setDate] = useState(parcel.expectedDeliveryAt ?? '')
  const [visible, setVisible] = useState(parcel.expectedDeliveryVisible)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (parcel.deliveredAt || parcel.returnedAt) {
    return saved.date ? (
      <p className="text-xs text-muted">Expected delivery was {showDay(saved.date)}</p>
    ) : null
  }

  const dirty = (date || null) !== saved.date || visible !== saved.visible
  const minDay = parcel.shippedAt.slice(0, 10)

  async function save(next: { date: string | null; visible: boolean }) {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const order = await adminApi.setExpectedDelivery(orderId, parcel.id, {
        expectedDeliveryAt: next.date,
        visible: next.visible,
      })
      const fresh = order.shipments.find((p) => p.id === parcel.id)
      const value = {
        date: fresh?.expectedDeliveryAt ?? null,
        visible: fresh?.expectedDeliveryVisible ?? false,
      }
      setSaved(value)
      setDate(value.date ?? '')
      setVisible(value.visible)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the date')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 rounded-md border border-line bg-surface-alt p-3">
      <label className="block text-xs font-medium text-fg" htmlFor={`eta-${parcel.id}`}>
        Expected delivery date
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          id={`eta-${parcel.id}`}
          type="date"
          value={date}
          min={minDay}
          disabled={busy}
          onChange={(event) => {
            setDate(event.target.value)
            setDone(false)
            // No date, nothing to show.
            if (!event.target.value) setVisible(false)
          }}
          className={fieldClass({ dense: true, className: 'w-auto' })}
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-fg">
          <input
            type="checkbox"
            checked={visible}
            disabled={busy || !date}
            onChange={(event) => {
              setVisible(event.target.checked)
              setDone(false)
            }}
            className="h-4 w-4 accent-[var(--brand)]"
          />
          Show to customer
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={busy || !dirty}
          onClick={() => void save({ date: date || null, visible: date ? visible : false })}
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {saved.date ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void save({ date: null, visible: false })}
          >
            Clear
          </Button>
        ) : null}
        <p role="status" className="text-xs text-muted">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : done ? (
            'Saved.'
          ) : saved.date ? (
            saved.visible ? (
              `The customer sees ${showDay(saved.date)}.`
            ) : (
              'Hidden from the customer.'
            )
          ) : (
            'Not set.'
          )}
        </p>
      </div>
    </div>
  )
}

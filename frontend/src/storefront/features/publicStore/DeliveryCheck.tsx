import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { isValidPincode, normalisePincode } from '../stores/deliveryRules'
import { publicStoreApi } from '../stores/storesApi'
import type { PublicProductDetail, PublicStore } from '../stores/storesApi'
import { CheckIcon, CloseIcon, MapPinIcon } from '../../layout/icons'
import { useDeliveryPincode } from './deliveryPincode'
import type { Skin } from './storeTheme'

/**
 * "Does this product deliver to me?" — the product page's availability line.
 *
 * Runs only for products whose delivery is RESTRICTED (`product.delivery
 * .restricted`); a product that ships everywhere just says so and never
 * calls the API. With a known pincode (a remembered one, or the signed-in
 * customer's primary address — see `useDeliveryPincode`) the check runs on
 * mount, so a customer whose default address is 629154 opens a product that
 * does not reach 629154 and is told immediately, before Add to Cart. The
 * pincode can be changed inline; guests with no pincode get the input.
 *
 * The purchase buttons are deliberately NOT disabled on a negative result —
 * the customer may well have another address; checkout re-checks against
 * the one they actually pick and blocks there.
 */
export function DeliveryCheck({
  store,
  product,
  skin,
}: {
  store: PublicStore
  product: PublicProductDetail
  skin: Skin
}) {
  const { pincode, source, ready, setPincode } = useDeliveryPincode()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  // The last answer: which pincode it was for, and what it said.
  const [result, setResult] = useState<
    { pincode: string; deliverable: boolean } | null
  >(null)
  const [checking, setChecking] = useState(false)

  const delivers = store.shipping.mode !== 'PICKUP'
  const restricted = product.delivery.restricted

  useEffect(() => {
    if (!delivers || !restricted || !pincode) {
      setResult(null)
      return
    }
    let cancelled = false
    setChecking(true)
    publicStoreApi
      .checkDelivery(store.slug, pincode, [product.id])
      .then((check) => {
        if (cancelled) return
        const hit = check.results.find((r) => r.productId === product.id)
        // Absent = the product is no longer visible; nothing to say here (the
        // page itself will 404 on the next load).
        setResult(hit ? { pincode, deliverable: hit.deliverable } : null)
      })
      .catch(() => {
        // Network/server failure — say nothing rather than something wrong.
        if (!cancelled) setResult(null)
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [delivers, restricted, pincode, store.slug, product.id])

  if (!delivers) return null

  if (!restricted) {
    return (
      <Row
        tone="ok"
        icon={<CheckIcon className="h-4 w-4" />}
        title="Delivers to all pincodes"
        skin={skin}
      >
        Enter your address at checkout.
      </Row>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = normalisePincode(draft)
    if (!isValidPincode(value)) {
      return setProblem('Enter a valid 6-digit pincode.')
    }
    setProblem(null)
    setPincode(value)
    setEditing(false)
    setDraft('')
  }

  const showForm = editing || (ready && !pincode)

  if (showForm) {
    return (
      <form
        onSubmit={submit}
        noValidate
        className={`mt-5 rounded-lg border p-3 ${skin.border}`}
      >
        <label className={`flex items-center gap-2 text-sm font-semibold ${skin.text}`}>
          <MapPinIcon className="h-4 w-4 shrink-0 text-brand" />
          Check delivery to your pincode
        </label>
        <p className={`mt-1 text-xs ${skin.muted}`}>
          This product is delivered to selected areas only.
        </p>
        <div className="mt-2.5 flex gap-2">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.replace(/\D/g, '').slice(0, 6))
              if (problem) setProblem(null)
            }}
            inputMode="numeric"
            placeholder="6-digit pincode"
            aria-label="Pincode"
            autoFocus={editing}
            className={`h-10 min-w-0 flex-1 rounded-md border bg-transparent px-3 text-sm outline-none transition focus:border-brand ${skin.border} ${skin.text}`}
          />
          <button
            type="submit"
            className={`h-10 shrink-0 rounded-md px-4 text-sm font-bold transition ${skin.cta}`}
          >
            Check
          </button>
          {editing && pincode && (
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setDraft('')
                setProblem(null)
              }}
              aria-label="Cancel"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border transition hover:border-brand ${skin.border} ${skin.text}`}
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        {problem && (
          <p className="mt-1.5 text-xs font-medium text-danger">{problem}</p>
        )}
      </form>
    )
  }

  if (!ready || checking || !result || !pincode) {
    return (
      <Row
        tone="neutral"
        icon={<MapPinIcon className="h-4 w-4" />}
        title="Checking delivery…"
        skin={skin}
      >
        {pincode ? `Pincode ${pincode}` : 'Looking up your address'}
      </Row>
    )
  }

  const change = (
    <button
      type="button"
      onClick={() => {
        setDraft(pincode)
        setEditing(true)
      }}
      className="font-semibold text-brand hover:underline"
    >
      Change
    </button>
  )

  return result.deliverable ? (
    <Row
      tone="ok"
      icon={<CheckIcon className="h-4 w-4" />}
      title={`Delivers to ${result.pincode}`}
      action={change}
      skin={skin}
    >
      {source === 'address'
        ? 'Based on your default address.'
        : 'Delivery available to this pincode.'}
    </Row>
  ) : (
    <Row
      tone="bad"
      icon={<CloseIcon className="h-4 w-4" />}
      title={`Not deliverable to pincode ${result.pincode}`}
      action={change}
      skin={skin}
    >
      This product is not delivered to
      {source === 'address' ? ' your default address' : ' this pincode'}. Try
      another pincode, or choose a different address at checkout.
    </Row>
  )
}

function Row({
  tone,
  icon,
  title,
  action,
  skin,
  children,
}: {
  tone: 'ok' | 'bad' | 'neutral'
  icon: React.ReactNode
  title: string
  action?: React.ReactNode
  skin: Skin
  children: React.ReactNode
}) {
  const badge =
    tone === 'ok'
      ? 'bg-success/15 text-success'
      : tone === 'bad'
        ? 'bg-danger/15 text-danger'
        : `${skin.well} ${skin.muted}`
  const border = tone === 'bad' ? 'border-danger/40' : skin.border
  return (
    <div
      role={tone === 'bad' ? 'alert' : undefined}
      className={`mt-5 flex items-start gap-3 rounded-lg border p-3 ${border}`}
    >
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${badge}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className={`flex flex-wrap items-center justify-between gap-x-3 font-semibold ${tone === 'bad' ? 'text-danger' : skin.text}`}>
          <span>{title}</span>
          {action && <span className="text-xs">{action}</span>}
        </p>
        <p className={`mt-0.5 text-xs ${skin.muted}`}>{children}</p>
      </div>
    </div>
  )
}

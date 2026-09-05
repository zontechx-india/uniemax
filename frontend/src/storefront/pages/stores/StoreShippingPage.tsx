import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, InfoNote, SuccessNote } from '../../../shared/ui/form'
import {
  deliveryRuleProblem,
  sameDeliveryRule,
} from '../../features/stores/deliveryRules'
import { storesApi } from '../../features/stores/storesApi'
import type {
  DeliveryRule,
  ShippingMode,
  Store,
} from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { CheckIcon, MapPinIcon, TruckIcon } from '../../layout/icons'
import { DeliveryRuleEditor } from './DeliveryRuleEditor'

/**
 * Shipping section of Store Management — how customers RECEIVE orders:
 * the seller delivers, customers pick up from a business location, or both
 * (how customers PAY is the Payments section). Because the choice changes
 * the live checkout, picking a different option only *requests* the change —
 * a ConfirmDialog spells out the effect and nothing is saved until it is
 * accepted, so the selection always reflects saved state.
 *
 * Below the mode sits **Delivery areas** — the store's DEFAULT pincode rule
 * (all / only selected / all except selected) that every product follows
 * unless it carries its own override (set per product in Products). Drafted
 * locally and saved with its own button, since a pincode list is edited in
 * many small steps.
 */

const MODES: {
  mode: ShippingMode
  title: string
  description: string
  confirm: string
}[] = [
  {
    mode: 'DELIVERY',
    title: 'Delivery',
    description: 'You ship or deliver orders to the customer’s address.',
    confirm:
      'Customers will get their orders delivered. Store pickup will no longer be offered at checkout.',
  },
  {
    mode: 'PICKUP',
    title: 'Store Pickup',
    description:
      'Customers collect their orders from your business location — no delivery.',
    confirm:
      'Customers will collect orders from your business address in Business Details. Delivery will no longer be offered at checkout.',
  },
  {
    mode: 'BOTH',
    title: 'Both',
    description:
      'Customers choose between delivery and store pickup at checkout.',
    confirm:
      'Customers will choose between delivery and store pickup at checkout.',
  },
]

export function StoreShippingPage() {
  const { store, onStoreChange } = useManagedStore()
  const current = store.shipping.mode

  const [pending, setPending] = useState<ShippingMode | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirmPending = async () => {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      onStoreChange(await storesApi.updateShipping(store.id, pending))
      setPending(null)
    } catch (err) {
      setError(toApiError(err).message)
      setPending(null)
    } finally {
      setBusy(false)
    }
  }

  const pendingMode = MODES.find((m) => m.mode === pending)
  const pickupEnabled = current === 'PICKUP' || current === 'BOTH'

  /**
   * Offering collection needs somewhere to collect from — the business
   * address, the one address the platform holds. The condition comes from
   * `store.readiness`, the same evaluation the endpoint enforces. This used
   * to check the FOOTER's location list, which was never the business
   * address; it just happened to be the only address the app held.
   */
  const pickupGate = store.readiness.gates.PICKUP
  const pickupBlocked = !pickupGate.allowed

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Shipping
      </h2>
      <p className="mt-1 text-sm text-muted">
        Choose how customers receive their orders. The change applies to your
        checkout immediately, so it asks for confirmation.
      </p>

      <div className="mt-5 max-w-2xl space-y-3">
        <ul className="space-y-2" role="radiogroup" aria-label="Fulfilment mode">
          {MODES.map(({ mode, title, description }) => {
            const selected = mode === current
            const Icon = mode === 'PICKUP' ? MapPinIcon : TruckIcon
            // A pickup-capable mode the store cannot honour yet.
            const locked = mode !== 'DELIVERY' && pickupBlocked
            return (
              <li key={mode}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy || pending !== null || locked}
                  title={
                    locked
                      ? `Still needed: ${pickupGate.blockers.join(', ')}`
                      : undefined
                  }
                  onClick={() => {
                    if (!selected) setPending(mode)
                  }}
                  className={`flex w-full items-center gap-4 rounded-lg border p-4 text-left transition disabled:cursor-not-allowed ${
                    selected
                      ? 'border-brand bg-brand/5'
                      : locked
                        ? 'border-line opacity-60'
                        : 'border-line hover:bg-surface-alt'
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                      selected ? 'bg-brand/10 text-brand' : 'bg-surface-alt text-muted'
                    }`}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-fg">
                      {title}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {description}
                    </span>
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                      selected
                        ? 'border-brand bg-brand text-brand-contrast'
                        : 'border-line'
                    }`}
                  >
                    {selected && <CheckIcon className="h-3 w-3" />}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {pickupBlocked && (
          <InfoNote>
            {pickupEnabled
              ? 'Store pickup is on, but customers have no address to collect from — add'
              : 'To offer store pickup, first add'}{' '}
            {pickupGate.blockers.join(', ').toLowerCase()} in{' '}
            <Link
              to="../business"
              className="font-semibold text-brand hover:underline"
            >
              Business Details
            </Link>
            .
          </InfoNote>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>

      {current !== 'PICKUP' && (
        <DeliveryAreas store={store} onStoreChange={onStoreChange} />
      )}

      <ConfirmDialog
        open={pending !== null}
        title={pendingMode ? `Switch to "${pendingMode.title}"?` : ''}
        description={pendingMode?.confirm ?? ''}
        confirmLabel="Switch"
        tone="neutral"
        busy={busy}
        onConfirm={() => void confirmPending()}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}

/**
 * The store-wide default delivery-area rule. Local draft → Save; the draft
 * re-syncs whenever the saved store changes underneath (another tab, or a
 * mode switch above that returned a fresh store).
 */
function DeliveryAreas({
  store,
  onStoreChange,
}: {
  store: Store
  onStoreChange: (store: Store) => void
}) {
  const saved = store.shipping.deliveryRule
  const [draft, setDraft] = useState<DeliveryRule>(saved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  useEffect(() => {
    setDraft(saved)
  }, [saved])

  const dirty = !sameDeliveryRule(draft, saved)
  const problem = deliveryRuleProblem(draft)

  const save = async () => {
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    setSavedNote(false)
    try {
      onStoreChange(await storesApi.updateDeliveryRule(store.id, draft))
      setSavedNote(true)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 max-w-2xl border-t border-line pt-6">
      <h3 className="font-body text-base font-semibold tracking-normal text-fg">
        Delivery areas
      </h3>
      <p className="mt-1 text-sm text-muted">
        Where you deliver, by pincode. This is the default for every product;
        a product can set its own delivery areas from{' '}
        <Link
          to="../products"
          className="font-semibold text-brand hover:underline"
        >
          Products
        </Link>
        . Customers see whether a product reaches their pincode on its page,
        and an address outside the area is refused at checkout.
      </p>

      <div className="mt-4">
        <DeliveryRuleEditor
          value={draft}
          onChange={(next) => {
            setDraft(next)
            setError(null)
            setSavedNote(false)
          }}
          disabled={busy}
        />
      </div>

      {error && (
        <div className="mt-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
      {savedNote && !dirty && (
        <div className="mt-3">
          <SuccessNote>Delivery areas saved.</SuccessNote>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="inline-flex h-10 items-center rounded-md bg-brand-gradient px-4 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          {busy ? 'Saving…' : 'Save Delivery Areas'}
        </button>
        {dirty && !busy && (
          <button
            type="button"
            onClick={() => {
              setDraft(saved)
              setError(null)
            }}
            className="text-sm font-semibold text-muted hover:text-fg"
          >
            Discard changes
          </button>
        )}
      </div>
    </section>
  )
}

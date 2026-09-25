import { useState } from 'react'
import type { FormEvent } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { ErrorNote, InfoNote, SuccessNote } from '../../../shared/ui/form'
import { CHECKOUT_FIELD_KEYS, storesApi } from '../../features/stores/storesApi'
import type { CheckoutFieldKey } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ActiveSwitch } from './ActiveSwitch'
import { Button } from '../../../shared/ui/Button'

/**
 * Checkout section of Store Management — which customer details the
 * store's checkout collects. All seven are on by default; a disabled field
 * is hidden from the customer and excluded from checkout validation.
 * Toggles are drafted locally and persisted with one Save
 * (`PATCH /stores/:id/checkout` sends only the changed keys).
 */

const FIELD_META: Record<
  CheckoutFieldKey,
  { title: string; description: string }
> = {
  name: { title: 'Name', description: 'Who the order is for.' },
  phone: {
    title: 'Phone',
    description: 'Mobile number for delivery coordination and updates.',
  },
  email: {
    title: 'Email',
    description: 'Order confirmation and updates by email.',
  },
  address: {
    title: 'Address',
    description: 'The delivery address (house / street / area / city).',
  },
  pincode: { title: 'Pincode', description: 'Postal code of the address.' },
  state: { title: 'State', description: 'State or region.' },
  country: { title: 'Country', description: 'Country of the address.' },
}

/** Contact fields are asked even for store pickup; the rest are delivery-only. */
const CONTACT_KEYS: CheckoutFieldKey[] = ['name', 'phone', 'email']

export function StoreCheckoutPage() {
  const { store, onStoreChange } = useManagedStore()

  const [draft, setDraft] = useState({ ...store.checkout })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = CHECKOUT_FIELD_KEYS.some((key) => draft[key] !== store.checkout[key])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const patch = Object.fromEntries(
      CHECKOUT_FIELD_KEYS.filter((key) => draft[key] !== store.checkout[key]).map(
        (key) => [key, draft[key]],
      ),
    )
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      onStoreChange(await storesApi.updateCheckout(store.id, patch))
      setSaved(true)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const group = (keys: CheckoutFieldKey[]) => (
    <ul className="space-y-2">
      {keys.map((key) => (
        <li
          key={key}
          className="flex items-center gap-4 rounded-lg border border-line p-3.5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{FIELD_META[key].title}</p>
            <p className="mt-0.5 text-sm text-muted">
              {FIELD_META[key].description}
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-muted">
            {draft[key] ? 'Collected' : 'Hidden'}
          </span>
          <ActiveSwitch
            checked={draft[key]}
            disabled={busy}
            label={`Collect ${FIELD_META[key].title}`}
            onChange={(next) => setDraft((d) => ({ ...d, [key]: next }))}
          />
        </li>
      ))}
    </ul>
  )

  const deliveryAllOff = !draft.address && !draft.pincode && !draft.state

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Checkout
      </h2>
      <p className="mt-1 text-sm text-muted">
        Choose which details your checkout asks customers for. Fields you
        switch off are hidden from customers and skipped in validation.
      </p>

      <form onSubmit={submit} className="mt-5 max-w-2xl space-y-4" noValidate>
        <div>
          <h3 className="font-body text-sm font-semibold uppercase tracking-wide text-muted">
            Contact information
          </h3>
          <div className="mt-2">{group(CONTACT_KEYS)}</div>
        </div>
        <div>
          <h3 className="font-body text-sm font-semibold uppercase tracking-wide text-muted">
            Delivery address
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Asked only when the order is delivered — store-pickup orders skip
            these.
          </p>
          <div className="mt-2">
            {group(
              CHECKOUT_FIELD_KEYS.filter((key) => !CONTACT_KEYS.includes(key)),
            )}
          </div>
        </div>

        {deliveryAllOff && store.shipping.mode !== 'PICKUP' && (
          <InfoNote>
            Your store delivers, but the address fields are switched off —
            you won't know where to send orders. Keep at least Address on, or
            switch the store to pickup-only in Shipping.
          </InfoNote>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && !dirty && <SuccessNote>Checkout settings saved.</SuccessNote>}

        <Button type="submit" size="md" loading={busy} disabled={!dirty}>
          {busy ? 'Saving…' : 'Save Changes'}
        </Button>
      </form>
    </div>
  )
}

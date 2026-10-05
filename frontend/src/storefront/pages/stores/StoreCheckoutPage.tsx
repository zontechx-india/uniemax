import { useState } from 'react'
import type { FormEvent } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { ErrorNote, InfoNote } from '../../../shared/ui/form'
import { CHECKOUT_FIELD_KEYS, storesApi } from '../../features/stores/storesApi'
import type { CheckoutFieldKey } from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import { ClipboardIcon, MapPinIcon, UserIcon } from '../../layout/icons'
import { BigSwitch } from './ui/BigSwitch'
import { GlassCard } from './ui/GlassCard'
import { PageHeader } from './ui/PageHeader'
import { SaveBar } from './ui/SaveBar'
import { showToast } from './ui/Toast'

/**
 * Checkout section of Store Management — which customer details the
 * store's checkout asks for. All seven are on by default; a field switched
 * off is hidden from the customer and skipped in checkout validation.
 *
 * Switches are drafted locally and saved together through the shared
 * SaveBar (`PATCH /stores/:id/checkout` sends only the changed keys) — it
 * appears once something changes and warns before leaving unsaved.
 */

const FIELD_META: Record<CheckoutFieldKey, { title: string; description: string }> = {
  name: { title: 'Name', description: 'Who the order is for.' },
  phone: { title: 'Mobile number', description: 'So you can call about delivery.' },
  email: { title: 'Email', description: 'For order emails.' },
  address: { title: 'Address', description: 'House, street, area and town.' },
  pincode: { title: 'Pincode', description: 'The 6-digit postal code.' },
  state: { title: 'State', description: 'Like Kerala or Tamil Nadu.' },
  country: { title: 'Country', description: 'Usually India.' },
}

/** Contact fields are asked even for store pickup; the rest are delivery-only. */
const CONTACT_KEYS: CheckoutFieldKey[] = ['name', 'phone', 'email']

export function StoreCheckoutPage() {
  const { store, onStoreChange } = useManagedStore()

  const [draft, setDraft] = useState({ ...store.checkout })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    try {
      const updated = await storesApi.updateCheckout(store.id, patch)
      onStoreChange(updated)
      setDraft({ ...updated.checkout })
      showToast('Checkout saved')
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const group = (keys: CheckoutFieldKey[]) => (
    <ul className="divide-y divide-line">
      {keys.map((key) => (
        <li key={key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-fg">{FIELD_META[key].title}</p>
            <p className="text-hint text-muted">{FIELD_META[key].description}</p>
          </div>
          <BigSwitch
            checked={draft[key]}
            disabled={busy}
            label={`Ask for ${FIELD_META[key].title}`}
            onText="Asked"
            offText="Not asked"
            onChange={(next) => setDraft((d) => ({ ...d, [key]: next }))}
          />
        </li>
      ))}
    </ul>
  )

  const deliveryAllOff = !draft.address && !draft.pincode && !draft.state

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <PageHeader
        icon={ClipboardIcon}
        title="Checkout"
        description="Choose what customers fill in when they order. Anything you switch off is not asked."
      />

      <GlassCard icon={UserIcon} title="About the customer">
        {group(CONTACT_KEYS)}
      </GlassCard>

      <GlassCard
        icon={MapPinIcon}
        title="Where to deliver"
        description="Only asked when you deliver — pickup orders skip these."
      >
        {group(CHECKOUT_FIELD_KEYS.filter((key) => !CONTACT_KEYS.includes(key)))}
      </GlassCard>

      {deliveryAllOff && store.shipping.mode !== 'PICKUP' && (
        <InfoNote>
          You deliver, but the address is switched off — you won’t know where
          to send orders. Keep at least Address on, or switch your shop to
          pickup only in Shipping.
        </InfoNote>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <SaveBar dirty={dirty} saving={busy} onDiscard={() => setDraft({ ...store.checkout })} />
    </form>
  )
}

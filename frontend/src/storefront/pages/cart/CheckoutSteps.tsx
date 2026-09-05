import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { ErrorNote, InfoNote, TextField } from '../../../shared/ui/form'
import {
  addressesApi,
  formatAddressLine,
} from '../../features/addresses/addressesApi'
import type {
  AddressInput,
  CustomerAddress,
} from '../../features/addresses/addressesApi'
import { AddressForm } from '../../features/addresses/AddressForm'
import type {
  BillingAddressInput,
  CheckoutFieldKey,
  OrderQuote,
  PublicStore,
  StoreCheckoutFields,
} from '../../features/stores/storesApi'
import {
  CardIcon,
  CheckIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  TruckIcon,
} from '../../layout/icons'

/**
 * The interactive checkout steps — Delivery Details → Choose Payment Method.
 * (The remaining flow — platform payment gateway → payment success → order
 * created — arrives with the payments/orders module; the Confirm button in
 * the summary stays disabled until then.)
 *
 * What the delivery step asks is driven by the STORE's checkout-field
 * toggles (`shell.checkout`, seller-configured, all on by default): a
 * disabled field is neither shown nor validated. Contact fields
 * (name/phone/email) are asked even for store pickup; the address fields
 * only when the order is delivered.
 *
 * Signed-in customers see their saved addresses as selectable rows (primary
 * first) with an inline "Add new address" that saves to the address book;
 * guests get a plain form. Delivery orders can also give a separate
 * **billing address** (same as delivery by default). Everything is kept in
 * component state — order creation consumes it once it exists.
 *
 * The payment step offers what the STORE accepts, narrowed by the server's
 * quote for THIS cart: a product that refuses cash on delivery greys COD out
 * and names itself, so the customer learns why before Place Order.
 */

// --- field configuration ----------------------------------------------------

const CONTACT_KEYS = ['name', 'phone', 'email'] as const
const ADDRESS_KEYS = ['address', 'pincode', 'state', 'country'] as const

const FIELD_LABELS: Record<CheckoutFieldKey, string> = {
  name: 'Full name',
  phone: 'Mobile number',
  email: 'Email',
  address: 'Address',
  pincode: 'Pincode',
  state: 'State',
  country: 'Country',
}

export type CheckoutForm = Partial<Record<CheckoutFieldKey, string>>

/** Validate ONLY the fields this store collects for this fulfilment. */
function validate(
  fields: StoreCheckoutFields,
  values: CheckoutForm,
  withAddress: boolean,
): string | null {
  const keys: CheckoutFieldKey[] = withAddress
    ? [...CONTACT_KEYS, ...ADDRESS_KEYS]
    : [...CONTACT_KEYS]
  for (const key of keys) {
    if (!fields[key]) continue
    const value = (values[key] ?? '').trim()
    if (!value) return `${FIELD_LABELS[key]} is required.`
    if (key === 'phone' && !/^\+?[\d\s\-()]{5,20}$/.test(value)) {
      return 'The mobile number looks invalid.'
    }
    if (key === 'email' && !/^\S+@\S+\.\S+$/.test(value)) {
      return 'The email address looks invalid.'
    }
    if (key === 'pincode' && !/^[A-Za-z0-9 -]{3,10}$/.test(value)) {
      return 'The pincode looks invalid.'
    }
  }
  return null
}

/** What the summary line shows once the step is confirmed. */
function summarize(values: CheckoutForm, withAddress: boolean): string {
  const parts = [
    values.name,
    values.phone,
    withAddress ? values.address : null,
    withAddress ? values.pincode : null,
  ].filter((part): part is string => Boolean(part && part.trim()))
  return parts.join(' · ')
}

export interface DeliveryDetails {
  fulfilment: 'DELIVERY' | 'PICKUP'
  values: CheckoutForm
  /** A billing address that differs from delivery; null = same. */
  billing: BillingAddressInput | null
}

/** What the summary panel needs to enable + submit Place Order. */
export interface CheckoutState {
  delivery: DeliveryDetails | null
  payment: 'ONLINE' | 'COD' | null
  /** The CURRENT fulfilment choice, even before step 1 is confirmed — the
   *  price quote depends on it (pickup ships free). */
  fulfilment: 'DELIVERY' | 'PICKUP'
}

// --- billing address -------------------------------------------------------

interface BillingForm {
  name: string
  phone: string
  address: string
  pincode: string
  state: string
  country: string
}

const EMPTY_BILLING: BillingForm = {
  name: '',
  phone: '',
  address: '',
  pincode: '',
  state: '',
  country: 'India',
}

function validateBilling(values: BillingForm): string | null {
  if (!values.name.trim()) return 'Enter the billing name.'
  if (!values.address.trim()) return 'Enter the billing address.'
  if (!/^[A-Za-z0-9 -]{3,10}$/.test(values.pincode.trim())) {
    return 'The billing pincode looks invalid.'
  }
  return null
}

function toBillingInput(values: BillingForm): BillingAddressInput {
  const text = (v: string) => (v.trim() ? v.trim() : null)
  return {
    name: values.name.trim(),
    phone: text(values.phone),
    address: values.address.trim(),
    pincode: values.pincode.trim(),
    state: text(values.state),
    country: text(values.country),
  }
}

// --- the two steps ----------------------------------------------------------

export function CheckoutSteps({
  shell,
  quote,
  onStateChange,
}: {
  shell: PublicStore
  /** The server's price summary for this cart — null while loading/failed. */
  quote: OrderQuote | null
  /** Fired whenever a step completes/changes — feeds the Place Order button. */
  onStateChange: (state: CheckoutState) => void
}) {
  const fields = shell.checkout
  const mode = shell.shipping.mode

  const [fulfilment, setFulfilment] = useState<'DELIVERY' | 'PICKUP'>(
    mode === 'PICKUP' ? 'PICKUP' : 'DELIVERY',
  )
  const [delivery, setDelivery] = useState<DeliveryDetails | null>(null)
  const [payment, setPayment] = useState<'ONLINE' | 'COD' | null>(null)
  const [billingSame, setBillingSame] = useState(true)
  const [billingValues, setBillingValues] = useState<BillingForm>(EMPTY_BILLING)
  const [billingProblem, setBillingProblem] = useState<string | null>(null)

  useEffect(() => {
    onStateChange({ delivery, payment, fulfilment })
  }, [delivery, payment, fulfilment, onStateChange])

  const withAddress = fulfilment === 'DELIVERY'

  /** Step 1 completes only once the billing section (if used) is valid too. */
  const completeDelivery = (values: CheckoutForm) => {
    let billing: BillingAddressInput | null = null
    if (withAddress && !billingSame) {
      const failure = validateBilling(billingValues)
      if (failure) return setBillingProblem(failure)
      billing = toBillingInput(billingValues)
    }
    setBillingProblem(null)
    setDelivery({ fulfilment, values, billing })
  }

  return (
    <>
      <section className="rounded-xl border border-line bg-surface p-5">
        <StepHeading
          icon={<MapPinIcon className="h-4.5 w-4.5" />}
          step={1}
          title={withAddress ? 'Delivery Details' : 'Contact & Pickup'}
          done={delivery !== null}
        />

        {delivery ? (
          <div className="mt-3 flex items-start justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-fg">
                {delivery.fulfilment === 'PICKUP'
                  ? 'Store pickup'
                  : 'Deliver to'}
              </p>
              <p className="mt-0.5 text-muted">
                {summarize(delivery.values, delivery.fulfilment === 'DELIVERY') ||
                  'Details recorded.'}
              </p>
              {delivery.billing && (
                <p className="mt-1 text-xs text-muted">
                  Billed to {delivery.billing.name} · {delivery.billing.address}{' '}
                  · {delivery.billing.pincode}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setDelivery(null)
                setPayment(null)
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-brand transition hover:bg-surface-alt"
            >
              <PencilIcon className="h-3.5 w-3.5" />
              Change
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {mode === 'BOTH' && (
              <FulfilmentPicker value={fulfilment} onChange={setFulfilment} />
            )}
            {fulfilment === 'PICKUP' && <PickupLocation shell={shell} />}
            {withAddress && (
              <BillingAddressSection
                same={billingSame}
                onSameChange={(same) => {
                  setBillingSame(same)
                  setBillingProblem(null)
                }}
                values={billingValues}
                onChange={(next) => {
                  setBillingValues(next)
                  setBillingProblem(null)
                }}
                problem={billingProblem}
              />
            )}
            <DeliveryStep
              fields={fields}
              withAddress={withAddress}
              onDone={completeDelivery}
            />
          </div>
        )}
      </section>

      <section
        className={`rounded-xl border border-line bg-surface p-5 ${
          delivery ? '' : 'opacity-50'
        }`}
        aria-disabled={delivery === null}
      >
        <StepHeading
          icon={<CardIcon className="h-4.5 w-4.5" />}
          step={2}
          title="Choose Payment Method"
          done={payment !== null && delivery !== null}
        />
        {delivery === null ? (
          <p className="mt-2 text-sm text-muted">
            Complete your {withAddress ? 'delivery details' : 'contact details'}{' '}
            first.
          </p>
        ) : (
          <PaymentStep
            shell={shell}
            quote={quote}
            value={payment}
            onChange={setPayment}
          />
        )}
      </section>
    </>
  )
}

function StepHeading({
  icon,
  step,
  title,
  done,
}: {
  icon: React.ReactNode
  step: number
  title: string
  done: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-md ${
          done ? 'bg-success/10 text-success' : 'bg-brand/10 text-brand'
        }`}
      >
        {done ? <CheckIcon className="h-4.5 w-4.5" /> : icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          Step {step} of 2
        </p>
        <h2 className="font-body text-base font-semibold tracking-normal">
          {title}
        </h2>
      </div>
      {done && (
        <span className="ml-auto shrink-0 rounded-pill bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
          Done
        </span>
      )}
    </div>
  )
}

/** Delivery ↔ pickup choice for stores that offer both. */
function FulfilmentPicker({
  value,
  onChange,
}: {
  value: 'DELIVERY' | 'PICKUP'
  onChange: (next: 'DELIVERY' | 'PICKUP') => void
}) {
  const options = [
    { key: 'DELIVERY' as const, label: 'Delivery', Icon: TruckIcon },
    { key: 'PICKUP' as const, label: 'Store Pickup', Icon: MapPinIcon },
  ]
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
            value === key
              ? 'border-brand bg-brand/5 text-brand'
              : 'border-line text-muted hover:bg-surface-alt'
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  )
}

/** Where to collect — the store's primary footer location, when it has one. */
function PickupLocation({ shell }: { shell: PublicStore }) {
  const location =
    shell.footer.locations.find((l) => l.isPrimary) ?? shell.footer.locations[0]
  return (
    <InfoNote>
      {location
        ? `Pickup point: ${location.label ? `${location.label} — ` : ''}${location.address}`
        : 'The seller will share the pickup address with your order confirmation.'}
    </InfoNote>
  )
}

/**
 * "Billing address is the same as delivery" (default) or a compact form for
 * a different one. Sits above the delivery form so it is filled in before
 * the step's confirm button; the parent validates it on confirm.
 */
function BillingAddressSection({
  same,
  onSameChange,
  values,
  onChange,
  problem,
}: {
  same: boolean
  onSameChange: (same: boolean) => void
  values: BillingForm
  onChange: (next: BillingForm) => void
  problem: string | null
}) {
  const set = (key: keyof BillingForm, value: string) =>
    onChange({ ...values, [key]: value })
  return (
    <div className="rounded-md border border-line p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={same}
          onChange={(e) => onSameChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand)]"
        />
        <span className="text-sm">
          <span className="font-medium text-fg">
            Billing address is the same as the delivery address
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            Untick to bill a different name or address.
          </span>
        </span>
      </label>
      {!same && (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Billing name"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={100}
            />
            <TextField
              label="Billing phone (optional)"
              value={values.phone}
              onChange={(e) => set('phone', e.target.value)}
              inputMode="tel"
              maxLength={20}
            />
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">
              Billing address
            </span>
            <textarea
              value={values.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="House / street / area / city"
              rows={2}
              maxLength={300}
              className="w-full rounded-md border border-line bg-input px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-muted hover:border-fg/30 focus:border-accent"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <TextField
              label="Pincode"
              value={values.pincode}
              onChange={(e) => set('pincode', e.target.value)}
              inputMode="numeric"
              maxLength={10}
            />
            <TextField
              label="State"
              value={values.state}
              onChange={(e) => set('state', e.target.value)}
              maxLength={100}
            />
            <TextField
              label="Country"
              value={values.country}
              onChange={(e) => set('country', e.target.value)}
              maxLength={100}
            />
          </div>
          {problem && <ErrorNote>{problem}</ErrorNote>}
        </div>
      )}
    </div>
  )
}

// --- step 1 body ------------------------------------------------------------

function DeliveryStep({
  fields,
  withAddress,
  onDone,
}: {
  fields: StoreCheckoutFields
  withAddress: boolean
  onDone: (values: CheckoutForm) => void
}) {
  // undefined = probing the session · 'guest' = not signed in
  const [addresses, setAddresses] = useState<
    CustomerAddress[] | 'guest' | undefined
  >(undefined)

  useEffect(() => {
    let cancelled = false
    addressesApi
      .list()
      .then((rows) => {
        if (!cancelled) setAddresses(rows)
      })
      .catch(() => {
        // 401 (guest) or any failure — the manual form always works.
        if (!cancelled) setAddresses('guest')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (addresses === undefined) {
    return <p className="text-sm text-muted">Loading your addresses…</p>
  }

  // Guests — and pickup orders, which only need contact fields — use the
  // plain form. Saved addresses only add value when a full address is needed.
  if (addresses === 'guest' || !withAddress) {
    return (
      <ManualDetailsForm
        fields={fields}
        withAddress={withAddress}
        prefill={
          addresses !== 'guest'
            ? (addresses.find((a) => a.isPrimary) ?? addresses[0])
            : undefined
        }
        onDone={onDone}
      />
    )
  }

  return (
    <SavedAddressPicker
      fields={fields}
      addresses={addresses}
      onAddressesChange={setAddresses}
      onDone={onDone}
    />
  )
}

/**
 * Signed-in delivery: saved addresses as selectable rows (primary first),
 * an inline add-form that saves to the address book, and a per-store email
 * top-up when the store collects email but the chosen address has none.
 */
function SavedAddressPicker({
  fields,
  addresses,
  onAddressesChange,
  onDone,
}: {
  fields: StoreCheckoutFields
  addresses: CustomerAddress[]
  onAddressesChange: (next: CustomerAddress[]) => void
  onDone: (values: CheckoutForm) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    addresses.find((a) => a.isPrimary)?.id ?? addresses[0]?.id ?? null,
  )
  const [adding, setAdding] = useState(addresses.length === 0)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [extraEmail, setExtraEmail] = useState('')

  const selected = addresses.find((a) => a.id === selectedId) ?? null
  const needsEmail = fields.email && selected !== null && !selected.email

  const addNew = async (input: AddressInput) => {
    setBusy(true)
    setProblem(null)
    try {
      const created = await addressesApi.create(input)
      onAddressesChange([...addresses, created])
      setSelectedId(created.id)
      setAdding(false)
    } catch (err) {
      setProblem(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => {
    if (!selected) return setProblem('Select a delivery address.')
    const email = selected.email ?? extraEmail.trim()
    if (fields.email && !email) {
      return setProblem('Enter an email address for this order.')
    }
    if (fields.email && !/^\S+@\S+\.\S+$/.test(email)) {
      return setProblem('The email address looks invalid.')
    }
    setProblem(null)
    onDone({
      name: selected.name,
      phone: selected.phone,
      email,
      address: selected.addressLine,
      pincode: selected.pincode,
      state: selected.state,
      country: selected.country,
    })
  }

  return (
    <div className="space-y-3">
      {addresses.length > 0 && (
        <ul className="space-y-2" role="radiogroup" aria-label="Saved addresses">
          {addresses.map((address) => {
            const isSelected = address.id === selectedId
            return (
              <li key={address.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedId(address.id)}
                  className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition ${
                    isSelected
                      ? 'border-brand bg-brand/5'
                      : 'border-line hover:bg-surface-alt'
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
                      isSelected
                        ? 'border-brand bg-brand text-brand-contrast'
                        : 'border-line'
                    }`}
                  >
                    {isSelected && <CheckIcon className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                      {address.name}
                      {address.label && (
                        <span className="rounded-pill bg-surface-alt px-2 py-0.5 text-[11px] font-semibold text-muted">
                          {address.label}
                        </span>
                      )}
                      {address.isPrimary && (
                        <span className="rounded-pill bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                          Primary
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">
                      {formatAddressLine(address)} · {address.phone}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {adding && (
        <AddressForm
          busy={busy}
          submitLabel="Save & Use This Address"
          onCancel={() => setAdding(false)}
          onSubmit={(input) => void addNew(input)}
        />
      )}

      {needsEmail && !adding && (
        <TextField
          label="Email for this order (this store asks for it)"
          value={extraEmail}
          onChange={(e) => setExtraEmail(e.target.value)}
          placeholder="you@example.com"
          type="email"
          maxLength={160}
        />
      )}

      {problem && <ErrorNote>{problem}</ErrorNote>}

      {!adding && (
        // Secondary on the left, primary anchored right (mobile stacks the
        // primary on top via flex-col-reverse).
        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex h-11 items-center justify-center gap-1.5 rounded-md border border-line px-5 text-sm font-semibold text-fg transition hover:bg-surface-alt"
          >
            <PlusIcon className="h-4 w-4" />
            Add New Address
          </button>
          {addresses.length > 0 && (
            <button
              type="button"
              onClick={confirm}
              className="metal-cta flex h-11 items-center justify-center rounded-md px-6 text-sm font-bold text-cta-contrast transition"
            >
              Deliver to This Address
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Manual details form — guests, and every pickup order. Renders ONLY the
 * fields the store collects; validation matches exactly.
 */
function ManualDetailsForm({
  fields,
  withAddress,
  prefill,
  onDone,
}: {
  fields: StoreCheckoutFields
  withAddress: boolean
  prefill?: CustomerAddress | undefined
  onDone: (values: CheckoutForm) => void
}) {
  const [values, setValues] = useState<CheckoutForm>({
    name: prefill?.name ?? '',
    phone: prefill?.phone ?? '',
    email: prefill?.email ?? '',
    address: prefill?.addressLine ?? '',
    pincode: prefill?.pincode ?? '',
    state: prefill?.state ?? '',
    country: prefill?.country ?? 'India',
  })
  const [problem, setProblem] = useState<string | null>(null)

  const set = (key: CheckoutFieldKey, value: string) =>
    setValues((v) => ({ ...v, [key]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const failure = validate(fields, values, withAddress)
    if (failure) return setProblem(failure)
    setProblem(null)
    onDone(values)
  }

  const field = (key: CheckoutFieldKey, extra?: { textarea?: boolean }) => {
    if (!fields[key]) return null
    if (extra?.textarea) {
      return (
        <label className="block" key={key}>
          <span className="mb-2 block text-sm font-medium text-muted">
            {FIELD_LABELS[key]}
          </span>
          <textarea
            value={values[key] ?? ''}
            onChange={(e) => set(key, e.target.value)}
            placeholder="House / street / area / city"
            rows={3}
            maxLength={300}
            className="w-full rounded-md border border-line bg-input px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-muted hover:border-fg/30 focus:border-accent"
          />
        </label>
      )
    }
    return (
      <TextField
        key={key}
        label={FIELD_LABELS[key]}
        value={values[key] ?? ''}
        onChange={(e) => set(key, e.target.value)}
        inputMode={
          key === 'phone' ? 'tel' : key === 'pincode' ? 'numeric' : undefined
        }
        type={key === 'email' ? 'email' : undefined}
        maxLength={key === 'phone' ? 20 : key === 'pincode' ? 10 : 160}
      />
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('name')}
        {field('phone')}
      </div>
      {field('email')}
      {withAddress && (
        <>
          {field('address', { textarea: true })}
          <div className="grid gap-4 sm:grid-cols-3">
            {field('pincode')}
            {field('state')}
            {field('country')}
          </div>
        </>
      )}

      {problem && <ErrorNote>{problem}</ErrorNote>}

      <div className="flex sm:justify-end">
        <button
          type="submit"
          className="metal-cta h-11 w-full rounded-md text-sm font-bold text-cta-contrast transition sm:w-auto sm:px-6"
        >
          {withAddress ? 'Deliver to This Address' : 'Continue'}
        </button>
      </div>
    </form>
  )
}

// --- step 2 body ------------------------------------------------------------

function PaymentStep({
  shell,
  quote,
  value,
  onChange,
}: {
  shell: PublicStore
  quote: OrderQuote | null
  value: 'ONLINE' | 'COD' | null
  onChange: (next: 'ONLINE' | 'COD' | null) => void
}) {
  // The store's switches say what it offers; the quote narrows COD for THIS
  // cart (a product may refuse it). Without a quote yet, trust the switches
  // — the server refuses a disallowed COD order anyway.
  const codBlockedBy = quote?.paymentMethods.codUnavailableFor ?? []
  const codDisabled = quote ? !quote.paymentMethods.cod : false

  // A cart change can take COD away after it was picked — drop the choice so
  // Place Order cannot submit a method the server will reject.
  useEffect(() => {
    if (value === 'COD' && codDisabled) onChange(null)
  }, [value, codDisabled, onChange])

  const methods = [
    shell.payments.acceptOnlinePayment
      ? {
          key: 'ONLINE' as const,
          title: 'Online Payment',
          description: 'Pay securely through UnieMax — UPI, cards and more.',
          disabled: false,
          note: null as string | null,
        }
      : null,
    shell.payments.acceptCod
      ? {
          key: 'COD' as const,
          title: 'Cash on Delivery',
          description: 'Pay in cash when your order arrives.',
          disabled: codDisabled,
          note:
            codBlockedBy.length > 0
              ? `Not available for ${codBlockedBy
                  .map((name) => `"${name}"`)
                  .join(', ')} — these items are prepaid only.`
              : null,
        }
      : null,
  ].filter((m): m is NonNullable<typeof m> => m !== null)

  if (methods.length === 0) {
    return (
      <div className="mt-3">
        <InfoNote>
          This store hasn't enabled any payment method yet — orders can't be
          placed right now.
        </InfoNote>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-3">
      <ul className="space-y-2" role="radiogroup" aria-label="Payment method">
        {methods.map((method) => {
          const isSelected = value === method.key
          return (
            <li key={method.key}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={method.disabled}
                onClick={() => onChange(method.key)}
                className={`flex w-full items-center gap-3 rounded-md border p-3.5 text-left transition disabled:cursor-not-allowed ${
                  isSelected
                    ? 'border-brand bg-brand/5'
                    : method.disabled
                      ? 'border-line opacity-60'
                      : 'border-line hover:bg-surface-alt'
                }`}
              >
                <span
                  className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border ${
                    isSelected
                      ? 'border-brand bg-brand text-brand-contrast'
                      : 'border-line'
                  }`}
                >
                  {isSelected && <CheckIcon className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg">
                    {method.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {method.description}
                  </span>
                  {method.note && (
                    <span className="mt-1 block text-xs font-semibold text-warning">
                      {method.note}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {value !== null && (
        <InfoNote>
          {value === 'ONLINE' && import.meta.env.DEV
            ? 'Development build — the online payment is simulated instantly when you place the order.'
            : 'You’re all set — review your order and hit Place Order.'}
        </InfoNote>
      )}
    </div>
  )
}

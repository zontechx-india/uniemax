import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { toApiError } from '../../../shared/auth/http'
import { VerifyPhoneForm } from '../../../shared/auth/VerifyPhoneForm'
import { ErrorNote, SuccessNote, TextField } from '../../../shared/ui/form'
import { useCustomerSession } from '../../app/sessionContext'
import { useMarketSession } from '../../app/marketSession'
import { CheckIcon } from '../../layout/icons'
import {
  AddressFields,
  validateAddress,
} from '../../features/stores/AddressFields'
import type { AddressErrors } from '../../features/stores/AddressFields'
import { storesApi } from '../../features/stores/storesApi'
import type { Store } from '../../features/stores/storesApi'
import {
  EMPTY_ADDRESS,
  GST_STATE_CODES,
  GSTIN_RE,
  PAN_RE,
  gstinContainsPan,
} from '../../features/stores/storeProfile'
import type { StoreAddress, StoreProfilePatch } from '../../features/stores/storeProfile'
import { useManagedStore } from '../../features/stores/useManagedStore'

/**
 * Business Details — the permanent home of everything the onboarding wizard
 * collects, plus the tax IDs a seller may have skipped.
 *
 * Three independent cards rather than one long form with a single Save. Each
 * saves only its own section (`PATCH /stores/:id/profile` is partial by key),
 * so a seller correcting a phone number never has to re-validate their
 * address, and a failure in one card cannot discard edits in another.
 */
export function StoreBusinessPage() {
  const { store, onStoreChange } = useManagedStore()

  return (
    <div>
      <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
        Business Details
      </h2>
      <p className="mt-1 text-sm text-muted">
        Who's behind {store.name}, where you trade from, and the tax details we
        need before paying you out.
      </p>

      <div className="mt-5 space-y-5">
        <ContactCard store={store} onStoreChange={onStoreChange} />
        <AddressCard store={store} onStoreChange={onStoreChange} />
        <TaxCard store={store} onStoreChange={onStoreChange} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared card chrome
// ---------------------------------------------------------------------------

function Card({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 shadow-floating sm:p-5">
      <h3 className="font-body text-base font-semibold text-fg">{title}</h3>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function SaveButton({ busy, disabled }: { busy: boolean; disabled: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      className="h-11 w-full rounded-md bg-brand-gradient px-6 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted sm:w-auto"
    >
      {busy ? 'Saving…' : 'Save Changes'}
    </button>
  )
}

/**
 * Save plumbing every card repeats: run the patch, push the fresh store up to
 * the layout, show a confirmation that clears the moment the seller edits
 * again (a stale "Saved." next to unsaved changes is worse than none).
 */
function useProfileSave(
  store: Store,
  onStoreChange: (store: Store) => void,
): {
  busy: boolean
  error: string | null
  saved: boolean
  setError: (message: string | null) => void
  clearStatus: () => void
  save: (patch: StoreProfilePatch) => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  return {
    busy,
    error,
    saved,
    setError,
    clearStatus: () => {
      setSaved(false)
      setError(null)
    },
    save: async (patch) => {
      setError(null)
      setBusy(true)
      try {
        onStoreChange(await storesApi.updateProfile(store.id, patch))
        setSaved(true)
      } catch (err) {
        setError(toApiError(err).message)
      } finally {
        setBusy(false)
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Business & contact
// ---------------------------------------------------------------------------

function ContactCard({
  store,
  onStoreChange,
}: {
  store: Store
  onStoreChange: (store: Store) => void
}) {
  const { profile } = store
  const { busy, error, saved, setError, clearStatus, save } = useProfileSave(
    store,
    onStoreChange,
  )
  const { customer } = useCustomerSession()
  const { signedIn } = useMarketSession()
  const [businessName, setBusinessName] = useState(profile.businessName ?? '')
  const [sellerName, setSellerName] = useState(profile.sellerName ?? '')

  // Contact details are the seller's own verified account identifiers, never
  // free text — see `assertVerifiedContact` on the server. Changing one means
  // verifying the new identifier, which is why there is no input here.
  const email = customer.emailVerifiedAt ? customer.email : null
  const phone = customer.phoneVerifiedAt ? customer.phone : null

  const edit = (setter: (value: string) => void) => (value: string) => {
    clearStatus()
    setter(value)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!businessName.trim()) return setError('Business name is required.')
    if (!sellerName.trim()) return setError('Seller name is required.')
    if (!phone) return setError('Verify a mobile number to save contact details.')

    await save({
      businessName: businessName.trim(),
      sellerName: sellerName.trim(),
      phone,
      ...(email ? { email } : {}),
    })
  }

  return (
    <Card
      title="Business & contact"
      description="The trading entity and the person we reach about orders."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Business name *"
            value={businessName}
            onChange={(e) => edit(setBusinessName)(e.target.value)}
            maxLength={120}
            disabled={busy}
          />
          <TextField
            label="Seller name *"
            value={sellerName}
            onChange={(e) => edit(setSellerName)(e.target.value)}
            maxLength={80}
            disabled={busy}
            autoComplete="name"
          />
        </div>

        <div className="rounded-lg border border-line bg-surface-alt/60 p-4">
          <p className="text-sm font-medium text-fg">Contact details</p>
          <p className="mt-0.5 text-xs text-muted">
            Taken from your verified account, and changed there — never typed
            in here.{' '}
            <Link
              to="/profile"
              className="font-medium text-brand hover:text-brand-hover"
            >
              Manage sign-in details
            </Link>
          </p>

          <div className="mt-3 space-y-3">
            <VerifiedContact label="Email" value={email} />

            {phone ? (
              <VerifiedContact label="Mobile number" value={phone} />
            ) : (
              <div>
                <p className="text-xs font-medium text-muted">Mobile number</p>
                <p className="mt-0.5 mb-3 text-sm text-muted">
                  Add a number so we can reach you about orders.
                </p>
                <VerifyPhoneForm
                  autoFocus={false}
                  submitLabel="Verify number"
                  onVerified={signedIn}
                />
              </div>
            )}
          </div>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && <SuccessNote>Business details saved.</SuccessNote>}
        <SaveButton busy={busy} disabled={!phone} />
      </form>
    </Card>
  )
}

/** One read-only, already-verified contact identifier. */
function VerifiedContact({
  label,
  value,
}: {
  label: string
  value: string | null
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <p className="truncate text-sm font-medium text-fg">{value ?? '—'}</p>
        {value && (
          <span className="inline-flex items-center gap-1 rounded-pill bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            <CheckIcon className="h-3 w-3" />
            Verified
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

function AddressCard({
  store,
  onStoreChange,
}: {
  store: Store
  onStoreChange: (store: Store) => void
}) {
  const { profile } = store
  const { busy, error, saved, setError, clearStatus, save } = useProfileSave(
    store,
    onStoreChange,
  )
  const [address, setAddress] = useState<StoreAddress>(
    profile.address ?? EMPTY_ADDRESS,
  )
  const [errors, setErrors] = useState<AddressErrors>({})

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const addressErrors = validateAddress(address)
    setErrors(addressErrors)
    if (Object.keys(addressErrors).length > 0) {
      return setError('Please complete the highlighted fields.')
    }
    await save({ address })
  }

  return (
    <Card
      title="Address"
      description="Where your business is registered and operates from."
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <AddressFields
          value={address}
          onChange={(next) => {
            clearStatus()
            setAddress(next)
          }}
          errors={errors}
          disabled={busy}
          idPrefix="business"
        />

        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && <SuccessNote>Address saved.</SuccessNote>}
        <SaveButton busy={busy} disabled={false} />
      </form>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Tax & compliance
// ---------------------------------------------------------------------------

function TaxCard({
  store,
  onStoreChange,
}: {
  store: Store
  onStoreChange: (store: Store) => void
}) {
  const { tax } = store.profile
  const { busy, error, saved, setError, clearStatus, save } = useProfileSave(
    store,
    onStoreChange,
  )
  const [pan, setPan] = useState(tax.pan ?? '')
  const [gstin, setGstin] = useState(tax.gstin ?? '')
  const [gstExempt, setGstExempt] = useState(tax.gstExempt)
  const [registrationNumber, setRegistrationNumber] = useState(
    tax.registrationNumber ?? '',
  )

  const panValid = pan === '' || PAN_RE.test(pan)
  const gstinValid = gstin === '' || GSTIN_RE.test(gstin)
  const gstState = gstinValid && gstin ? GST_STATE_CODES[gstin.slice(0, 2)] : null
  const panMismatch =
    gstinValid && gstin !== '' && panValid && pan !== ''
      ? !gstinContainsPan(gstin, pan)
      : false

  const onlineBlocked = !store.readiness.gates.ONLINE_PAYMENT.allowed

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pan && !PAN_RE.test(pan)) {
      return setError('Enter a valid PAN like ABCDE1234F, or leave it blank.')
    }
    if (gstin && !GSTIN_RE.test(gstin)) {
      return setError('Enter a valid 15-character GSTIN, or leave it blank.')
    }
    if (panMismatch) {
      return setError(
        "This GSTIN doesn't contain the PAN above — please check both.",
      )
    }
    await save({
      tax: {
        pan: pan || null,
        gstin: gstin || null,
        gstExempt: gstin ? false : gstExempt,
        registrationNumber: registrationNumber.trim() || null,
      },
    })
  }

  return (
    <Card
      title="Tax & compliance"
      description="Needed before UnieMax can collect payments and pay you out."
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        {onlineBlocked && (
          <p className="rounded-md border border-accent/30 bg-accent/10 px-3.5 py-3 text-sm text-accent">
            Online payments stay off until you add:{' '}
            {store.readiness.gates.ONLINE_PAYMENT.blockers.join(', ')}.
          </p>
        )}

        <div>
          <TextField
            label="PAN"
            placeholder="ABCDE1234F"
            value={pan}
            onChange={(e) => {
              clearStatus()
              setPan(e.target.value.toUpperCase().slice(0, 10))
            }}
            disabled={busy}
          />
          <p
            className={`mt-1.5 text-xs ${panValid ? 'text-muted' : 'text-danger'}`}
          >
            {panValid
              ? 'Without a PAN, TDS on your sales is withheld at 5% instead of 1%.'
              : 'PAN looks like ABCDE1234F — 5 letters, 4 digits, 1 letter.'}
          </p>
        </div>

        <div>
          <TextField
            label="GSTIN"
            placeholder="33ABCDE1234F1Z5"
            value={gstin}
            onChange={(e) => {
              clearStatus()
              setGstin(e.target.value.toUpperCase().slice(0, 15))
            }}
            disabled={busy || gstExempt}
            className={gstExempt ? 'opacity-60' : ''}
          />
          <p
            className={`mt-1.5 text-xs ${
              !gstinValid || panMismatch ? 'text-danger' : 'text-muted'
            }`}
          >
            {!gstinValid
              ? 'A GSTIN is 15 characters, e.g. 33ABCDE1234F1Z5.'
              : panMismatch
                ? "This GSTIN doesn't match the PAN above."
                : gstState
                  ? `Registered in ${gstState}.`
                  : 'Leave blank if you are not GST-registered.'}
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface-alt p-3.5">
          <input
            type="checkbox"
            checked={gstExempt}
            onChange={(e) => {
              clearStatus()
              setGstExempt(e.target.checked)
              if (e.target.checked) setGstin('')
            }}
            disabled={busy}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">
              I'm not registered for GST
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              Fine for small sellers supplying within their own state.
            </span>
          </span>
        </label>

        <TextField
          label="Registration number (optional)"
          placeholder="CIN, LLPIN, Udyam or shop licence"
          value={registrationNumber}
          onChange={(e) => {
            clearStatus()
            setRegistrationNumber(e.target.value)
          }}
          maxLength={60}
          disabled={busy}
        />

        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && <SuccessNote>Tax details saved.</SuccessNote>}
        <SaveButton busy={busy} disabled={false} />
      </form>
    </Card>
  )
}

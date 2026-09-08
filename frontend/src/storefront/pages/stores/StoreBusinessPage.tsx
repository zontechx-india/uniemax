import { useCallback, useEffect, useState } from 'react'
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
import type {
  StepKey,
  StoreAddress,
  StoreProfilePatch,
} from '../../features/stores/storeProfile'
import { useManagedStore } from '../../features/stores/useManagedStore'
import {
  SectionJumpBar,
  StatusBadge,
  sectionStatus,
  stepsByKey,
} from './SetupStatus'
import type { SectionStatus } from './SetupStatus'

/**
 * Business Details — the permanent home of everything the onboarding wizard
 * collects, plus the tax IDs a seller may have skipped.
 *
 * Three independent cards rather than one long form with a single Save. Each
 * saves only its own section (`PATCH /stores/:id/profile` is partial by key),
 * so a seller correcting a phone number never has to re-validate their
 * address, and a failure in one card cannot discard edits in another.
 *
 * Because the cards are independent, "am I done?" is three questions, not
 * one — and on a phone the answer to the third is two screens below the fold.
 * So every card carries its own status in its header, and a strip of chips
 * above them repeats all three and scrolls to whichever the seller taps. Both
 * render from `store.readiness` — the same server-computed registry the
 * publish and payment endpoints enforce — so the marks can never disagree
 * with what the server will accept. See `SetupStatus.tsx`.
 */

/**
 * The three cards, in page order. Each maps to one readiness step.
 *
 * The heading lives HERE rather than inside each card because two things
 * render it — the card's own header and its chip in the jump bar — and a chip
 * reading "Tax" above a card headed "Tax & compliance" makes the seller stop
 * and check whether they are the same section. One string, no drift.
 */
const SECTIONS: {
  id: string
  title: string
  description: string
  step: StepKey
}[] = [
  {
    id: 'business-contact',
    title: 'Business & contact',
    description: 'The trading entity and the person we reach about orders.',
    step: 'business',
  },
  {
    id: 'business-address',
    title: 'Address',
    description: 'Where your business is registered and operates from.',
    step: 'address',
  },
  {
    id: 'business-tax',
    title: 'Tax & compliance',
    description: 'Needed before UnieMax can collect payments and pay you out.',
    step: 'tax',
  },
]

export function StoreBusinessPage() {
  const { store, onStoreChange } = useManagedStore()

  // Unsaved edits live here rather than in each card because the chip strip
  // has to agree with the card it points at: readiness only moves once the
  // server confirms a save, so without this a chip would still read "1 of 4"
  // while the card below it says "Unsaved changes".
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const markDirty = useCallback((id: string, value: boolean) => {
    setDirty((current) =>
      current[id] === value ? current : { ...current, [id]: value },
    )
  }, [])

  // A new object per jump so tapping the same chip twice re-triggers the
  // highlight; a bare id would compare equal and the second tap would look
  // like nothing happened.
  const [flash, setFlash] = useState<{ id: string } | null>(null)

  useEffect(() => {
    if (!flash) return
    const timer = setTimeout(() => setFlash(null), 1400)
    return () => clearTimeout(timer)
  }, [flash])

  const jump = useCallback((id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    // `scroll-mt-28` on the card keeps the heading clear of both sticky bars.
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Keyboard and screen-reader users land IN the section, not back at the
    // top of the page on their next Tab. `preventScroll` because the smooth
    // scroll above already owns the movement.
    el.focus({ preventScroll: true })
    setFlash({ id })
  }, [])

  const status = (step: StepKey): SectionStatus =>
    sectionStatus(stepsByKey(store.readiness, [step]))

  const statuses = SECTIONS.map((section) => ({
    ...section,
    // The chip's label IS the card's heading — see SECTIONS.
    label: section.title,
    status: status(section.step),
    dirty: dirty[section.id] ?? false,
  }))

  const met = statuses.reduce((sum, s) => sum + s.status.met, 0)
  const total = statuses.reduce((sum, s) => sum + s.status.total, 0)
  const allComplete = statuses.every((s) => s.status.complete)
  const percent = total ? Math.round((met / total) * 100) : 100

  const cardProps = (id: string): CardStatusProps => {
    const section = statuses.find((s) => s.id === id)!
    return {
      id,
      title: section.title,
      description: section.description,
      status: section.status,
      dirty: section.dirty,
      flashing: flash?.id === id,
      onDirtyChange: markDirty,
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
          Business Details
        </h2>
        <span className="text-xs font-medium text-muted">
          {met} of {total} details added
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        Who's behind {store.name}, where you trade from, and the tax details we
        need before paying you out.
      </p>

      {/* The one number that survives a phone screen. The bar carries the
          animated gradient while anything is outstanding and settles to solid
          green when it is not — motion stops when the work does. */}
      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-alt"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Business details progress"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            allComplete ? 'bg-success' : 'bg-pending-gradient'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Deliberately NOT wrapped in a positioning div: a sticky element is
          confined to its parent's box, so a wrapper sized to the strip itself
          would let it unstick the moment it scrolled. Its parent has to be
          the page. */}
      <SectionJumpBar targets={statuses} onJump={jump} />

      <div className="mt-5 space-y-5">
        <ContactCard
          {...cardProps('business-contact')}
          store={store}
          onStoreChange={onStoreChange}
        />
        <AddressCard
          {...cardProps('business-address')}
          store={store}
          onStoreChange={onStoreChange}
        />
        <TaxCard
          {...cardProps('business-tax')}
          store={store}
          onStoreChange={onStoreChange}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared card chrome
// ---------------------------------------------------------------------------

/** What every card needs to render its own header. Supplied by `SECTIONS`. */
interface CardStatusProps {
  id: string
  title: string
  description: string
  status: SectionStatus
  dirty: boolean
  /** Briefly ringed because the seller just jumped here from a chip. */
  flashing: boolean
  onDirtyChange: (id: string, dirty: boolean) => void
}

function Card({
  id,
  title,
  description,
  status,
  dirty,
  flashing,
  children,
}: Omit<CardStatusProps, 'onDirtyChange'> & { children: ReactNode }) {
  return (
    <section
      id={id}
      // Focusable only programmatically (`jump`), never in the tab order.
      tabIndex={-1}
      className={`scroll-mt-28 rounded-lg border bg-surface p-4 shadow-floating outline-none transition duration-300 sm:p-5 ${
        flashing ? 'border-pending shadow-lifted' : 'border-line'
      }`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-body text-base font-semibold text-fg">{title}</h3>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <StatusBadge status={status} dirty={dirty} />
      </header>

      {/* Naming the missing fields beats a bare counter: "2 of 4 done" still
          leaves the seller hunting the form for which two. Hidden while there
          are unsaved edits, because it would then be describing the state the
          seller is in the middle of leaving. */}
      {!dirty && !status.complete && status.missing.length > 0 && (
        <p className="mt-3 rounded-md bg-pending-soft px-3 py-2 text-xs text-pending">
          <span className="font-semibold">Still needed: </span>
          {status.missing.join(' · ')}
        </p>
      )}

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
 * again (a stale "Saved." next to unsaved changes is worse than none), and
 * report unsaved-edit state up so the page's status chips stay honest.
 */
function useProfileSave(
  store: Store,
  onStoreChange: (store: Store) => void,
  section: { id: string; onDirtyChange: (id: string, dirty: boolean) => void },
): {
  busy: boolean
  error: string | null
  saved: boolean
  setError: (message: string | null) => void
  /** Call on every edit — clears the stale notes and flags unsaved changes. */
  markEdited: () => void
  save: (patch: StoreProfilePatch) => Promise<void>
} {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  const { id, onDirtyChange } = section
  useEffect(() => {
    onDirtyChange(id, dirty)
  }, [id, dirty, onDirtyChange])

  // A card that unmounts (the seller navigates away) must not leave a stale
  // "unsaved" flag behind on the page.
  useEffect(() => () => onDirtyChange(id, false), [id, onDirtyChange])

  return {
    busy,
    error,
    saved,
    setError,
    markEdited: () => {
      setSaved(false)
      setError(null)
      setDirty(true)
    },
    save: async (patch) => {
      setError(null)
      setBusy(true)
      try {
        onStoreChange(await storesApi.updateProfile(store.id, patch))
        setSaved(true)
        setDirty(false)
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
  onDirtyChange,
  ...card
}: {
  store: Store
  onStoreChange: (store: Store) => void
} & CardStatusProps) {
  const { profile } = store
  const { busy, error, saved, setError, markEdited, save } = useProfileSave(
    store,
    onStoreChange,
    { id: card.id, onDirtyChange },
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
    markEdited()
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
    <Card {...card}>
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
  onDirtyChange,
  ...card
}: {
  store: Store
  onStoreChange: (store: Store) => void
} & CardStatusProps) {
  const { profile } = store
  const { busy, error, saved, setError, markEdited, save } = useProfileSave(
    store,
    onStoreChange,
    { id: card.id, onDirtyChange },
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
    <Card {...card}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <AddressFields
          value={address}
          onChange={(next) => {
            markEdited()
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
  onDirtyChange,
  ...card
}: {
  store: Store
  onStoreChange: (store: Store) => void
} & CardStatusProps) {
  const { tax } = store.profile
  const { busy, error, saved, setError, markEdited, save } = useProfileSave(
    store,
    onStoreChange,
    { id: card.id, onDirtyChange },
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
    <Card {...card}>
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
              markEdited()
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
              markEdited()
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
              markEdited()
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
            markEdited()
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

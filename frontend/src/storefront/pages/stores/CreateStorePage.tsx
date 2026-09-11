import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { FormEvent } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { ImageEditDialog } from '../../../shared/media/ImageEditDialog'
import {
  acceptAttr,
  ruleHint,
  useMediaConfig,
  validateImageSource,
} from '../../../shared/media/mediaConfig'
import { ErrorNote, TextField } from '../../../shared/ui/form'
import { Wizard, WizardActions } from '../../../shared/ui/Wizard'
import type { WizardStep } from '../../../shared/ui/Wizard'
import { useGoBack } from '../../../shared/useGoBack'
import { storesApi } from '../../features/stores/storesApi'
import type { Store } from '../../features/stores/storesApi'
import { useStores } from '../../features/stores/useStores'
import { VerifyPhoneForm } from '../../../shared/auth/VerifyPhoneForm'
import { useCustomerSession } from '../../app/sessionContext'
import { useMarketSession } from '../../app/marketSession'
import { ArrowLeftIcon, CheckIcon, ImageIcon } from '../../layout/icons'

/**
 * Create Store — a two-step guided flow.
 *
 * Three decisions shape everything here.
 *
 * **Only what a shop needs to open is asked.** This used to be four steps —
 * address and tax details were steps 3 and 4 — and sellers were leaving
 * before the end. Neither is needed to sell: a cash-on-delivery shop never
 * touches them. They are collected later, in Business Details, and become
 * mandatory only when the seller adds a payout bank account — the first time
 * the platform actually has to know who it is paying and where they are.
 * The backend `PAYOUT_SETUP` gate enforces that; nothing here has to.
 *
 * **The store is created at the end of step 1, not at the end of step 2.**
 * Onboarding is therefore RESUMABLE: a seller who closes the tab on step 2
 * still owns a store, keeps what they typed, and is met by the setup
 * checklist on their dashboard listing exactly what is left.
 *
 * **Nothing is asked twice.** The server seeds the profile from the account
 * at creation, so step 2 opens with the seller's name, phone and email
 * already in place, and the business name pre-fills from the store name (the
 * same string, for most sole proprietors). What remains is genuinely new
 * information.
 *
 * Steps map 1:1 onto the `wizard: true` entries of the backend requirement
 * registry (`storeReadiness.ts`) — the same registry that decides whether the
 * store may publish — so the flow and the gate can never drift apart.
 */

type StepKey = 'store' | 'business'

const STEPS: (WizardStep & { key: StepKey })[] = [
  {
    key: 'store',
    title: 'Your store',
    blurb: 'The name and logo your customers will see.',
  },
  {
    key: 'business',
    title: 'Business & contact',
    blurb: "Who's selling, and how we reach you about orders.",
  },
]

export function CreateStorePage() {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)

  /**
   * Set once step 1 succeeds. Its presence is what makes every later step a
   * PATCH against a real row rather than more local state, and it is why
   * abandoning the flow is safe.
   */
  const [store, setStore] = useState<Store | null>(null)

  /**
   * The seller's existing stores, so an unfinished one can be offered for
   * resumption before a duplicate is created. Creating the store at step 1
   * is what makes onboarding resumable, but without this it also means every
   * abandoned run leaves a store behind, and "Create store" happily makes a
   * fourth "YouMax". `null` while loading; `useStores` resolves to `[]` on
   * failure, so a network error degrades to the plain wizard, never a wall.
   */
  const { stores } = useStores()
  const [startFresh, setStartFresh] = useState(false)
  const drafts = stores ? unfinishedDrafts(stores) : []
  const offerResume = !store && !startFresh && drafts.length > 0

  /**
   * Reached from the homepage, the account menu and the My Stores list, so
   * Back returns wherever the seller actually came from. Once the store
   * exists there is somewhere better to go — its dashboard.
   */
  const goBack = useGoBack('/')
  const finishLater = () =>
    store ? navigate(`/mystores/${store.slug}`) : goBack()

  const next = () => setIndex((i) => Math.min(i + 1, STEPS.length - 1))
  const back = () => setIndex((i) => Math.max(i - 1, 0))
  const done = (finished: Store) => navigate(`/mystores/${finished.slug}`)

  /** Adopt an existing draft and land on the first step it still needs. */
  const resume = (draft: Store) => {
    setStore(draft)
    setIndex(firstUnfinishedStep(draft) ?? 1)
  }

  const step = STEPS[index]!

  return (
    <div className="px-1 pb-10">
      <div className="mx-auto mb-3 flex w-full max-w-2xl items-center justify-between">
        <button
          type="button"
          onClick={index === 0 ? goBack : back}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </button>

        {/* An escape hatch on every step after the store exists. Leaving is
            not abandoning — the dashboard checklist carries the rest. */}
        {store && (
          <button
            type="button"
            onClick={finishLater}
            className="text-sm font-medium text-muted underline-offset-4 transition hover:text-fg hover:underline"
          >
            Finish later
          </button>
        )}
      </div>

      {stores === null ? (
        // Gated rather than rendered-then-swapped: flashing step 1 and then
        // replacing it with "resume this instead?" is worse than a beat of
        // nothing. The list is a handful of the seller's own rows.
        <p className="mx-auto w-full max-w-2xl py-12 text-center text-sm text-muted">
          Checking for unfinished stores…
        </p>
      ) : offerResume ? (
        <ResumePanel
          drafts={drafts}
          onResume={resume}
          onStartFresh={() => setStartFresh(true)}
        />
      ) : (
        <Wizard
          steps={STEPS}
          current={index}
          // Only backwards: moving forward has to clear that step's validation.
          onStepSelect={(i) => i < index && setIndex(i)}
        >
          {step.key === 'store' && (
            <StoreStep
              store={store}
              onDone={(created) => {
                setStore(created)
                next()
              }}
            />
          )}
          {step.key === 'business' && store && (
            <BusinessStep store={store} onDone={done} onBack={back} />
          )}
        </Wizard>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Resume an unfinished store
// ---------------------------------------------------------------------------

/**
 * The wizard index of the first step this store still has to do, or `null`
 * when the wizard is finished with it.
 *
 * Only wizard steps count. Address, tax and everything else the checklist
 * lists are finished from the dashboard, and coming back to "Create store"
 * with those open means the seller wants a second store — not to be nagged
 * about the first. And the `store` step is always complete for any store
 * that exists, since one cannot be created without a name and logo, so in
 * practice this is never 0.
 */
function firstUnfinishedStep(store: Store): number | null {
  const byKey = new Map(store.readiness.steps.map((s) => [s.key, s]))
  const index = STEPS.findIndex((step) => {
    const state = byKey.get(step.key)
    return state !== undefined && !state.complete && state.totalCount > 0
  })
  return index === -1 ? null : index
}

/**
 * Stores worth offering to resume: not yet live, with a wizard step still
 * open. A published store is never a draft, whatever its checklist says; a
 * store that only lacks checklist items finished the wizard as far as the
 * wizard cares.
 */
function unfinishedDrafts(stores: Store[]): Store[] {
  return stores.filter(
    (store) => !store.isPublished && firstUnfinishedStep(store) !== null,
  )
}

/**
 * Shown INSTEAD of step 1 when the seller already owns a store the wizard
 * never finished. Someone returning to "Create store" is far more likely to
 * be coming back to that one than wanting a duplicate of it — the three
 * identical "YouMax" cards that prompted this were test runs, not intent.
 * Starting fresh stays one click away and is never hidden.
 */
function ResumePanel({
  drafts,
  onResume,
  onStartFresh,
}: {
  drafts: Store[]
  onResume: (draft: Store) => void
  onStartFresh: () => void
}) {
  const one = drafts.length === 1
  return (
    <div className="mx-auto w-full max-w-2xl rounded-lg border border-line bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-fg">
        {one ? 'Pick up where you left off?' : 'You have unfinished stores'}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {one
          ? 'You started setting up a store but didn’t finish. Continue it, or start a new one.'
          : 'You started these but didn’t finish. Continue one, or start a new one.'}
      </p>

      <ul className="mt-4 divide-y divide-line">
        {drafts.map((draft) => {
          const nextStep = STEPS[firstUnfinishedStep(draft) ?? 1]!
          return (
            <li
              key={draft.id}
              className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              {draft.logoUrl ? (
                <img
                  src={draft.logoUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-md border border-line object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-line bg-surface-alt text-muted">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">
                  {draft.name}
                </p>
                <p className="truncate text-xs text-muted">
                  /store/{draft.slug} · Next: {nextStep.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onResume(draft)}
                className="h-9 shrink-0 rounded-md bg-brand-gradient px-3.5 text-sm font-semibold text-brand-contrast transition hover:opacity-90"
              >
                Continue
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 border-t border-line pt-4">
        <button
          type="button"
          onClick={onStartFresh}
          className="text-sm font-medium text-muted underline-offset-4 transition hover:text-fg hover:underline"
        >
          Start a new store instead
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step 1 — the store itself
// ---------------------------------------------------------------------------

/**
 * Name + logo, posted together as one multipart request so a store is never
 * written without its mark. Re-entering this step after the store exists
 * shows it as already done rather than creating a second one.
 */
function StoreStep({
  store,
  onDone,
}: {
  store: Store | null
  onDone: (store: Store) => void
}) {
  const config = useMediaConfig()
  const inputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(store?.name ?? '')
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [logo, setLogo] = useState<{ blob: Blob; filename: string } | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Revoke the previous object URL on replace and on unmount.
  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview)
    },
    [logoPreview],
  )

  const pick = (file: File | undefined) => {
    if (!file || !config) return
    setError(null)
    const problem = validateImageSource(file, config.logo)
    if (problem) return setError(problem)
    setCropFile(file)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    // Already created — this step is behind us, just move on.
    if (store) return onDone(store)

    if (!name.trim()) return setError('Please enter a store name.')
    if (!logo) return setError('Please add a store logo.')

    setError(null)
    setBusy(true)
    try {
      onDone(
        await storesApi.create({ name: name.trim() }, logo.blob, logo.filename),
      )
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const preview = logoPreview ?? store?.logoUrl ?? null

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <TextField
        label="Store name *"
        placeholder="e.g. Anwin's Sports Hub"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        disabled={busy || store !== null}
        autoFocus
      />

      <div>
        <span className="mb-2 block text-sm font-medium text-muted">
          Store logo *
        </span>
        <div className="flex items-center gap-4">
          {preview ? (
            <img
              src={preview}
              alt="Store logo preview"
              className="h-20 w-20 shrink-0 rounded-md border border-line object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border-2 border-dashed border-line bg-surface-alt text-muted">
              <ImageIcon className="h-7 w-7" />
            </div>
          )}
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy || !config || store !== null}
              className="h-9 rounded-md border border-line bg-surface px-3.5 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
            >
              {preview ? 'Replace' : 'Choose Logo'}
            </button>
            <p className="mt-1.5 text-xs text-muted">
              {config ? `Square logo · ${ruleHint(config.logo)}` : 'Loading…'}
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <WizardActions
        submitLabel={store ? 'Continue' : 'Create store'}
        busy={busy}
      />

      <input
        ref={inputRef}
        type="file"
        accept={config ? acceptAttr(config.logo) : 'image/*'}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {cropFile && (
        <ImageEditDialog
          file={cropFile}
          aspects={[{ label: 'Square', value: 1 }]}
          allowOriginal={false}
          title="Crop your logo"
          confirmLabel="Use this logo"
          onCancel={() => setCropFile(null)}
          onDone={(blob, filename) => {
            setLogo({ blob, filename })
            setLogoPreview(URL.createObjectURL(blob))
            setCropFile(null)
          }}
        />
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Step 2 — who is selling (the last step)
// ---------------------------------------------------------------------------

/**
 * Business name and seller name are free text — they are labels, and only the
 * seller knows them.
 *
 * The contact email and phone are NOT, and this step deliberately offers no
 * way to type them. They are shown as the seller's own VERIFIED account
 * identifiers, read-only, because these are the channels order notifications
 * and platform notices go to and shoppers see on the storefront: a number
 * nobody answers is worse than no number, and a free-text field is an
 * invitation to enter one. `assertVerifiedContact` on the server enforces the
 * same rule, so this is presentation of a constraint, not the constraint.
 *
 * A missing phone is the ordinary case — registration is by email, so most
 * sellers arrive without one — and it is fixed in place here rather than by
 * being sent to Settings and losing the flow.
 */
function BusinessStep({
  store,
  onDone,
  onBack,
}: {
  store: Store
  onDone: (store: Store) => void
  onBack: () => void
}) {
  const { profile } = store
  const { customer } = useCustomerSession()
  // Verifying a number updates the account; push the fresh copy into session
  // state so this step (and the rest of the authed tree) re-renders with it.
  const { signedIn } = useMarketSession()

  // Business name defaults to the store name — the same string for most sole
  // proprietors, and a one-word edit for everyone else.
  const [businessName, setBusinessName] = useState(
    profile.businessName ?? store.name,
  )
  const [sellerName, setSellerName] = useState(profile.sellerName ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const email = customer.emailVerifiedAt ? customer.email : null
  const phone = customer.phoneVerifiedAt ? customer.phone : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!businessName.trim()) return setError('Please enter your business name.')
    if (!sellerName.trim()) return setError('Please enter the seller name.')
    if (!phone) return setError('Please verify a mobile number to continue.')

    setError(null)
    setBusy(true)
    try {
      onDone(
        await storesApi.updateProfile(store.id, {
          businessName: businessName.trim(),
          sellerName: sellerName.trim(),
          phone,
          ...(email ? { email } : {}),
        }),
      )
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <TextField
        label="Business name *"
        placeholder="The name you trade under"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        maxLength={120}
        disabled={busy}
        autoFocus
      />
      <TextField
        label="Seller name *"
        placeholder="Who we should contact"
        value={sellerName}
        onChange={(e) => setSellerName(e.target.value)}
        maxLength={80}
        disabled={busy}
        autoComplete="name"
      />

      <div className="rounded-lg border border-line bg-surface-alt/60 p-4">
        <p className="text-sm font-medium text-fg">Contact details</p>
        <p className="mt-0.5 text-xs text-muted">
          Where we send order alerts, and what your customers see. These come
          from your verified account — they can&apos;t be typed in by hand.
        </p>

        <div className="mt-3 space-y-3">
          <ContactRow label="Email" value={email} />

          {phone ? (
            <ContactRow label="Mobile number" value={phone} />
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
      <WizardActions
        onBack={onBack}
        submitLabel="Finish setup"
        busy={busy}
        disabled={!phone}
      />
    </form>
  )
}

/** One read-only, already-verified contact identifier. */
function ContactRow({ label, value }: { label: string; value: string | null }) {
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


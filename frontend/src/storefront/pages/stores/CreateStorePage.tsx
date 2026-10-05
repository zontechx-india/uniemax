import { usePrivatePageTitle } from '../../../shared/seo'
import { colourFor, initialsOf, makeLetterLogo } from '../../../shared/media/letterLogo'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { FormEvent } from 'react'
import { trackStoreCreated } from '../../../shared/analytics/track'
import { toApiError } from '../../../shared/auth/http'
import { ImageEditDialog } from '../../../shared/media/ImageEditDialog'
import {
  acceptAttr,
  useMediaConfig,
  validateImageSource,
} from '../../../shared/media/mediaConfig'
import { ErrorNote, TextField } from '../../../shared/ui/form'
import { Wizard, WizardActions } from '../../../shared/ui/Wizard'
import type { WizardStep } from '../../../shared/ui/Wizard'
import { useGoBack } from '../../../shared/useGoBack'
import {
  STORE_NAME_MAX,
  previewStoreSlug,
  suggestedStoreName,
} from '../../features/selling/startSelling'
import { storesApi } from '../../features/stores/storesApi'
import type { Store } from '../../features/stores/storesApi'
import { useStores } from '../../features/stores/useStores'
import { VerifyPhoneForm } from '../../../shared/auth/VerifyPhoneForm'
import { useCustomerSession } from '../../app/sessionContext'
import { useMarketSession } from '../../app/marketSession'
import { ArrowLeftIcon, GlobeIcon, ImageIcon } from '../../layout/icons'
import { Button, buttonClass } from '../../../shared/ui/Button'
import { StatusPill } from './ui/StatusPill'
import { MediaImg } from '../../../shared/media/MediaImg'

/**
 * Create Store — a short guided flow: name → logo → about you.
 *
 * The shop itself used to be ONE step (name and logo together). For a seller
 * who does not read easily, two questions on one screen is two chances to
 * stall, so it is now one question per screen: "Name your shop" (with a live
 * preview of the shop's link) and "Add your logo" (skippable — a letter logo
 * is made from the name). Both still create the store in ONE request at the
 * end of the logo screen, so a store is never written without its mark.
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

type StepKey = 'name' | 'logo' | 'business'

/**
 * Screens, each tied to the backend readiness step it fills in. `name` and
 * `logo` are two screens of the registry's ONE `store` step — resuming and
 * the gate still reason in registry steps.
 */
const STEPS: (WizardStep & { key: StepKey; readinessKey: 'store' | 'business' })[] = [
  {
    key: 'name',
    readinessKey: 'store',
    title: 'Name your shop',
    blurb: 'This is the name your customers will see.',
  },
  {
    key: 'logo',
    readinessKey: 'store',
    title: 'Add your logo',
    blurb: 'A small picture for your shop. You can skip this and add it later.',
  },
  {
    key: 'business',
    readinessKey: 'business',
    title: 'About you',
    blurb: 'Who is selling, and how we reach you about orders.',
  },
]

/** Where a resumed draft lands when only the business screen is left. */
const BUSINESS_INDEX = STEPS.findIndex((step) => step.key === 'business')

export function CreateStorePage() {
  usePrivatePageTitle('Create your shop')
  const navigate = useNavigate()
  // A name the seller typed on /sell before signing up — pre-fills step 1.
  const initialName = suggestedStoreName(useLocation().state)
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
    setIndex(firstUnfinishedStep(draft) ?? BUSINESS_INDEX)
  }

  const step = STEPS[index]!

  return (
    <div className="px-1 pb-10">
      <div className="mx-auto mb-2 flex w-full max-w-2xl items-center justify-between">
        <button
          type="button"
          onClick={index === 0 ? goBack : back}
          className="-ml-2 inline-flex min-h-tap items-center gap-1.5 rounded-xl px-2 text-[15px] font-semibold text-muted transition hover:bg-fg/5 hover:text-fg"
        >
          <ArrowLeftIcon className="h-5 w-5" />
          Back
        </button>

        {/* An escape hatch on every step after the store exists. Leaving is
            not abandoning — the dashboard checklist carries the rest. */}
        {store && (
          <button
            type="button"
            onClick={finishLater}
            className="-mr-2 inline-flex min-h-tap items-center rounded-xl px-3 text-[15px] font-semibold text-muted transition hover:bg-fg/5 hover:text-fg"
          >
            Finish later
          </button>
        )}
      </div>

      {stores === null ? (
        // Gated rather than rendered-then-swapped: flashing step 1 and then
        // replacing it with "resume this instead?" is worse than a beat of
        // nothing. The list is a handful of the seller's own rows.
        <div
          aria-busy="true"
          aria-label="Checking for unfinished shops"
          className="glass mx-auto h-72 w-full max-w-2xl animate-pulse rounded-glass"
        />
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
          {/* One component for both screens, so the typed name and the
              chosen logo survive moving between them. */}
          {(step.key === 'name' || step.key === 'logo') && (
            <StoreStep
              part={step.key}
              store={store}
              initialName={initialName}
              onNext={next}
              onBack={back}
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
 * practice this is the business screen.
 */
function firstUnfinishedStep(store: Store): number | null {
  const byKey = new Map(store.readiness.steps.map((s) => [s.key, s]))
  const index = STEPS.findIndex((step) => {
    const state = byKey.get(step.readinessKey)
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
    <div className="glass mx-auto w-full max-w-2xl rounded-glass p-5 sm:p-7">
      <h2 className="font-heading text-[22px] leading-tight font-bold text-fg">
        {one ? 'Pick up where you left off?' : 'You have unfinished shops'}
      </h2>
      <p className="mt-1.5 text-[15px] leading-relaxed text-muted">
        {one
          ? 'You started setting up a shop but didn’t finish. Continue it, or start a new one.'
          : 'You started these but didn’t finish. Continue one, or start a new one.'}
      </p>

      <ul className="mt-5 divide-y divide-line">
        {drafts.map((draft) => {
          const nextStep = STEPS[firstUnfinishedStep(draft) ?? BUSINESS_INDEX]!
          return (
            <li
              key={draft.id}
              className="flex flex-wrap items-center gap-3 py-3.5 first:pt-0 last:pb-0"
            >
              {draft.logoUrl ? (
                <MediaImg
                  sizes="48px"
                  src={draft.logoUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <ImageIcon className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-fg">
                  {draft.name}
                </p>
                <p className="truncate text-hint text-muted">
                  Next: {nextStep.title}
                </p>
              </div>
              <Button
                type="button"
                size="lg"
                onClick={() => onResume(draft)}
                className="w-full sm:w-auto"
              >
                Continue
              </Button>
            </li>
          )
        })}
      </ul>

      <div className="mt-5 border-t border-line pt-4">
        <button
          type="button"
          onClick={onStartFresh}
          className={buttonClass({ variant: 'secondary', size: 'lg', full: true })}
        >
          Start a new shop instead
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Screens 1–2 — the shop itself (name, then logo)
// ---------------------------------------------------------------------------

/**
 * Name and logo, on two screens (`part`), posted together as ONE multipart
 * request at the end of the logo screen so a store is never written without
 * its mark. Re-entering either screen after the store exists shows it as
 * already done rather than creating a second one.
 *
 * `initialName` is a suggestion carried from the /sell page — it only fills
 * the field; the store is still created by the logo screen's own button.
 */
function StoreStep({
  part,
  store,
  initialName,
  onNext,
  onBack,
  onDone,
}: {
  part: 'name' | 'logo'
  store: Store | null
  initialName: string
  /** Name screen → logo screen. */
  onNext: () => void
  onBack: () => void
  onDone: (store: Store) => void
}) {
  const config = useMediaConfig()
  const inputRef = useRef<HTMLInputElement>(null)

  const [name, setName] = useState(store?.name ?? initialName)
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
    // Already created — these screens are behind us, just move on.
    if (store) return part === 'name' ? onNext() : onDone(store)

    if (!name.trim()) return setError('Please type a name for your shop.')
    setError(null)
    if (part === 'name') return onNext()

    setBusy(true)
    try {
      // No logo chosen → make a letter logo from the name rather than stop a
      // seller who has none; it can be replaced any time in Store Details.
      const mark = logo ?? {
        blob: await makeLetterLogo(name.trim()),
        filename: 'logo.png',
      }
      const created = await storesApi.create(
        { name: name.trim() },
        mark.blob,
        mark.filename,
      )
      trackStoreCreated()
      onDone(created)
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const preview = logoPreview ?? store?.logoUrl ?? null
  // The address the shop will get — a PREVIEW (the server appends -2, -3…
  // when a name is taken), and labelled as one.
  const slug = store?.slug ?? previewStoreSlug(name)

  return (
    <form onSubmit={submit} noValidate>
      {part === 'name' ? (
        <div className="space-y-4">
          <TextField
            label="Shop name"
            placeholder="e.g. Lakshmi Sarees"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={STORE_NAME_MAX}
            disabled={busy || store !== null}
            hint={
              store
                ? 'Your shop is already made. You can change its name later in Store Details.'
                : 'Use the name your customers know you by.'
            }
            autoFocus
          />

          {/* What the name becomes: the link the seller will share. */}
          <div className="glass-inset flex items-start gap-3 rounded-xl px-3.5 py-3">
            <GlobeIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div className="min-w-0">
              <p className="text-hint font-semibold text-fg">Your shop link</p>
              {slug ? (
                <>
                  <p className="mt-0.5 text-[15px] font-medium break-words text-fg">
                    {window.location.host}/store/
                    <span className="text-brand">{slug}</span>
                  </p>
                  {!store && (
                    <p className="mt-1 text-hint text-muted">
                      If this name is taken, a number is added at the end.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-0.5 text-hint text-muted">
                  Made from your shop name once you type it.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center text-center">
          {preview ? (
            <img
              src={preview}
              alt="Your logo"
              className="h-32 w-32 rounded-3xl object-cover shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]"
            />
          ) : (
            // What they get if they don't pick a photo — seen before saving.
            <div
              aria-hidden="true"
              className="flex h-32 w-32 items-center justify-center rounded-3xl text-4xl font-bold text-white shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)]"
              style={{ backgroundColor: colourFor(name.trim() || '?') }}
            >
              {initialsOf(name || '?')}
            </div>
          )}

          <p className="mt-3 max-w-xs text-hint text-muted">
            {preview
              ? 'This is your logo. A square photo works best.'
              : 'No photo? We will use these letters. You can change it any time.'}
          </p>

          {!store && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy || !config}
              className={buttonClass({
                variant: 'secondary',
                size: 'lg',
                className: 'mt-4 w-full px-6 sm:w-auto',
              })}
            >
              <ImageIcon className="h-5 w-5" />
              {preview ? 'Choose a different photo' : 'Choose a photo'}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <WizardActions
        onBack={part === 'logo' ? onBack : undefined}
        submitLabel={part === 'name' || store ? 'Next' : 'Create my shop'}
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
// Screen 3 — who is selling (the last step)
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

    setError(null)
    setBusy(true)
    try {
      onDone(
        await storesApi.updateProfile(store.id, {
          businessName: businessName.trim(),
          sellerName: sellerName.trim(),
          // A number is needed to PUBLISH, not to finish here — the checklist
          // carries it. Blocking this step on it used to throw away the names
          // above when a seller chose "Finish later".
          ...(phone ? { phone } : {}),
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
        label="Business name"
        placeholder="The name you trade under"
        hint="Often the same as your shop name. It goes on your bills."
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
        maxLength={120}
        disabled={busy}
        autoFocus
      />
      <TextField
        label="Your name"
        placeholder="e.g. Lakshmi Devi"
        hint="The person we contact about orders."
        value={sellerName}
        onChange={(e) => setSellerName(e.target.value)}
        maxLength={80}
        disabled={busy}
        autoComplete="name"
      />

      <div className="glass-inset rounded-xl p-4">
        <p className="text-[15px] font-semibold text-fg">How we reach you</p>
        <p className="mt-0.5 text-hint text-muted">
          New order alerts go here, and customers see them on your shop. They
          come from your account and are already verified.
        </p>

        <div className="mt-3 space-y-3">
          <ContactRow label="Email" value={email} />

          {phone ? (
            <ContactRow label="Mobile number" value={phone} />
          ) : (
            <div>
              <p className="mb-3 text-hint text-muted">
                Add your mobile number so we can tell you about new orders.
                You can also do this later — it is needed before your shop
                goes live.
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
        submitLabel="Finish"
        busy={busy}
      />
    </form>
  )
}

/** One read-only, already-verified contact identifier. */
function ContactRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-hint font-medium text-muted">{label}</p>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <p className="min-w-0 truncate text-[15px] font-medium text-fg">{value ?? '—'}</p>
        {value && <StatusPill tone="success">Verified</StatusPill>}
      </div>
    </div>
  )
}


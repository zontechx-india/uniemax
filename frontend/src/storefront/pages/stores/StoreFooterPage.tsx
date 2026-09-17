import { useState } from 'react'
import type { FormEvent, ReactNode, TextareaHTMLAttributes } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { ConfirmDialog } from '../../../shared/ui/ConfirmDialog'
import { ErrorNote, SuccessNote, TextField } from '../../../shared/ui/form'
import { SOCIAL_META } from '../../../shared/ui/socialIcons'
import {
  FOOTER_POLICY_KEYS,
  FOOTER_SOCIAL_KEYS,
  storesApi,
} from '../../features/stores/storesApi'
import type {
  FooterLink,
  FooterLocation,
  FooterPolicyKey,
  FooterSocialKey,
  StoreFooter,
  StoreFooterPatch,
} from '../../features/stores/storesApi'
import { useManagedStore } from '../../features/stores/useManagedStore'
import {
  ChevronDownIcon,
  MailIcon,
  MapPinIcon,
  PencilIcon,
  PhoneCallIcon,
  PlusIcon,
  TrashIcon,
} from '../../layout/icons'
import { LocationMapPicker } from './LocationMapPicker'

/**
 * Footer section of Store Management — everything the storefront footer
 * shows: business locations (with a Google Maps pin), social profiles, store
 * information, customer support, policy links, custom links and the
 * copyright line. Each card saves independently via
 * `PATCH /stores/:id/footer` (the payload carries only that card's section).
 */
export function StoreFooterPage({
  embedded = false,
}: {
  /**
   * Rendered inside the Store Builder's editor panel rather than as its own
   * management page: the page heading goes (the panel already names it) and
   * the cards stop self-capping, because the panel is already narrow.
   */
  embedded?: boolean
} = {}) {
  const { store } = useManagedStore()

  return (
    <div>
      {!embedded && (
        <>
          <h2 className="font-body text-xl font-semibold tracking-normal text-fg">
            Footer
          </h2>
          <p className="mt-1 text-sm text-muted">
            Everything shown in your storefront's footer — contact details,
            locations, social media and more. Each card saves on its own.
          </p>
        </>
      )}
      {embedded && (
        <p className="text-sm text-muted">
          Everything shown at the bottom of every page of your shop. Each card
          saves on its own.
        </p>
      )}

      <div className={`mt-5 space-y-4 ${embedded ? '' : 'max-w-2xl'}`}>
        <LocationsCard key={`loc-${store.id}`} />
        <SocialCard key={`soc-${store.id}`} />
        <InfoCard key={`info-${store.id}`} />
        <SupportCard key={`sup-${store.id}`} />
        <PoliciesCard key={`pol-${store.id}`} />
        <LinksCard key={`lnk-${store.id}`} />
        <CopyrightCard key={`cpy-${store.id}`} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared plumbing
// ---------------------------------------------------------------------------

/** Per-card save state over `storesApi.updateFooter` (one section at a time). */
function useFooterSave() {
  const { store, onStoreChange } = useManagedStore()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const save = async (patch: StoreFooterPatch): Promise<boolean> => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      onStoreChange(await storesApi.updateFooter(store.id, patch))
      setSaved(true)
      return true
    } catch (err) {
      setError(toApiError(err).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return { footer: store.footer, busy, error, saved, save, clearSaved: () => setSaved(false) }
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border border-line p-4 sm:p-5">
      <h3 className="font-body text-lg font-semibold tracking-normal text-fg">{title}</h3>
      <p className="mt-0.5 text-sm text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Themed multi-line input matching `TextField`'s visual language. */
function TextArea({
  label,
  className = '',
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-muted">{label}</span>
      <textarea
        className={`w-full rounded-md border border-line bg-input px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-muted hover:border-fg/30 focus:border-accent ${className}`}
        {...props}
      />
    </label>
  )
}

function SaveButton({ busy, dirty }: { busy: boolean; dirty: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy || !dirty}
      className="h-10 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
    >
      {busy ? 'Saving…' : 'Save'}
    </button>
  )
}

/** '' → null (the API stores empty optional fields as null). */
const orNull = (value: string): string | null => {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}
const fromNull = (value: string | null): string => value ?? ''

// ---------------------------------------------------------------------------
// Contact information — business locations
// ---------------------------------------------------------------------------

interface LocationDraft {
  label: string
  address: string
  contactPerson: string
  phone: string
  altPhone: string
  email: string
  hours: string
  isPrimary: boolean
  lat: number | null
  lng: number | null
}

const emptyLocationDraft = (isFirst: boolean): LocationDraft => ({
  label: '',
  address: '',
  contactPerson: '',
  phone: '',
  altPhone: '',
  email: '',
  hours: '',
  isPrimary: isFirst,
  lat: null,
  lng: null,
})

const toDraft = (location: FooterLocation): LocationDraft => ({
  label: fromNull(location.label),
  address: location.address,
  contactPerson: fromNull(location.contactPerson),
  phone: location.phone,
  altPhone: fromNull(location.altPhone),
  email: location.email,
  hours: fromNull(location.hours),
  isPrimary: location.isPrimary,
  lat: location.lat,
  lng: location.lng,
})

const fromDraft = (draft: LocationDraft, id: string | null): FooterLocation => ({
  id,
  label: orNull(draft.label),
  address: draft.address.trim(),
  contactPerson: orNull(draft.contactPerson),
  phone: draft.phone.trim(),
  altPhone: orNull(draft.altPhone),
  email: draft.email.trim(),
  hours: orNull(draft.hours),
  isPrimary: draft.isPrimary,
  lat: draft.lat,
  lng: draft.lng,
})

function LocationsCard() {
  const { footer, busy, error, saved, save } = useFooterSave()
  // 'new' → the add form; a location id → that row's edit form.
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<FooterLocation | null>(null)

  const locations = footer.locations

  const persist = async (next: FooterLocation[]): Promise<boolean> => {
    const ok = await save({ locations: next })
    if (ok) setEditing(null)
    return ok
  }

  const setPrimary = (id: string | null) => {
    void persist(
      locations.map((location) => ({
        ...location,
        isPrimary: location.id === id,
      })),
    )
  }

  const remove = async () => {
    if (!confirmDelete) return
    const ok = await persist(
      locations.filter((location) => location.id !== confirmDelete.id),
    )
    if (ok) setConfirmDelete(null)
  }

  return (
    <SectionCard
      title="Contact Information"
      description="Your business locations — shown in the footer with a View on Google Maps link."
    >
      {locations.length === 0 && editing !== 'new' && (
        <p className="rounded-md bg-surface-alt px-4 py-3 text-sm text-muted">
          No locations yet. Add your first business address so customers know
          where to find you.
        </p>
      )}

      <ul className="space-y-2">
        {locations.map((location) => (
          <li key={location.id ?? location.address}>
            {editing === location.id ? (
              <LocationForm
                initial={toDraft(location)}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSubmit={(draft) =>
                  void persist(
                    locations.map((row) =>
                      row.id === location.id
                        ? fromDraft(
                            draft,
                            location.id,
                          )
                        : draft.isPrimary
                          ? { ...row, isPrimary: false }
                          : row,
                    ),
                  )
                }
              />
            ) : (
              <div className="flex items-start gap-3 rounded-md border border-line p-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
                  <MapPinIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg">
                    {location.label || 'Business address'}
                    {location.isPrimary && (
                      <span className="ml-2 rounded-pill bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                        Primary
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {location.address}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                    <span className="inline-flex items-center gap-1">
                      <PhoneCallIcon className="h-3 w-3" /> {location.phone}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MailIcon className="h-3 w-3" /> {location.email}
                    </span>
                    {location.lat !== null && (
                      <span className="inline-flex items-center gap-1">
                        <MapPinIcon className="h-3 w-3" /> Pinned on map
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!location.isPrimary && (
                    <button
                      type="button"
                      onClick={() => setPrimary(location.id)}
                      disabled={busy}
                      className="rounded-md px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-alt hover:text-fg disabled:cursor-not-allowed"
                    >
                      Set primary
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing(location.id)}
                    disabled={busy}
                    aria-label="Edit location"
                    className="rounded-md p-1.5 text-muted transition hover:bg-surface-alt hover:text-fg disabled:cursor-not-allowed"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(location)}
                    disabled={busy}
                    aria-label="Delete location"
                    className="rounded-md p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing === 'new' ? (
        <div className="mt-2">
          <LocationForm
            initial={emptyLocationDraft(locations.length === 0)}
            busy={busy}
            onCancel={() => setEditing(null)}
            onSubmit={(draft) =>
              void persist([
                ...(draft.isPrimary
                  ? locations.map((row) => ({ ...row, isPrimary: false }))
                  : locations),
                fromDraft(draft, null),
              ])
            }
          />
        </div>
      ) : (
        locations.length < 10 && (
          <button
            type="button"
            onClick={() => setEditing('new')}
            disabled={busy}
            className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
          >
            <PlusIcon className="h-4 w-4" />
            Add Location
          </button>
        )
      )}

      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
      {saved && !editing && (
        <div className="mt-3"><SuccessNote>Locations saved.</SuccessNote></div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this location?"
        description={`"${confirmDelete?.label || confirmDelete?.address || ''}" will be removed from your storefront footer.`}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(null)}
      />
    </SectionCard>
  )
}

function LocationForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: LocationDraft
  busy: boolean
  onSubmit: (draft: LocationDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [problem, setProblem] = useState<string | null>(null)

  const set = <K extends keyof LocationDraft>(key: K, value: LocationDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.address.trim()) return setProblem('The full address is required.')
    if (!draft.phone.trim()) return setProblem('A mobile number is required.')
    if (!/^\+?[\d\s\-()]{5,20}$/.test(draft.phone.trim())) {
      return setProblem('The mobile number looks invalid.')
    }
    if (draft.altPhone.trim() && !/^\+?[\d\s\-()]{5,20}$/.test(draft.altPhone.trim())) {
      return setProblem('The alternate mobile number looks invalid.')
    }
    if (!/^\S+@\S+\.\S+$/.test(draft.email.trim())) {
      return setProblem('A valid email address is required.')
    }
    setProblem(null)
    onSubmit(draft)
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-md border border-accent/40 bg-surface-alt/50 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Branch / location name (optional)"
          value={draft.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Head Office"
          maxLength={80}
        />
        <TextField
          label="Contact person (optional)"
          value={draft.contactPerson}
          onChange={(e) => set('contactPerson', e.target.value)}
          placeholder="Rahul Sharma"
          maxLength={80}
        />
      </div>
      <TextArea
        label="Full address"
        value={draft.address}
        onChange={(e) => set('address', e.target.value)}
        placeholder="12/4 MG Road, Kochi, Kerala 682016"
        rows={3}
        maxLength={300}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Mobile number"
          value={draft.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="+91 98765 43210"
          inputMode="tel"
          maxLength={20}
        />
        <TextField
          label="Alternate mobile number (optional)"
          value={draft.altPhone}
          onChange={(e) => set('altPhone', e.target.value)}
          placeholder="+91 91234 56780"
          inputMode="tel"
          maxLength={20}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Email address"
          value={draft.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="hello@yourstore.com"
          type="email"
          maxLength={160}
        />
        <TextField
          label="Business hours (optional)"
          value={draft.hours}
          onChange={(e) => set('hours', e.target.value)}
          placeholder="Mon–Sat, 9 AM – 8 PM"
          maxLength={120}
        />
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-muted">
          Pin on Google Maps (optional)
        </span>
        <LocationMapPicker
          value={
            draft.lat !== null && draft.lng !== null
              ? { lat: draft.lat, lng: draft.lng }
              : null
          }
          onChange={(position) =>
            setDraft((d) => ({
              ...d,
              lat: position?.lat ?? null,
              lng: position?.lng ?? null,
            }))
          }
        />
      </div>

      <label className="flex items-center gap-2.5 text-sm text-fg">
        <input
          type="checkbox"
          checked={draft.isPrimary}
          onChange={(e) => set('isPrimary', e.target.checked)}
          className="h-4 w-4 accent-[var(--brand)]"
        />
        Set as primary address
      </label>

      {problem && <ErrorNote>{problem}</ErrorNote>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          {busy ? 'Saving…' : 'Save Location'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-10 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Social media
// ---------------------------------------------------------------------------

const LAUNCH_SOCIAL: FooterSocialKey[] = ['facebook', 'instagram', 'youtube']
const MORE_SOCIAL: FooterSocialKey[] = FOOTER_SOCIAL_KEYS.filter(
  (key) => !LAUNCH_SOCIAL.includes(key),
)

const SOCIAL_PLACEHOLDERS: Record<FooterSocialKey, string> = {
  facebook: 'https://facebook.com/yourstore',
  instagram: 'https://instagram.com/yourstore',
  youtube: 'https://youtube.com/@yourstore',
  whatsapp: '+91 98765 43210',
  x: 'https://x.com/yourstore',
  linkedin: 'https://linkedin.com/company/yourstore',
  telegram: 'https://t.me/yourstore',
  pinterest: 'https://pinterest.com/yourstore',
}

function SocialCard() {
  const { footer, busy, error, saved, save } = useFooterSave()
  const [values, setValues] = useState<Record<FooterSocialKey, string>>(() =>
    Object.fromEntries(
      FOOTER_SOCIAL_KEYS.map((key) => [key, fromNull(footer.social[key])]),
    ) as Record<FooterSocialKey, string>,
  )
  const [moreOpen, setMoreOpen] = useState(() =>
    MORE_SOCIAL.some((key) => footer.social[key]),
  )
  const [problem, setProblem] = useState<string | null>(null)

  const dirty = FOOTER_SOCIAL_KEYS.some(
    (key) => orNull(values[key]) !== footer.social[key],
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    for (const key of FOOTER_SOCIAL_KEYS) {
      const value = values[key].trim()
      if (!value) continue
      if (key === 'whatsapp') {
        if (!/^\+?[\d\s\-()]{5,20}$/.test(value)) {
          return setProblem('The WhatsApp number looks invalid.')
        }
      } else if (!/^https?:\/\/\S+$/i.test(value)) {
        return setProblem(
          `The ${SOCIAL_META[key].label} link must be a full URL starting with https://.`,
        )
      }
    }
    setProblem(null)
    void save({
      social: Object.fromEntries(
        FOOTER_SOCIAL_KEYS.map((key) => [key, orNull(values[key])]),
      ) as StoreFooter['social'],
    })
  }

  const field = (key: FooterSocialKey) => {
    const { label, Icon } = SOCIAL_META[key]
    return (
      <TextField
        key={key}
        label={key === 'whatsapp' ? `${label} number` : label}
        icon={<Icon className="h-[18px] w-[18px]" />}
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        placeholder={SOCIAL_PLACEHOLDERS[key]}
        inputMode={key === 'whatsapp' ? 'tel' : 'url'}
        maxLength={300}
      />
    )
  }

  return (
    <SectionCard
      title="Social Media"
      description="Profile links shown as icons in the footer. Leave a field empty to hide that platform."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {LAUNCH_SOCIAL.map(field)}

        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          className="inline-flex items-center gap-1 text-sm font-semibold text-brand transition hover:opacity-80"
        >
          More platforms (WhatsApp, X, LinkedIn…)
          <ChevronDownIcon
            className={`h-4 w-4 transition-transform ${moreOpen ? 'rotate-180' : ''}`}
          />
        </button>
        {moreOpen && <div className="space-y-4">{MORE_SOCIAL.map(field)}</div>}

        {(problem || error) && <ErrorNote>{problem ?? error}</ErrorNote>}
        {saved && !dirty && <SuccessNote>Social profiles saved.</SuccessNote>}
        <SaveButton busy={busy} dirty={dirty} />
      </form>
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Store information
// ---------------------------------------------------------------------------

function InfoCard() {
  const { footer, busy, error, saved, save } = useFooterSave()
  const [about, setAbout] = useState(fromNull(footer.info.about))
  const [year, setYear] = useState(
    footer.info.establishedYear === null ? '' : String(footer.info.establishedYear),
  )
  const [gst, setGst] = useState(fromNull(footer.info.gstNumber))
  const [reg, setReg] = useState(fromNull(footer.info.registrationNumber))
  const [problem, setProblem] = useState<string | null>(null)

  const yearValue = year.trim() === '' ? null : Number(year.trim())
  const dirty =
    orNull(about) !== footer.info.about ||
    yearValue !== footer.info.establishedYear ||
    orNull(gst) !== footer.info.gstNumber ||
    orNull(reg) !== footer.info.registrationNumber

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (
      yearValue !== null &&
      (!Number.isInteger(yearValue) || yearValue < 1800 || yearValue > 2100)
    ) {
      return setProblem('Established year must be a 4-digit year (e.g. 2005).')
    }
    setProblem(null)
    void save({
      info: {
        about: orNull(about),
        establishedYear: yearValue,
        gstNumber: orNull(gst),
        registrationNumber: orNull(reg),
      },
    })
  }

  return (
    <SectionCard
      title="Store Information"
      description="A short introduction and business identifiers for the footer."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextArea
          label="About Us (short business description)"
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          placeholder="Quality cricket gear for every player — from club nets to match day."
          rows={3}
          maxLength={600}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Business since / established year (optional)"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2005"
            inputMode="numeric"
            maxLength={4}
          />
          <TextField
            label="GST number (optional)"
            value={gst}
            onChange={(e) => setGst(e.target.value)}
            placeholder="32ABCDE1234F1Z5"
            maxLength={30}
          />
        </div>
        <TextField
          label="Business registration number (optional)"
          value={reg}
          onChange={(e) => setReg(e.target.value)}
          maxLength={60}
        />
        {(problem || error) && <ErrorNote>{problem ?? error}</ErrorNote>}
        {saved && !dirty && <SuccessNote>Store information saved.</SuccessNote>}
        <SaveButton busy={busy} dirty={dirty} />
      </form>
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Customer support
// ---------------------------------------------------------------------------

function SupportCard() {
  const { footer, busy, error, saved, save } = useFooterSave()
  const [email, setEmail] = useState(fromNull(footer.support.email))
  const [phone, setPhone] = useState(fromNull(footer.support.phone))
  const [whatsapp, setWhatsapp] = useState(fromNull(footer.support.whatsapp))
  const [hours, setHours] = useState(fromNull(footer.support.hours))

  const dirty =
    orNull(email) !== footer.support.email ||
    orNull(phone) !== footer.support.phone ||
    orNull(whatsapp) !== footer.support.whatsapp ||
    orNull(hours) !== footer.support.hours

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void save({
      support: {
        email: orNull(email),
        phone: orNull(phone),
        whatsapp: orNull(whatsapp),
        hours: orNull(hours),
      },
    })
  }

  return (
    <SectionCard
      title="Customer Support"
      description="How customers reach you for help — shown as its own footer block."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Support email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="support@yourstore.com"
            type="email"
            maxLength={160}
          />
          <TextField
            label="Support phone number"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            inputMode="tel"
            maxLength={20}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="WhatsApp support number"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+91 98765 43210"
            inputMode="tel"
            maxLength={20}
          />
          <TextField
            label="Business working hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="Mon–Sat, 9 AM – 8 PM"
            maxLength={120}
          />
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && !dirty && <SuccessNote>Customer support saved.</SuccessNote>}
        <SaveButton busy={busy} dirty={dirty} />
      </form>
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Store policies (pages arrive later — links are supported from day one)
// ---------------------------------------------------------------------------

const POLICY_LABELS: Record<FooterPolicyKey, string> = {
  privacy: 'Privacy Policy',
  terms: 'Terms & Conditions',
  shipping: 'Shipping Policy',
  returns: 'Return & Refund Policy',
  cancellation: 'Cancellation Policy',
}

function PoliciesCard() {
  const { footer, busy, error, saved, save } = useFooterSave()
  const [values, setValues] = useState<Record<FooterPolicyKey, string>>(() =>
    Object.fromEntries(
      FOOTER_POLICY_KEYS.map((key) => [key, fromNull(footer.policies[key])]),
    ) as Record<FooterPolicyKey, string>,
  )
  const [problem, setProblem] = useState<string | null>(null)

  const dirty = FOOTER_POLICY_KEYS.some(
    (key) => orNull(values[key]) !== footer.policies[key],
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    for (const key of FOOTER_POLICY_KEYS) {
      const value = values[key].trim()
      if (value && !/^https?:\/\/\S+$/i.test(value)) {
        return setProblem(
          `The ${POLICY_LABELS[key]} link must be a full URL starting with https://.`,
        )
      }
    }
    setProblem(null)
    void save({
      policies: Object.fromEntries(
        FOOTER_POLICY_KEYS.map((key) => [key, orNull(values[key])]),
      ) as StoreFooter['policies'],
    })
  }

  return (
    <SectionCard
      title="Store Policies"
      description="Dedicated policy pages are coming in a later update — until then you can link each policy to an externally hosted document. Empty policies are hidden."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {FOOTER_POLICY_KEYS.map((key) => (
          <TextField
            key={key}
            label={`${POLICY_LABELS[key]} URL (optional)`}
            value={values[key]}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
            placeholder="https://…"
            inputMode="url"
            maxLength={300}
          />
        ))}
        {(problem || error) && <ErrorNote>{problem ?? error}</ErrorNote>}
        {saved && !dirty && <SuccessNote>Policies saved.</SuccessNote>}
        <SaveButton busy={busy} dirty={dirty} />
      </form>
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Additional footer links
// ---------------------------------------------------------------------------

function LinksCard() {
  const { footer, busy, error, saved, save } = useFooterSave()
  const [rows, setRows] = useState<FooterLink[]>(() =>
    footer.links.map((link) => ({ ...link })),
  )
  const [problem, setProblem] = useState<string | null>(null)

  const dirty =
    rows.length !== footer.links.length ||
    rows.some(
      (row, i) =>
        row.label !== footer.links[i]?.label || row.url !== footer.links[i]?.url,
    )

  const setRow = (index: number, patch: Partial<FooterLink>) =>
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const cleaned = rows
      .map((row) => ({ label: row.label.trim(), url: row.url.trim() }))
      .filter((row) => row.label || row.url)
    for (const row of cleaned) {
      if (!row.label) return setProblem('Every link needs a label.')
      if (!/^(https?:\/\/\S+|\/\S*)$/i.test(row.url)) {
        return setProblem(
          `"${row.label}" needs a full URL (https://…) or a path starting with /.`,
        )
      }
    }
    setProblem(null)
    void save({ links: cleaned })
  }

  return (
    <SectionCard
      title="Additional Footer Links"
      description="Custom links such as About Us, Contact Us, FAQ, Careers or Blog."
    >
      <form onSubmit={submit} noValidate className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="w-2/5">
              <TextField
                label={index === 0 ? 'Label' : ''}
                value={row.label}
                onChange={(e) => setRow(index, { label: e.target.value })}
                placeholder="About Us"
                maxLength={40}
              />
            </div>
            <div className="flex-1">
              <TextField
                label={index === 0 ? 'URL' : ''}
                value={row.url}
                onChange={(e) => setRow(index, { url: e.target.value })}
                placeholder="https://… or /page"
                inputMode="url"
                maxLength={300}
              />
            </div>
            <button
              type="button"
              onClick={() => setRows((r) => r.filter((_, i) => i !== index))}
              disabled={busy}
              aria-label="Remove link"
              className="mb-1 rounded-md p-2.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}

        {rows.length < 10 && (
          <button
            type="button"
            onClick={() => setRows((r) => [...r, { label: '', url: '' }])}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3.5 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
          >
            <PlusIcon className="h-4 w-4" />
            Add Link
          </button>
        )}

        {(problem || error) && <ErrorNote>{problem ?? error}</ErrorNote>}
        {saved && !dirty && <SuccessNote>Links saved.</SuccessNote>}
        <div>
          <SaveButton busy={busy} dirty={dirty} />
        </div>
      </form>
    </SectionCard>
  )
}

// ---------------------------------------------------------------------------
// Copyright
// ---------------------------------------------------------------------------

function CopyrightCard() {
  const { store } = useManagedStore()
  const { footer, busy, error, saved, save } = useFooterSave()
  const [text, setText] = useState(fromNull(footer.copyrightText))

  const dirty = orNull(text) !== footer.copyrightText
  const defaultLine = `© ${new Date().getFullYear()} ${store.name}. All Rights Reserved.`

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void save({ copyrightText: orNull(text) })
  }

  return (
    <SectionCard
      title="Copyright"
      description="The line at the very bottom of the footer. Leave it empty to use the default."
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField
          label="Copyright text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={defaultLine}
          maxLength={120}
        />
        <p className="text-xs text-muted">
          Default: <span className="text-fg">{defaultLine}</span>
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        {saved && !dirty && <SuccessNote>Copyright saved.</SuccessNote>}
        <SaveButton busy={busy} dirty={dirty} />
      </form>
    </SectionCard>
  )
}

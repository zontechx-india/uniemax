import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ErrorNote, TextField } from '../../../shared/ui/form'
import type { AddressInput, CustomerAddress } from './addressesApi'
import { PHONE_HINT, PIN_HINT, isValidPhone, isValidPincode } from './pincode'
import { Button } from '../../../shared/ui/Button'

/**
 * Add/edit form for one address-book entry — used by the Saved Addresses
 * page and inline at checkout ("Add new address"). Always collects the FULL
 * field set: the book is store-agnostic, so an address must satisfy any
 * store's checkout configuration (only `email` and `label` are optional).
 *
 * `draftKey` (checkout): the half-typed address is kept in sessionStorage
 * under that key, so a refresh, a dropped connection or Back/Forward on a
 * phone doesn't wipe what the buyer typed. Cleared once it validates.
 */

type Draft = {
  label: string
  name: string
  phone: string
  email: string
  addressLine: string
  pincode: string
  state: string
  country: string
}

const DRAFT_PREFIX = 'um:address-draft:'

/** A saved in-progress draft for `key`, if any (storage may be blocked). */
export function readAddressDraft(key: string): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_PREFIX + key)
    return raw ? (JSON.parse(raw) as Draft) : null
  } catch {
    return null
  }
}

function writeAddressDraft(key: string, draft: Draft | null) {
  try {
    if (draft) sessionStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(draft))
    else sessionStorage.removeItem(DRAFT_PREFIX + key)
  } catch {
    // Private mode / storage full — the form still works, just unsaved.
  }
}
export function AddressForm({
  initial,
  defaults,
  busy,
  submitLabel = 'Save Address',
  onSubmit,
  onCancel,
  draftKey,
}: {
  initial?: CustomerAddress
  /**
   * Starting values for a NEW address (ignored when editing or restoring a
   * draft) — the signed-in customer's own name and verified phone, so a
   * first-time buyer isn't asked to retype what the account already knows.
   */
  defaults?: { name?: string | null; phone?: string | null; email?: string | null }
  draftKey?: string
  busy: boolean
  submitLabel?: string
  onSubmit: (input: AddressInput) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => (draftKey && !initial && readAddressDraft(draftKey)) || {
    label: initial?.label ?? '',
    name: initial?.name ?? defaults?.name ?? '',
    phone: initial?.phone ?? defaults?.phone ?? '',
    email: initial?.email ?? defaults?.email ?? '',
    addressLine: initial?.addressLine ?? '',
    pincode: initial?.pincode ?? '',
    state: initial?.state ?? '',
    country: initial?.country ?? 'India',
  })
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!draftKey || initial) return
    const typed = draft.name || draft.phone || draft.addressLine || draft.pincode || draft.state
    writeAddressDraft(draftKey, typed ? draft : null)
  }, [draftKey, initial, draft])

  const set = <K extends keyof typeof draft>(key: K, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.name.trim()) return setProblem('Name is required.')
    if (!isValidPhone(draft.phone, draft.country)) {
      return setProblem(PHONE_HINT)
    }
    const email = draft.email.trim()
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return setProblem('The email address looks invalid.')
    }
    if (!draft.addressLine.trim()) return setProblem('The address is required.')
    if (!isValidPincode(draft.pincode, draft.country)) {
      return setProblem(PIN_HINT)
    }
    if (!draft.state.trim()) return setProblem('State is required.')
    if (!draft.country.trim()) return setProblem('Country is required.')
    setProblem(null)
    if (draftKey) writeAddressDraft(draftKey, null)
    onSubmit({
      label: draft.label.trim() || null,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      email: email || null,
      addressLine: draft.addressLine.trim(),
      pincode: draft.pincode.trim(),
      state: draft.state.trim(),
      country: draft.country.trim(),
    })
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-md border border-accent/40 bg-surface-alt/50 p-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Full name"
          value={draft.name}
          onChange={(e) => set('name', e.target.value)}
          maxLength={100}
        />
        <TextField
          label="Label (optional)"
          value={draft.label}
          onChange={(e) => set('label', e.target.value)}
          placeholder="Home, Work…"
          maxLength={40}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Mobile number"
          value={draft.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="e.g. 98765 43210"
          inputMode="tel"
          type="tel"
          autoComplete="tel"
          maxLength={20}
        />
        <TextField
          label="Email (optional)"
          value={draft.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="e.g. you@example.com"
          type="email"
          autoComplete="email"
          maxLength={160}
        />
      </div>
      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">
          Address
        </span>
        <textarea
          value={draft.addressLine}
          onChange={(e) => set('addressLine', e.target.value)}
          placeholder="House no., street, area, city"
          autoComplete="street-address"
          rows={3}
          maxLength={300}
          className="w-full rounded-md border border-line bg-input px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-muted hover:border-fg/30 focus:border-accent"
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Pincode"
          value={draft.pincode}
          onChange={(e) => set('pincode', e.target.value)}
          placeholder="e.g. 682016"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={10}
        />
        <TextField
          label="State"
          value={draft.state}
          onChange={(e) => set('state', e.target.value)}
          placeholder="e.g. Kerala"
          autoComplete="address-level1"
          maxLength={100}
        />
        <TextField
          label="Country"
          value={draft.country}
          onChange={(e) => set('country', e.target.value)}
          maxLength={100}
        />
      </div>

      {problem && <ErrorNote>{problem}</ErrorNote>}

      <div className="flex gap-2">
        <Button type="submit" size="md" loading={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
        <button
          type="button"
          onClick={() => {
            if (draftKey) writeAddressDraft(draftKey, null)
            onCancel()
          }}
          disabled={busy}
          className="h-10 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

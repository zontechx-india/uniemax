import { useState } from 'react'
import type { FormEvent } from 'react'
import { ErrorNote, TextField } from '../../../shared/ui/form'
import type { AddressInput, CustomerAddress } from './addressesApi'
import { isValidPincode } from './pincode'

/**
 * Add/edit form for one address-book entry — used by the Saved Addresses
 * page and inline at checkout ("Add new address"). Always collects the FULL
 * field set: the book is store-agnostic, so an address must satisfy any
 * store's checkout configuration (only `email` and `label` are optional).
 */
export function AddressForm({
  initial,
  busy,
  submitLabel = 'Save Address',
  onSubmit,
  onCancel,
}: {
  initial?: CustomerAddress
  busy: boolean
  submitLabel?: string
  onSubmit: (input: AddressInput) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState({
    label: initial?.label ?? '',
    name: initial?.name ?? '',
    phone: initial?.phone ?? '',
    email: initial?.email ?? '',
    addressLine: initial?.addressLine ?? '',
    pincode: initial?.pincode ?? '',
    state: initial?.state ?? '',
    country: initial?.country ?? 'India',
  })
  const [problem, setProblem] = useState<string | null>(null)

  const set = <K extends keyof typeof draft>(key: K, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!draft.name.trim()) return setProblem('Name is required.')
    if (!/^\+?[\d\s\-()]{5,20}$/.test(draft.phone.trim())) {
      return setProblem('A valid phone number is required.')
    }
    const email = draft.email.trim()
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return setProblem('The email address looks invalid.')
    }
    if (!draft.addressLine.trim()) return setProblem('The address is required.')
    if (!isValidPincode(draft.pincode, draft.country)) {
      return setProblem('Enter a valid 6-digit PIN code.')
    }
    if (!draft.state.trim()) return setProblem('State is required.')
    if (!draft.country.trim()) return setProblem('Country is required.')
    setProblem(null)
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
          placeholder="+91 98765 43210"
          inputMode="tel"
          maxLength={20}
        />
        <TextField
          label="Email (optional)"
          value={draft.email}
          onChange={(e) => set('email', e.target.value)}
          placeholder="you@example.com"
          type="email"
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
          placeholder="House / street / area / city"
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
          placeholder="682016"
          inputMode="numeric"
          maxLength={10}
        />
        <TextField
          label="State"
          value={draft.state}
          onChange={(e) => set('state', e.target.value)}
          placeholder="Kerala"
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
        <button
          type="submit"
          disabled={busy}
          className="h-10 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast shadow-floating transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          {busy ? 'Saving…' : submitLabel}
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

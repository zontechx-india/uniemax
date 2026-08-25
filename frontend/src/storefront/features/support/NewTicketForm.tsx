import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { toApiError } from '../../../shared/auth/http'
import { ErrorNote, Select, TextField } from '../../../shared/ui/form'
import { CATEGORY_LABELS, supportApi } from './supportApi'
import type {
  SupportTicketDetail,
  TicketCategory,
  TicketCreateInput,
} from './supportApi'

/**
 * The raise-a-ticket form, shared by both entry points.
 *
 * `category` is the reporter's choice because it triages the queue before
 * anyone reads a word — and the **options** are passed in, since a seller and
 * a shopper have different problems (payouts vs. reporting a store). What is
 * deliberately *not* offered either way is **priority**: given the choice
 * everyone picks Urgent and the field stops sorting anything, so the platform
 * team sets it.
 *
 * Where it is **sent** is a prop too (`submitTo`), because the three flows
 * post to different endpoints: `storeId` names the store a UnieMax ticket is
 * *about*, while a message *to* a shop is created under that shop's path.
 * Defaulting to the UnieMax endpoint keeps the common case a one-liner.
 */

const MESSAGE_FIELD =
  'w-full rounded-md border border-line bg-input px-4 py-3 text-sm text-fg outline-none transition-colors placeholder:text-muted hover:border-fg/30 focus:border-accent'

export function NewTicketForm({
  categories,
  storeId,
  intro,
  subjectPlaceholder,
  defaultEmail,
  defaultPhone,
  onCancel,
  onCreated,
  submitTo = supportApi.create,
}: {
  categories: TicketCategory[]
  /** Store id or slug the UnieMax ticket is ABOUT — omit for account-level. */
  storeId?: string
  intro: ReactNode
  subjectPlaceholder: string
  defaultEmail: string
  defaultPhone: string
  onCancel: () => void
  onCreated: (ticket: SupportTicketDetail) => void
  /** Where to POST. Defaults to a ticket for the UnieMax team. */
  submitTo?: (input: TicketCreateInput) => Promise<SupportTicketDetail>
}) {
  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<TicketCategory>(categories[0] ?? 'OTHER')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState(defaultEmail)
  const [phone, setPhone] = useState(defaultPhone)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onCreated(
        await submitTo({
          subject: subject.trim(),
          category,
          message: message.trim(),
          storeId: storeId ?? null,
          contactEmail: email.trim() || null,
          contactPhone: phone.trim() || null,
        }),
      )
    } catch (err) {
      setError(toApiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-lg border border-line p-4">
      <p className="text-sm text-muted">{intro}</p>

      <TextField
        label="Subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder={subjectPlaceholder}
        maxLength={150}
        required
      />

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">
          What is it about?
        </span>
        <Select
          className="h-12"
          value={category}
          onChange={(event) => setCategory(event.target.value as TicketCategory)}
        >
          {categories.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </Select>
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-medium text-muted">Details</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={6}
          minLength={10}
          maxLength={4000}
          required
          placeholder="Describe the issue, including anything you already tried."
          className={MESSAGE_FIELD}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Reply-to email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />
        <TextField
          label="Phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="+91…"
        />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-11 rounded-md bg-brand-gradient px-5 text-sm font-semibold text-brand-contrast transition hover:opacity-90 disabled:cursor-not-allowed disabled:bg-none disabled:bg-line disabled:text-muted"
        >
          {busy ? 'Sending…' : 'Submit ticket'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="h-11 rounded-md border border-line px-5 text-sm font-semibold text-fg transition hover:bg-surface-alt disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

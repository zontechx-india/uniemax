import { useEffect, useId, useState } from 'react'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { FIELD_LABEL, fieldClass, fieldNoteClass } from '../../../../shared/ui/field'
import { ErrorNote, InfoNote, Select, TextField } from '../../../../shared/ui/form'
import { MAX_CUSTOM_ANSWER } from '../../../features/stores/storesApi'
import type {
  CheckoutCustomField,
  OrderAddressInput,
  PlacedOrder,
} from '../../../features/stores/storesApi'

/**
 * "Edit address" — the seller corrects the delivery address after the
 * customer gave an incomplete one (usually after a phone call).
 *
 * Only the address: name, phone and email stay as the customer gave them.
 * The store's own delivery questions (Post Office, Tehsil…) are part of the
 * address, so they are edited here too — as asked today, plus any old answer
 * whose question was since removed. Nothing about money changes.
 */

interface Question {
  id: string
  label: string
  type: CheckoutCustomField['type']
  choices: string[]
  required: boolean
}

interface Errors {
  address?: string
  pincode?: string
  answers?: string
}

export function AddressDialog({
  open,
  order,
  questions,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean
  order: PlacedOrder
  /** The store's checkout questions today (only DELIVERY ones are used). */
  questions: CheckoutCustomField[]
  busy: boolean
  error: string | null
  onSubmit: (input: OrderAddressInput) => void
  onClose: () => void
}) {
  const formId = useId()
  const addressId = useId()
  const [address, setAddress] = useState('')
  const [pincode, setPincode] = useState('')
  const [state, setState] = useState('')
  const [country, setCountry] = useState('')
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Errors>({})

  const oldAnswers = order.customFields.filter((a) => a.section === 'DELIVERY')
  const asked = questions.filter((q) => q.section === 'DELIVERY')
  const fields: Question[] = [
    ...asked.map((q) => ({
      id: q.id,
      // The order keeps the label the customer saw.
      label: oldAnswers.find((a) => a.id === q.id)?.label ?? q.label,
      type: q.type,
      choices: q.choices,
      required: q.required,
    })),
    ...oldAnswers
      .filter((a) => !asked.some((q) => q.id === a.id))
      .map((a) => ({ id: a.id, label: a.label, type: 'TEXT' as const, choices: [], required: false })),
  ]

  // A fresh form, filled with the address as it is now, every time it opens.
  useEffect(() => {
    if (!open) return
    setAddress(order.addressLine ?? '')
    setPincode(order.pincode ?? '')
    setState(order.state ?? '')
    setCountry(order.country ?? '')
    setAnswers(
      Object.fromEntries(
        order.customFields.filter((a) => a.section === 'DELIVERY').map((a) => [a.id, a.value]),
      ),
    )
    setErrors({})
  }, [open, order])

  const submit = () => {
    const next: Errors = {}
    if (address.trim().length < 5) next.address = 'Type the full address'
    if (!pincode.trim()) next.pincode = 'Pincode is required'
    const missing = fields.find((f) => f.required && !(answers[f.id] ?? '').trim())
    if (missing) next.answers = `${missing.label} is required`
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSubmit({
      address: address.trim(),
      pincode: pincode.trim(),
      state: state.trim() || null,
      country: country.trim() || null,
      answers: Object.fromEntries(fields.map((f) => [f.id, (answers[f.id] ?? '').trim()])),
    })
  }

  return (
    <Dialog
      open={open}
      title="Edit delivery address"
      subtitle="Your customer is told about the new address. The old one stays in this order’s history."
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={onClose}>
            Go back
          </Button>
          <Button type="submit" form={formId} variant="ink" size="lg" loading={busy}>
            {busy ? 'Saving…' : 'Save address'}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        {error && <ErrorNote>{error}</ErrorNote>}
        {order.status === 'SHIPPED' && (
          <InfoNote>This order is already sent. Tell your courier about the new address too.</InfoNote>
        )}

        <label className="block" htmlFor={addressId}>
          <span className={FIELD_LABEL}>Address</span>
          <textarea
            id={addressId}
            value={address}
            rows={3}
            maxLength={300}
            autoComplete="off"
            placeholder="House number, street, area, landmark, town"
            onChange={(e) => {
              setAddress(e.target.value)
              setErrors((prev) => ({ ...prev, address: undefined }))
            }}
            aria-invalid={errors.address ? true : undefined}
            className={fieldClass({ multiline: true, invalid: Boolean(errors.address), className: 'resize-none' })}
          />
          {errors.address && (
            <span role="alert" className={fieldNoteClass(true)}>
              {errors.address}
            </span>
          )}
        </label>

        <TextField
          label="State"
          value={state}
          maxLength={100}
          autoComplete="off"
          onChange={(e) => setState(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Pincode"
            value={pincode}
            maxLength={10}
            inputMode="numeric"
            autoComplete="off"
            onChange={(e) => {
              setPincode(e.target.value)
              setErrors((prev) => ({ ...prev, pincode: undefined }))
            }}
            error={errors.pincode}
          />
          <TextField
            label="Country"
            value={country}
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setCountry(e.target.value)}
          />
        </div>

        {fields.length > 0 && (
          <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            {fields.map((f) => {
              const label = f.required ? f.label : `${f.label} (optional)`
              const value = answers[f.id] ?? ''
              const change = (v: string) => {
                setAnswers((prev) => ({ ...prev, [f.id]: v }))
                setErrors((prev) => ({ ...prev, answers: undefined }))
              }
              if (f.type === 'CHOICE') {
                return (
                  <label key={f.id} className="block">
                    <span className={FIELD_LABEL}>{label}</span>
                    <Select value={value} onChange={(e) => change(e.target.value)} className="h-12">
                      <option value="">Choose…</option>
                      {/* An old answer that is no longer a choice stays pickable. */}
                      {value && !f.choices.includes(value) && <option value={value}>{value}</option>}
                      {f.choices.map((choice) => (
                        <option key={choice} value={choice}>
                          {choice}
                        </option>
                      ))}
                    </Select>
                  </label>
                )
              }
              return (
                <TextField
                  key={f.id}
                  label={label}
                  value={value}
                  maxLength={MAX_CUSTOM_ANSWER}
                  autoComplete="off"
                  inputMode={f.type === 'NUMBER' ? 'decimal' : undefined}
                  onChange={(e) => change(e.target.value)}
                />
              )
            })}
          </div>
        )}
        {errors.answers && <ErrorNote>{errors.answers}</ErrorNote>}
      </form>
    </Dialog>
  )
}

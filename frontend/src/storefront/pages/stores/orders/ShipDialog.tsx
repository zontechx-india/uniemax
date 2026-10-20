import { useEffect, useId, useState } from 'react'
import { toApiError } from '../../../../shared/auth/http'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { FIELD_LABEL, fieldNoteClass } from '../../../../shared/ui/field'
import { ErrorNote, InfoNote, Select, TextField } from '../../../../shared/ui/form'
import { courierApi } from '../../../features/stores/storesApi'
import type { Courier, OrderShipment, ShipmentTrackingInput } from '../../../features/stores/storesApi'

/**
 * The courier + tracking sheet — "Mark as sent", "Add tracking", "Send
 * again" and "Edit tracking" are all this one form.
 *
 * The courier is a required pick with nothing pre-selected. The tracking
 * number is optional on a seller's own parcel (some hand-deliver locally) but
 * nudged for, because the customer gets it the moment the parcel is sent.
 * The link is whatever the courier gave the seller — UnieMax never guesses a
 * courier's tracking URL.
 */

const NUMBER_PATTERN = /^[A-Za-z0-9-]+$/

interface Errors {
  courier?: string
  name?: string
  number?: string
  link?: string
}

export function ShipDialog({
  open,
  title,
  submitLabel,
  parcel = null,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean
  title: string
  submitLabel: string
  /** Pre-fills the form when correcting a parcel's tracking. */
  parcel?: OrderShipment | null
  busy: boolean
  error: string | null
  onSubmit: (input: ShipmentTrackingInput) => void
  onClose: () => void
}) {
  const formId = useId()
  const [couriers, setCouriers] = useState<Courier[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [link, setLink] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  // Fresh form every time the sheet opens (pre-filled when editing).
  useEffect(() => {
    if (!open) return
    setCode(parcel ? (parcel.carrierCode ?? 'other') : '')
    setName(parcel && !parcel.carrierCode ? parcel.carrier : '')
    setNumber(parcel?.trackingNumber ?? '')
    setLink(parcel?.trackingUrl ?? '')
    setErrors({})
    courierApi
      .list()
      .then((list) => {
        setCouriers(list)
        setLoadError(null)
      })
      .catch((err) => setLoadError(toApiError(err).message))
  }, [open, parcel])

  const courier = couriers?.find((c) => c.code === code) ?? null
  const own = code === 'self'
  const typed = code === 'other'

  const submit = () => {
    const next: Errors = {}
    const cleanNumber = number.replace(/\s+/g, '')
    const cleanLink = link.trim()
    if (!code) next.courier = 'Choose the courier'
    if (typed && !name.trim()) next.name = "Type the courier's name"
    if (!own && cleanNumber) {
      if (cleanNumber.length < 4 || cleanNumber.length > 40) {
        next.number = 'A tracking number has 4 to 40 characters'
      } else if (!NUMBER_PATTERN.test(cleanNumber)) {
        next.number = 'Use only letters, numbers and dashes'
      }
    }
    if (!own && cleanLink && !/^https?:\/\//i.test(cleanLink)) {
      next.link = 'The link must start with https://'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return
    onSubmit({
      carrierCode: code,
      carrierName: typed ? name.trim() : null,
      trackingNumber: own ? null : cleanNumber || null,
      trackingUrl: own ? null : cleanLink || null,
    })
  }

  return (
    <Dialog
      open={open}
      title={title}
      subtitle="Your customer gets this straight away by email and notification."
      onClose={() => {
        if (!busy) onClose()
      }}
      footer={
        <>
          <Button type="button" variant="secondary" size="lg" disabled={busy} onClick={onClose}>
            Go back
          </Button>
          <Button type="submit" form={formId} variant="primary" size="lg" loading={busy}>
            {busy ? 'Please wait…' : submitLabel}
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
        {loadError && <ErrorNote>{loadError}</ErrorNote>}

        <label className="block">
          <span className={FIELD_LABEL}>Courier</span>
          <Select
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              setErrors((prev) => ({ ...prev, courier: undefined }))
            }}
            className="h-12"
            aria-invalid={errors.courier ? true : undefined}
            disabled={!couriers}
          >
            <option value="" disabled>
              {couriers ? 'Choose the courier' : 'Loading couriers…'}
            </option>
            {couriers?.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code === 'other' ? 'Other (type the name)' : c.name}
              </option>
            ))}
          </Select>
          {errors.courier && (
            <span role="alert" className={fieldNoteClass(true)}>
              {errors.courier}
            </span>
          )}
        </label>

        {typed && (
          <TextField
            label="Courier name"
            value={name}
            maxLength={60}
            autoComplete="off"
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
          />
        )}

        {own && (
          <InfoNote>
            You or your staff deliver it, so there is no tracking number. Your
            customer is told you are delivering it yourselves.
          </InfoNote>
        )}

        {code && !own && courier?.tracking !== false && (
          <>
            <TextField
              label="Tracking number"
              value={number}
              maxLength={60}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="As printed on the courier receipt"
              onChange={(e) => setNumber(e.target.value)}
              error={errors.number}
              hint="Add it so your customer can follow the parcel."
            />
            <TextField
              label="Tracking link (optional)"
              value={link}
              maxLength={500}
              autoComplete="off"
              inputMode="url"
              spellCheck={false}
              placeholder="https://"
              onChange={(e) => setLink(e.target.value)}
              error={errors.link}
              hint="Paste the link your courier gave you, if you have one."
            />
          </>
        )}
      </form>
    </Dialog>
  )
}

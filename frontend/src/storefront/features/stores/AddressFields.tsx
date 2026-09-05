import { Select, TextField } from '../../../shared/ui/form'
import {
  DEFAULT_COUNTRY,
  EMPTY_ADDRESS,
  INDIAN_STATES,
  PINCODE_RE,
} from './storeProfile'
import type { StoreAddress } from './storeProfile'

/**
 * The canonical address form — one component wherever a structured address is
 * collected (business address, pickup address, and the footer locations when
 * they migrate onto the same shape).
 *
 * Field order follows how the address is *spoken*, not how it is stored:
 * street first, then the PIN code, then city and state. PIN code sits above
 * city/state because it is the field a seller knows by heart and the one that
 * will later auto-fill the two below it — putting it after them would make
 * that lookup feel like a correction rather than a shortcut.
 *
 * Responsive: one column on a phone, and a 2-col grid from `sm` where the
 * pairs (PIN + city, state + country) genuinely fit side by side.
 */

export interface AddressErrors {
  line1?: string
  city?: string
  state?: string
  pincode?: string
}

/** Field-level validation, shared by every caller so messages never diverge. */
export function validateAddress(address: StoreAddress): AddressErrors {
  const errors: AddressErrors = {}
  if (!address.line1.trim()) errors.line1 = 'Address is required'
  if (!address.city.trim()) errors.city = 'City is required'
  if (!address.state.trim()) errors.state = 'Select a state'
  if (!PINCODE_RE.test(address.pincode.trim())) {
    errors.pincode = 'Enter a valid 6-digit PIN code'
  }
  return errors
}

export function AddressFields({
  value,
  onChange,
  errors = {},
  disabled = false,
  idPrefix = 'address',
}: {
  value: StoreAddress | null
  onChange: (address: StoreAddress) => void
  errors?: AddressErrors
  disabled?: boolean
  /** Keeps ids unique when two address forms share a page. */
  idPrefix?: string
}) {
  const address = value ?? EMPTY_ADDRESS
  const set = <K extends keyof StoreAddress>(
    key: K,
    fieldValue: StoreAddress[K],
  ) => onChange({ ...address, [key]: fieldValue })

  return (
    <div className="space-y-4">
      <Field error={errors.line1}>
        <TextField
          label="Street address *"
          id={`${idPrefix}-line1`}
          placeholder="Shop / building, street"
          value={address.line1}
          onChange={(e) => set('line1', e.target.value)}
          maxLength={200}
          disabled={disabled}
          autoComplete="address-line1"
        />
      </Field>

      <TextField
        label="Area, landmark (optional)"
        id={`${idPrefix}-line2`}
        placeholder="Locality or a nearby landmark"
        value={address.line2 ?? ''}
        onChange={(e) => set('line2', e.target.value || null)}
        maxLength={200}
        disabled={disabled}
        autoComplete="address-line2"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={errors.pincode}>
          <TextField
            label="PIN code *"
            id={`${idPrefix}-pincode`}
            placeholder="600001"
            value={address.pincode}
            // Digits only, capped at six — a numeric keypad on mobile and no
            // way to type a value the server would reject.
            onChange={(e) =>
              set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))
            }
            inputMode="numeric"
            disabled={disabled}
            autoComplete="postal-code"
          />
        </Field>

        <Field error={errors.city}>
          <TextField
            label="City *"
            id={`${idPrefix}-city`}
            placeholder="Chennai"
            value={address.city}
            onChange={(e) => set('city', e.target.value)}
            maxLength={80}
            disabled={disabled}
            autoComplete="address-level2"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field error={errors.state}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-muted">
              State *
            </span>
            <Select
              id={`${idPrefix}-state`}
              className="h-12"
              value={address.state}
              onChange={(e) => set('state', e.target.value)}
              disabled={disabled}
            >
              <option value="">Select a state</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </Select>
          </label>
        </Field>

        {/* India-only today. Rendered read-only rather than hidden so the
            address never looks like it is missing a piece, and so the field
            is already in place when a second country is supported. */}
        <TextField
          label="Country"
          id={`${idPrefix}-country`}
          value={address.country || DEFAULT_COUNTRY}
          readOnly
          disabled={disabled}
          className="cursor-not-allowed opacity-70"
        />
      </div>
    </div>
  )
}

/** Wraps a control with its inline error, keeping spacing consistent. */
function Field({
  error,
  children,
}: {
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      {children}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

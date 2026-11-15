/**
 * Business profile, canonical address and store readiness — the client's
 * mirror of `backend/src/modules/stores/storeProfile.schema.ts`,
 * `storeAddress.schema.ts` and `storeReadiness.ts`.
 *
 * The server is always the authority: it validates every write and computes
 * `readiness` on every store response. What lives here is what the client
 * needs to render the same thing without a round trip per keystroke — the
 * field shapes, the format rules used for inline validation, and the labels
 * for the step UI. Keep the regexes and the state list in lockstep with the
 * backend; if the two ever disagree, the server wins and the seller sees its
 * message.
 */

// ---------------------------------------------------------------------------
// Address
// ---------------------------------------------------------------------------

export interface StoreAddress {
  line1: string
  line2: string | null
  city: string
  state: string
  pincode: string
  country: string
  lat: number | null
  lng: number | null
}

export const DEFAULT_COUNTRY = 'India'

/** Mirror of `INDIAN_STATES` — the options in the state picker. */
export const INDIAN_STATES = [
  'Andaman and Nicobar Islands',
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chandigarh',
  'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jammu and Kashmir',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Ladakh',
  'Lakshadweep',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Puducherry',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
] as const

export const EMPTY_ADDRESS: StoreAddress = {
  line1: '',
  line2: null,
  city: '',
  state: '',
  pincode: '',
  country: DEFAULT_COUNTRY,
  lat: null,
  lng: null,
}

export const PINCODE_RE = /^[1-9]\d{5}$/
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/**
 * The first two digits of a GSTIN are the state code. Mapping them lets the
 * form tell a seller their GSTIN belongs to a different state than the one
 * they picked — the single most common reason a GSTIN is rejected later.
 */
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
}

/**
 * The states a PIN code can belong to, from its first two digits (India
 * Post's postal regions). Border regions list every state they cover, so a
 * PIN is never flagged wrong just because it sits near a state line. Empty
 * for a prefix not listed — callers then say nothing.
 *
 * Offline on purpose: it fills the state and catches "PIN 600001 but state
 * Kerala" with no outside service. It cannot name the city — that needs a
 * full PIN directory.
 */
const PIN_PREFIX_STATES: Record<string, string[]> = {
  '11': ['Delhi'],
  '12': ['Haryana'],
  '13': ['Haryana', 'Punjab'],
  '14': ['Punjab'],
  '15': ['Punjab'],
  '16': ['Punjab', 'Chandigarh', 'Haryana'],
  '17': ['Himachal Pradesh'],
  '18': ['Jammu and Kashmir'],
  '19': ['Jammu and Kashmir', 'Ladakh'],
  '20': ['Uttar Pradesh'],
  '21': ['Uttar Pradesh'],
  '22': ['Uttar Pradesh'],
  '23': ['Uttar Pradesh'],
  '24': ['Uttar Pradesh', 'Uttarakhand'],
  '25': ['Uttar Pradesh'],
  '26': ['Uttarakhand', 'Uttar Pradesh'],
  '27': ['Uttar Pradesh'],
  '28': ['Uttar Pradesh'],
  '30': ['Rajasthan'],
  '31': ['Rajasthan'],
  '32': ['Rajasthan'],
  '33': ['Rajasthan'],
  '34': ['Rajasthan'],
  '36': ['Gujarat'],
  '37': ['Gujarat'],
  '38': ['Gujarat'],
  '39': ['Gujarat', 'Dadra and Nagar Haveli and Daman and Diu'],
  '40': ['Maharashtra', 'Goa'],
  '41': ['Maharashtra'],
  '42': ['Maharashtra'],
  '43': ['Maharashtra'],
  '44': ['Maharashtra'],
  '45': ['Madhya Pradesh'],
  '46': ['Madhya Pradesh'],
  '47': ['Madhya Pradesh'],
  '48': ['Madhya Pradesh'],
  '49': ['Chhattisgarh'],
  '50': ['Telangana', 'Andhra Pradesh'],
  '51': ['Andhra Pradesh', 'Telangana'],
  '52': ['Andhra Pradesh'],
  '53': ['Andhra Pradesh'],
  '56': ['Karnataka'],
  '57': ['Karnataka'],
  '58': ['Karnataka'],
  '59': ['Karnataka'],
  '60': ['Tamil Nadu', 'Puducherry'],
  '61': ['Tamil Nadu', 'Puducherry'],
  '62': ['Tamil Nadu'],
  '63': ['Tamil Nadu'],
  '64': ['Tamil Nadu'],
  '67': ['Kerala', 'Puducherry'],
  '68': ['Kerala', 'Lakshadweep'],
  '69': ['Kerala'],
  '70': ['West Bengal'],
  '71': ['West Bengal'],
  '72': ['West Bengal'],
  '73': ['West Bengal', 'Sikkim'],
  '74': ['West Bengal', 'Andaman and Nicobar Islands'],
  '75': ['Odisha'],
  '76': ['Odisha'],
  '77': ['Odisha'],
  '78': ['Assam', 'Arunachal Pradesh'],
  '79': [
    'Arunachal Pradesh',
    'Assam',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Tripura',
  ],
  '80': ['Bihar'],
  '81': ['Jharkhand', 'Bihar'],
  '82': ['Jharkhand', 'Bihar'],
  '83': ['Jharkhand'],
  '84': ['Bihar'],
  '85': ['Bihar'],
}

export function pinStates(pincode: string): string[] {
  if (!PINCODE_RE.test(pincode.trim())) return []
  return PIN_PREFIX_STATES[pincode.trim().slice(0, 2)] ?? []
}

/**
 * The warning to show when a GSTIN's state code is not the address's state —
 * the most common reason a GSTIN is rejected later. Null when they agree or
 * either is missing.
 */
export function gstStateMismatch(gstin: string, addressState: string | null | undefined): string | null {
  if (!GSTIN_RE.test(gstin) || !addressState) return null
  const gstState = GST_STATE_CODES[gstin.slice(0, 2)]
  if (!gstState || gstState === addressState) return null
  return `This GST number is for ${gstState}, but your address is in ${addressState}. Please check both.`
}

/** Characters 3–12 of a GSTIN are the holder's PAN — they must agree. */
export function gstinContainsPan(gstin: string, pan: string): boolean {
  return gstin.slice(2, 12).toUpperCase() === pan.toUpperCase()
}

/** True when every required part of an address is filled in. */
export function isAddressComplete(address: StoreAddress | null): boolean {
  if (!address) return false
  return (
    address.line1.trim() !== '' &&
    address.city.trim() !== '' &&
    address.state.trim() !== '' &&
    PINCODE_RE.test(address.pincode.trim())
  )
}

/** One-line rendering for summaries and confirmation screens. */
export function formatAddress(address: StoreAddress): string {
  return [
    address.line1,
    address.line2,
    address.city,
    `${address.state} ${address.pincode}`.trim(),
    address.country === DEFAULT_COUNTRY ? null : address.country,
  ]
    .filter(Boolean)
    .join(', ')
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface StoreTax {
  pan: string | null
  gstin: string | null
  /** The seller declared they are not GST-registered (below the threshold). */
  gstExempt: boolean
  registrationNumber: string | null
}

export interface StoreProfile {
  businessName: string | null
  sellerName: string | null
  phone: string | null
  email: string | null
  address: StoreAddress | null
  tax: StoreTax
}

export const EMPTY_TAX: StoreTax = {
  pan: null,
  gstin: null,
  gstExempt: false,
  registrationNumber: null,
}

export const EMPTY_PROFILE: StoreProfile = {
  businessName: null,
  sellerName: null,
  phone: null,
  email: null,
  address: null,
  tax: EMPTY_TAX,
}

/** PATCH body — any subset; a present key replaces that key wholesale. */
export type StoreProfilePatch = Partial<StoreProfile>

// ---------------------------------------------------------------------------
// Readiness — mirror of storeReadiness.ts
// ---------------------------------------------------------------------------

export const GATES = [
  'PUBLISH',
  'PAYOUT_SETUP',
  'ONLINE_PAYMENT',
  'PICKUP',
] as const
export type Gate = (typeof GATES)[number]

export const STEP_KEYS = [
  'store',
  'business',
  'catalog',
  'address',
  'tax',
  'payout',
] as const
export type StepKey = (typeof STEP_KEYS)[number]

export interface RequirementState {
  key: string
  label: string
  step: StepKey
  gates: Gate[]
  met: boolean
}

export interface GateState {
  gate: Gate
  allowed: boolean
  blockers: string[]
  blockerKeys: string[]
}

export interface StepState {
  key: StepKey
  title: string
  blurb: string
  wizard: boolean
  /** Where the seller edits it, relative to /stores/:slug. */
  href: string
  /** 1-based position among wizard steps; null for checklist-only steps. */
  stepNumber: number | null
  requirements: RequirementState[]
  complete: boolean
  metCount: number
  totalCount: number
}

export interface Readiness {
  steps: StepState[]
  gates: Record<Gate, GateState>
  complete: boolean
  metCount: number
  totalCount: number
}

/**
 * Fallback used only when an older backend responds without `readiness`
 * during a rolling deploy — everything allowed, nothing to nag about, so the
 * UI degrades to how it behaved before this feature rather than locking a
 * seller out of their own store.
 */
export const PERMISSIVE_READINESS: Readiness = {
  steps: [],
  gates: {
    PUBLISH: { gate: 'PUBLISH', allowed: true, blockers: [], blockerKeys: [] },
    PAYOUT_SETUP: {
      gate: 'PAYOUT_SETUP',
      allowed: true,
      blockers: [],
      blockerKeys: [],
    },
    ONLINE_PAYMENT: {
      gate: 'ONLINE_PAYMENT',
      allowed: true,
      blockers: [],
      blockerKeys: [],
    },
    PICKUP: { gate: 'PICKUP', allowed: true, blockers: [], blockerKeys: [] },
  },
  complete: true,
  metCount: 0,
  totalCount: 0,
}

/** Steps a seller still has to finish, in registry order. */
export function pendingSteps(readiness: Readiness): StepState[] {
  return readiness.steps.filter((step) => !step.complete && step.totalCount > 0)
}

/**
 * A step that stands between the seller and a live store — it holds at least
 * one requirement gating `PUBLISH`. Everything else (address, tax, payout) is
 * about getting paid online, which a cash-on-delivery shop can open without.
 */
export function isLaunchStep(step: StepState): boolean {
  return step.requirements.some((req) => req.gates.includes('PUBLISH'))
}

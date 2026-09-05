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

export const GATES = ['PUBLISH', 'ONLINE_PAYMENT', 'PICKUP'] as const
export type Gate = (typeof GATES)[number]

export const STEP_KEYS = [
  'store',
  'business',
  'address',
  'tax',
  'catalog',
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

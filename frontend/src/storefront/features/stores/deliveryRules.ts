import type { DeliveryRule, DeliveryRuleType } from './storesApi'

/**
 * Delivery-area rule helpers shared by the seller editors (Shipping page,
 * product forms). Mirrors the server's `deliveryRules.ts`: 6-digit Indian
 * pincodes, normalised by stripping spaces/hyphens.
 */

export const DELIVERY_RULE_LIMITS = {
  /** Pincodes per rule — matches the server cap. */
  pincodes: 2000,
} as const

const PINCODE_RE = /^[1-9][0-9]{5}$/

export function normalisePincode(raw: string): string {
  return raw.replace(/[\s-]/g, '')
}

export function isValidPincode(raw: string): boolean {
  return PINCODE_RE.test(normalisePincode(raw))
}

/**
 * Split free text — a paste of "629154, 629001 629002\n629003" — into
 * pincodes. Separators: commas, semicolons, whitespace and newlines.
 * Returns the valid ones (normalised, de-duplicated, in input order) and the
 * tokens that were not pincodes, so the editor can say what it dropped.
 */
export function parsePincodes(text: string): {
  valid: string[]
  invalid: string[]
} {
  const valid: string[] = []
  const invalid: string[] = []
  for (const token of text.split(/[\s,;]+/)) {
    if (!token) continue
    const pincode = normalisePincode(token)
    if (PINCODE_RE.test(pincode)) {
      if (!valid.includes(pincode)) valid.push(pincode)
    } else {
      invalid.push(token)
    }
  }
  return { valid, invalid }
}

export const DELIVERY_RULE_LABELS: Record<DeliveryRuleType, string> = {
  ALL: 'All pincodes',
  INCLUDE: 'Only selected pincodes',
  EXCLUDE: 'All except selected pincodes',
}

/** One-line summary — "All pincodes", "Only 12 pincodes", "All except 3 pincodes". */
export function describeDeliveryRule(rule: DeliveryRule): string {
  const n = rule.pincodes.length
  const noun = `${n} pincode${n === 1 ? '' : 's'}`
  switch (rule.type) {
    case 'ALL':
      return 'All pincodes'
    case 'INCLUDE':
      return `Only ${noun}`
    case 'EXCLUDE':
      return `All except ${noun}`
  }
}

export function sameDeliveryRule(
  a: DeliveryRule | null,
  b: DeliveryRule | null,
): boolean {
  if (a === null || b === null) return a === b
  if (a.type !== b.type) return false
  if (a.type === 'ALL') return true
  return (
    a.pincodes.length === b.pincodes.length &&
    a.pincodes.every((pincode, i) => pincode === b.pincodes[i])
  )
}

/** Why a rule cannot be saved as-is, or null when it is complete. */
export function deliveryRuleProblem(rule: DeliveryRule): string | null {
  if (rule.type !== 'ALL' && rule.pincodes.length === 0) {
    return rule.type === 'INCLUDE'
      ? 'Add at least one pincode to deliver to.'
      : 'Add at least one pincode to exclude.'
  }
  return null
}

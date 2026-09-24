/**
 * Postal-code + phone checks — mirror the backend's `isValidPincode` /
 * `normalizePhone` (utils/zodHelpers.ts), which also store the canonical
 * form. India (the default country) needs a 6-digit PIN that never starts
 * with 0 — typed with or without a space ("682 001") — and a 10-digit phone
 * however it is written ("98765 43210", "+91 98765-43210", "098765 43210").
 * Other countries keep a loose shape.
 */
function isIndia(country: string | null | undefined): boolean {
  const c = (country ?? '').trim().toLowerCase()
  return c === '' || c === 'india' || c === 'in' || c === 'bharat'
}

export function isValidPincode(pincode: string, country: string | null | undefined): boolean {
  return isIndia(country)
    ? /^[1-9]\d{5}$/.test(pincode.trim().replace(/[\s-]/g, ''))
    : /^[A-Za-z0-9 -]{3,10}$/.test(pincode.trim())
}

export function isValidPhone(phone: string, country: string | null | undefined): boolean {
  const value = phone.trim()
  if (!isIndia(country)) return /^\+?[\d\s\-()]{5,20}$/.test(value)
  if (!/^[+\d\s\-().]+$/.test(value)) return false
  let digits = value.replace(/\D/g, '')
  if (digits.length === 14 && digits.startsWith('0091')) digits = digits.slice(4)
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[2-9]\d{9}$/.test(digits)
}

export const PHONE_HINT = 'Enter a 10-digit mobile number, e.g. 98765 43210.'
export const PIN_HINT = 'Enter your 6-digit PIN code, e.g. 682016.'

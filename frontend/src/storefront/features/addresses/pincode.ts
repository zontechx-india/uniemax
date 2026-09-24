/**
 * Postal-code check — mirrors the backend's `isValidPincode`
 * (utils/zodHelpers.ts). India (the default country) needs a 6-digit PIN
 * that never starts with 0; other countries keep a loose alphanumeric shape.
 */
export function isValidPincode(pincode: string, country: string | null | undefined): boolean {
  const c = (country ?? '').trim().toLowerCase()
  const india = c === '' || c === 'india' || c === 'in' || c === 'bharat'
  return india ? /^[1-9]\d{5}$/.test(pincode.trim()) : /^[A-Za-z0-9 -]{3,10}$/.test(pincode.trim())
}

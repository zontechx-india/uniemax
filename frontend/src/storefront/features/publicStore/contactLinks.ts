/**
 * Links that open a phone call or a WhatsApp chat with a shop.
 *
 * Sellers type numbers the way they say them — "9124258432", "091242 58432",
 * "+91 91242 58432". A call works with any of those, but `wa.me` needs the
 * full international number without "+": a bare ten-digit Indian mobile
 * opened a chat with a number that does not exist. So a ten-digit number gets
 * India's 91, and a leading trunk 0 is swapped for it.
 */
export function whatsAppNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`
  return digits
}

/** `https://wa.me/…`, optionally with a message already typed for the customer. */
export function waLink(raw: string, text?: string): string {
  const base = `https://wa.me/${whatsAppNumber(raw)}`
  return text ? `${base}?text=${encodeURIComponent(text)}` : base
}

export function telLink(raw: string): string {
  return `tel:${raw.replace(/[^\d+]/g, '')}`
}

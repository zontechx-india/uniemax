/**
 * Store Share Kit — sharing the public store link itself (WhatsApp and the
 * Instagram handle); the images are `shareCard.ts`.
 */

/** wa.me link carrying the Share Kit's ready-made store message. */
export function whatsAppStoreMessageUrl(storeUrl: string): string {
  const text = `🛍️ Shop from our online store\n\nDiscover our latest products and offers.\n\n👉 ${storeUrl}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/** The URL as printed on a card — no scheme, no trailing slash. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/+$/, '')
}

/**
 * The Instagram username out of the footer's Instagram profile (a full URL or
 * a bare handle), or null when there is none or it is not recognisable.
 */
export function instagramHandle(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  const fromUrl = trimmed.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i)?.[1]
  const handle = fromUrl ?? trimmed.replace(/^@/, '')
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) && !['p', 'reel', 'explore'].includes(handle) ? handle : null
}

/**
 * One line about the shop: the first sentence of the footer's "About us",
 * when it is short enough to sit under the name; otherwise `fallback`.
 */
export function storeTagline(about: string | null | undefined, fallback: string): string {
  const first = about?.replace(/\s+/g, ' ').trim().match(/^.*?[.!?](?=\s|$)|^.*$/)?.[0]?.trim()
  return first && first.length <= 90 ? first.replace(/[.]$/, '') : fallback
}

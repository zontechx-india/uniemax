import { PATTERNS } from '../../../features/shareKit/patterns'
import type { SharePattern } from '../../../features/shareKit/patterns'
import { ACCENT_KEYS } from '../../../features/shareKit/palette'
import type { AccentKey } from '../../../features/shareKit/palette'
import type { QrStyle } from '../../../features/shareKit/qr'
import type { ShareFormat, ShareTemplate } from '../../../features/shareKit/shareCard'

/**
 * The seller's Share Kit choices, remembered per store on this device, so
 * coming back to make another card starts from the last one.
 *
 * Local storage on purpose: these are a convenience, not data — losing them
 * (another phone, cleared site data, private mode) just means the defaults.
 * Every value is validated on the way back in, so an entry written by an
 * older build (a retired pattern, a long caption) degrades to the default
 * for that one field instead of breaking the page.
 */
export interface ShareKitPrefs {
  template: ShareTemplate
  format: ShareFormat
  qrStyle: QrStyle
  accentKey: AccentKey
  caption: string
  showLogoInQr: boolean
  pattern: SharePattern
  /** `null` = "Logo only"; absent = not chosen (first product). */
  productId?: string | null
}

const key = (storeId: string) => `uniemax.shareKit.${storeId}`

const TEMPLATES: readonly ShareTemplate[] = ['minimal', 'brand', 'gradient', 'product']
const FORMATS: readonly ShareFormat[] = ['post', 'story']
const QR_STYLES: readonly QrStyle[] = ['classic', 'brand', 'rounded']

const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined

/** What was saved for this store, field by field — anything invalid is left out. */
export function loadPrefs(storeId: string, captionMax: number): Partial<ShareKitPrefs> {
  let raw: unknown
  try {
    raw = JSON.parse(localStorage.getItem(key(storeId)) ?? 'null')
  } catch {
    return {}
  }
  if (!raw || typeof raw !== 'object') return {}
  const r = raw as Record<string, unknown>
  const out: Partial<ShareKitPrefs> = {
    template: pick(r.template, TEMPLATES),
    format: pick(r.format, FORMATS),
    qrStyle: pick(r.qrStyle, QR_STYLES),
    accentKey: pick(r.accentKey, ACCENT_KEYS),
    pattern: pick(r.pattern, PATTERNS.map((p) => p.value)),
  }
  if (typeof r.caption === 'string' && r.caption.trim() && r.caption.length <= captionMax) out.caption = r.caption
  if (typeof r.showLogoInQr === 'boolean') out.showLogoInQr = r.showLogoInQr
  if (r.productId === null || typeof r.productId === 'string') out.productId = r.productId
  return out
}

export function savePrefs(storeId: string, prefs: ShareKitPrefs): void {
  try {
    localStorage.setItem(key(storeId), JSON.stringify(prefs))
  } catch {
    /* private mode or full storage — the choices just are not remembered */
  }
}

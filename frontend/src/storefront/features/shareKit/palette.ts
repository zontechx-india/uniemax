import { readableOn, safeHex, textOn } from '../publicStore/storeTheme'
import type { StoreThemeColors } from '../stores/storesApi'
import type { QrStyle } from './qr'

/**
 * Share-card colours come from the store's OWN theme — never a free colour
 * picker. The seller picks which of their colours leads (primary, their
 * second colour if they set one, or plain black), and every colour that ends
 * up behind a QR module or under text is passed through a contrast check
 * first, so no choice can produce an unscannable code or unreadable caption.
 */

export type AccentKey = 'primary' | 'secondary' | 'ink'

const INK = '#111318'
const WHITE = '#ffffff'

export interface AccentOption {
  key: AccentKey
  label: string
  color: string
}

export function accentOptions(theme: StoreThemeColors): AccentOption[] {
  const primary = safeHex(theme.primaryColor, '#6c3ef4')
  const options: AccentOption[] = [{ key: 'primary', label: 'Shop colour', color: primary }]
  const secondary = theme.secondaryColor ? safeHex(theme.secondaryColor, primary) : null
  if (secondary && secondary.toLowerCase() !== primary.toLowerCase()) {
    options.push({ key: 'secondary', label: 'Second colour', color: secondary })
  }
  options.push({ key: 'ink', label: 'Black', color: INK })
  return options
}

export interface CardPalette {
  /** The chosen colour as the seller set it — the Brand template's background. */
  accent: string
  /** Text/eyebrow in the accent, nudged to ≥ 4.5:1 on white. */
  accentOnWhite: string
  /** Text drawn ON the accent (white or near-black, whichever reads). */
  onAccent: string
  ink: string
  muted: string
  hairline: string
  /** QR module colour on its white plate. */
  qr: string
}

/**
 * The QR needs more than text contrast: phone cameras in poor light lose
 * mid-tones first, so coloured modules are held to 7:1 against the white
 * plate (black on white is 21:1). A pale brand colour is darkened until it
 * passes — the code stays recognisably theirs and always scans.
 */
const QR_MIN_CONTRAST = 7

export function cardPalette(accent: string, qrStyle: QrStyle): CardPalette {
  return {
    accent,
    accentOnWhite: readableOn(accent, WHITE, 4.5),
    onAccent: textOn(accent),
    ink: INK,
    muted: '#5d6170',
    hairline: '#e6e7ec',
    qr: qrStyle === 'classic' ? INK : readableOn(accent, WHITE, QR_MIN_CONTRAST),
  }
}

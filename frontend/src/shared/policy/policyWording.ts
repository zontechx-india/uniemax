/**
 * PolicyHub wording helpers, shared by the admin editor and the seller's
 * policy page (docs/policyhub/README.md §7).
 *
 * `renderPolicyBody` is the browser twin of the backend's
 * `package/policy/rules.ts › renderBody` — the editor uses it for a live
 * preview before saving. The server's `renderedBody` stays the truth for
 * anything published; change both sides together.
 */

export type PolicySettings = Record<string, string>

/** Placeholders each policy code's wording must use, with a label for the editor. */
export const POLICY_PLACEHOLDERS: Record<string, { name: string; label: string }[]> = {
  'PYO-001': [
    { name: 'cutoff', label: 'Cutoff time' },
    { name: 'windowStart', label: 'Transfers start' },
    { name: 'windowEnd', label: 'Transfers end' },
    { name: 'tz', label: 'Timezone (IST)' },
  ],
}

/** "18:00" → "6:00 PM". */
export function formatPolicyTime(value: string): string {
  const [h = 0, m = 0] = value.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "Asia/Kolkata" → "IST" (falls back to the IANA name). */
export function timeZoneLabel(tz: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-IN', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')
    return part?.value ?? tz
  } catch {
    return tz
  }
}

const PLACEHOLDER = /\{\{\s*([A-Za-z]+)\s*\}\}/g

/** The wording with {{placeholders}} filled from settings; unknown ones stay as typed. */
export function renderPolicyBody(body: string, settings: PolicySettings | null): string {
  if (!settings) return body
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(settings)) {
    values[key] = key === 'timezone' ? value : formatPolicyTime(value)
  }
  if (settings.timezone) values.tz = timeZoneLabel(settings.timezone)
  return body.replace(PLACEHOLDER, (whole, name: string) => values[name] ?? whole)
}

import type { LeadKind } from '../../../features/stores/storesApi'

/**
 * The Leads tab's date filter — the choices, their dates, and how they sit in
 * the URL (`?dates=90d`, or `?dates=custom&from=2026-11-01&to=2026-11-10`).
 *
 * Each kind keeps what the server keeps (docs/API.md → Seller leads):
 *   Not paid      up to a year back — unpaid orders stay in the database
 *   Left in cart  30 days only — a cart line is gone once it leaves the cart
 *   In cart now   last 24 hours — no filter
 *
 * Presets start at local midnight, so their dates are the same all day (and
 * the list request does not change on every render). Custom ranges end at
 * the end of the "to" day.
 */

export type DatePreset = 'today' | '7d' | '30d' | '90d' | '12m'
export type LeadDates = { preset: DatePreset } | { preset: 'custom'; from: string; to: string }

const PRESET_LABEL: Record<DatePreset, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '12m': 'Last 12 months',
}

/** Which presets a kind offers (plus "Custom date range"), and its default. */
const OPTIONS: Partial<Record<LeadKind, { presets: DatePreset[]; fallback: DatePreset }>> = {
  PAYMENT_PENDING: { presets: ['today', '7d', '30d', '90d', '12m'], fallback: '7d' },
  ABANDONED: { presets: ['7d', '30d'], fallback: '30d' },
}

export function hasDateFilter(kind: LeadKind): boolean {
  return OPTIONS[kind] !== undefined
}

export function presetsFor(kind: LeadKind): DatePreset[] {
  return OPTIONS[kind]?.presets ?? []
}

export function defaultDates(kind: LeadKind): LeadDates {
  return { preset: OPTIONS[kind]?.fallback ?? '7d' }
}

export function isDefaultDates(kind: LeadKind, dates: LeadDates): boolean {
  return dates.preset === defaultDates(kind).preset
}

export function presetLabel(preset: DatePreset): string {
  return PRESET_LABEL[preset]
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - days)
}

/** A local day as `YYYY-MM-DD` — what `<input type="date">` uses. */
export function toDayString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** `YYYY-MM-DD` → that local day's midnight; null when it is not a real day. */
export function parseDayString(value: string | null): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return toDayString(date) === value ? date : null
}

/** The first day a kind's custom range may start on. */
export function earliestDay(kind: LeadKind, today = new Date()): Date {
  const start = startOfDay(today)
  return kind === 'PAYMENT_PENDING'
    ? new Date(start.getFullYear() - 1, start.getMonth(), start.getDate())
    : daysBefore(start, 30)
}

/** The first day of a preset (it runs to now). */
function presetStart(preset: DatePreset, today: Date): Date {
  const start = startOfDay(today)
  switch (preset) {
    case 'today':
      return start
    case '7d':
      return daysBefore(start, 7)
    case '30d':
      return daysBefore(start, 30)
    case '90d':
      return daysBefore(start, 90)
    case '12m':
      return new Date(start.getFullYear() - 1, start.getMonth(), start.getDate())
  }
}

/** The days a choice covers, for its second line ("16 Nov, 2026 - 23 Nov, 2026"). */
export function datesLine(dates: LeadDates, today = new Date()): string {
  if (dates.preset === 'custom') {
    const from = parseDayString(dates.from)!
    const to = parseDayString(dates.to)!
    return dates.from === dates.to ? formatDay(from) : `${formatDay(from)} - ${formatDay(to)}`
  }
  if (dates.preset === 'today') return formatDay(today)
  return `${formatDay(presetStart(dates.preset, today))} - ${formatDay(today)}`
}

/** The short name on the filter button. */
export function datesLabel(dates: LeadDates): string {
  if (dates.preset !== 'custom') return PRESET_LABEL[dates.preset]
  const short = (value: string) =>
    parseDayString(value)!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return dates.from === dates.to ? short(dates.from) : `${short(dates.from)} - ${short(dates.to)}`
}

/** "23 Nov, 2026" */
export function formatDay(date: Date): string {
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${date.getFullYear()}`
}

/** What the list request sends: the start, and the end of the last day for a custom range. */
export function toApiRange(dates: LeadDates, today = new Date()): { from?: string; to?: string } {
  if (dates.preset !== 'custom') return { from: presetStart(dates.preset, today).toISOString() }
  const from = parseDayString(dates.from)!
  const to = parseDayString(dates.to)!
  const endOfTo = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1, 0, 0, 0, -1)
  return { from: from.toISOString(), to: endOfTo.toISOString() }
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

/** The kind's dates from the URL; anything missing, wrong or not offered → its default. */
export function readDates(params: URLSearchParams, kind: LeadKind): LeadDates {
  const preset = params.get('dates')
  if (preset === 'custom') {
    const from = parseDayString(params.get('from'))
    const to = parseDayString(params.get('to'))
    const today = startOfDay(new Date())
    if (from && to && from <= to && to <= today && from >= earliestDay(kind)) {
      return { preset: 'custom', from: toDayString(from), to: toDayString(to) }
    }
    return defaultDates(kind)
  }
  return presetsFor(kind).includes(preset as DatePreset) ? { preset: preset as DatePreset } : defaultDates(kind)
}

/** Writes the dates into a copy of the URL params; the default leaves the URL clean. */
export function writeDates(params: URLSearchParams, kind: LeadKind, dates: LeadDates): URLSearchParams {
  const copy = clearDates(params)
  if (isDefaultDates(kind, dates)) return copy
  copy.set('dates', dates.preset)
  if (dates.preset === 'custom') {
    copy.set('from', dates.from)
    copy.set('to', dates.to)
  }
  return copy
}

export function clearDates(params: URLSearchParams): URLSearchParams {
  const copy = new URLSearchParams(params)
  copy.delete('dates')
  copy.delete('from')
  copy.delete('to')
  return copy
}

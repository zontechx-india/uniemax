import { formatPolicyTime, timeZoneLabel, type PolicySettings } from './policyWording'

/**
 * The payout policy's times in plain words (PYO-001 settings): delivered
 * before the cutoff → paid the same day, at or after it → the next day, and
 * the transfer window. Shown above the full wording, so a seller gets the
 * answer without reading the whole policy. Renders nothing without settings.
 */
export function PayoutTimes({ settings, className = '' }: { settings: PolicySettings | null; className?: string }) {
  if (!settings?.cutoff || !settings.windowStart || !settings.windowEnd) return null
  const tz = settings.timezone ? ` ${timeZoneLabel(settings.timezone)}` : ''
  const cutoff = `${formatPolicyTime(settings.cutoff)}${tz}`
  const rows: [string, string][] = [
    [`Delivered before ${cutoff}`, 'Paid the same day'],
    [`Delivered at ${cutoff} or later`, 'Paid the next day'],
    ['Transfers start', `${formatPolicyTime(settings.windowStart)} – ${formatPolicyTime(settings.windowEnd)}${tz}, every day`],
  ]
  return (
    <dl className={`ws-well divide-y divide-line rounded-lg ${className}`}>
      {rows.map(([when, what]) => (
        <div key={when} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          <dt className="text-sm text-muted">{when}</dt>
          <dd className="text-base font-semibold text-fg sm:text-right">{what}</dd>
        </div>
      ))}
    </dl>
  )
}

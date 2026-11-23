import { useEffect, useId, useRef, useState } from 'react'
import type { LeadKind } from '../../../features/stores/storesApi'
import { Button } from '../../../../shared/ui/Button'
import { Dialog } from '../../../../shared/ui/Dialog'
import { FIELD_LABEL, fieldClass, fieldNoteClass } from '../../../../shared/ui/field'
import { useMediaQuery } from '../../../../shared/useMediaQuery'
import { CalendarIcon, ChevronDownIcon } from '../../../layout/icons'
import {
  datesLabel,
  datesLine,
  earliestDay,
  parseDayString,
  presetLabel,
  presetsFor,
  toDayString,
} from './leadDates'
import type { DatePreset, LeadDates } from './leadDates'

/**
 * The Leads tab's date filter: a button with the chosen dates ("Last 7 days")
 * that opens the list of choices — a bottom sheet on a phone, a dropdown
 * under the button from `sm`. Same choices in both.
 *
 * Each choice shows its real dates under its name, so the seller never has
 * to work out what "Last 90 days" means. A preset applies on tap and closes;
 * "Custom date range" opens two date fields and an Apply button. The dates a
 * kind can show are limited (leadDates.ts) and the fields enforce it.
 */
export function LeadDateFilter({
  kind,
  value,
  onChange,
}: {
  kind: LeadKind
  value: LeadDates
  onChange: (dates: LeadDates) => void
}) {
  const [open, setOpen] = useState(false)
  const desktop = useMediaQuery('(min-width: 640px)')
  const containerRef = useRef<HTMLDivElement>(null)

  // Dropdown only: close on a click outside or Escape (the sheet has its own).
  useEffect(() => {
    if (!open || !desktop) return
    const onOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onEscape)
    }
  }, [open, desktop])

  const choose = (dates: LeadDates) => {
    onChange(dates)
    setOpen(false)
  }

  const choices = <Choices kind={kind} value={value} onChoose={choose} />

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="secondary"
        size="md"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full justify-between sm:w-auto"
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <CalendarIcon className="h-4 w-4 shrink-0 text-muted" />
          <span className="truncate">{datesLabel(value)}</span>
        </span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>

      {desktop ? (
        open && (
          <div
            role="dialog"
            aria-label="Date"
            className="absolute left-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-floating"
          >
            {choices}
          </div>
        )
      ) : (
        <Dialog open={open} title="Date" onClose={() => setOpen(false)} flush>
          {choices}
        </Dialog>
      )}
    </div>
  )
}

/** The radio list: the kind's presets, then "Custom date range". */
function Choices({
  kind,
  value,
  onChoose,
}: {
  kind: LeadKind
  value: LeadDates
  onChoose: (dates: LeadDates) => void
}) {
  const name = useId()
  const [custom, setCustom] = useState(value.preset === 'custom')
  return (
    <div role="radiogroup" aria-label="Date" className="divide-y divide-line">
      {presetsFor(kind).map((preset: DatePreset) => (
        <Choice
          key={preset}
          name={name}
          label={presetLabel(preset)}
          line={datesLine({ preset })}
          checked={!custom && value.preset === preset}
          onSelect={() => onChoose({ preset })}
        />
      ))}
      <div>
        <Choice
          name={name}
          label="Custom date range"
          line={value.preset === 'custom' ? datesLine(value) : null}
          checked={custom}
          onSelect={() => setCustom(true)}
        />
        {custom && <CustomRange kind={kind} value={value} onApply={onChoose} />}
      </div>
    </div>
  )
}

/** One choice: name, its dates under it, a radio on the right. */
function Choice({
  name,
  label,
  line,
  checked,
  onSelect,
}: {
  name: string
  label: string
  line: string | null
  checked: boolean
  onSelect: () => void
}) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-fg/4 has-[:focus-visible]:bg-fg/4">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">{label}</span>
        {line && <span className="mt-0.5 block font-figure text-hint tabular-nums text-muted">{line}</span>}
      </span>
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      <span
        aria-hidden
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-colors ${
          checked ? 'border-accent' : 'border-fg/25'
        }`}
      >
        {checked && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
      </span>
    </label>
  )
}

/** From / To fields and Apply — limited to the days this kind keeps. */
function CustomRange({
  kind,
  value,
  onApply,
}: {
  kind: LeadKind
  value: LeadDates
  onApply: (dates: LeadDates) => void
}) {
  const today = toDayString(new Date())
  const earliest = toDayString(earliestDay(kind))
  const [from, setFrom] = useState(value.preset === 'custom' ? value.from : '')
  const [to, setTo] = useState(value.preset === 'custom' ? value.to : today)
  const [error, setError] = useState<string | null>(null)
  const fromId = useId()
  const toId = useId()

  const apply = () => {
    const start = parseDayString(from)
    const end = parseDayString(to)
    if (!start || !end) return setError('Choose both dates.')
    if (start > end) return setError('The start date must be on or before the end date.')
    if (from < earliest || to > today) {
      return setError(
        kind === 'PAYMENT_PENDING'
          ? 'Choose dates within the last 12 months.'
          : 'Carts are kept for 30 days. Choose dates within that.',
      )
    }
    onApply({ preset: 'custom', from, to })
  }

  return (
    <div className="space-y-3 px-4 pt-1 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={fromId} className={FIELD_LABEL}>
            From
          </label>
          <input
            id={fromId}
            type="date"
            value={from}
            min={earliest}
            max={to || today}
            onChange={(e) => {
              setFrom(e.target.value)
              setError(null)
            }}
            className={fieldClass({ invalid: error !== null })}
          />
        </div>
        <div>
          <label htmlFor={toId} className={FIELD_LABEL}>
            To
          </label>
          <input
            id={toId}
            type="date"
            value={to}
            min={from || earliest}
            max={today}
            onChange={(e) => {
              setTo(e.target.value)
              setError(null)
            }}
            className={fieldClass({ invalid: error !== null })}
          />
        </div>
      </div>
      {error ? (
        <p role="alert" className={fieldNoteClass(true)}>
          {error}
        </p>
      ) : (
        <p className={fieldNoteClass()}>
          {kind === 'PAYMENT_PENDING' ? 'Up to 12 months back.' : 'Carts are kept for 30 days.'}
        </p>
      )}
      <Button variant="primary" size="md" full onClick={apply}>
        Apply
      </Button>
    </div>
  )
}

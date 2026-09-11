import type {
  Readiness,
  StepKey,
  StepState,
} from '../../features/stores/storeProfile'
import { CheckIcon } from '../../layout/icons'

/**
 * Setup-status marks — the shared vocabulary for "is this section done?".
 *
 * Every mark reads from the SAME server-computed `readiness` the publish and
 * payment endpoints enforce (see `storeReadiness.ts`), never from a local
 * inspection of the profile, so a green check can never promise a seller
 * something the server would reject.
 *
 * Two states, two colors, one meaning each:
 *
 *   - **complete** — a solid green check. Done, nothing to do.
 *   - **pending** — an orange ring on the animated gradient. Orange is used
 *     for nothing else in the app, so an orange mark anywhere always means
 *     "unfinished", and the slow sweep separates it from decoration at the
 *     14–20px sizes these render at.
 *
 * There is deliberately no error state: an unmet requirement is not a
 * failure, it is work the seller has not reached yet.
 */

// ---------------------------------------------------------------------------
// Reading readiness
// ---------------------------------------------------------------------------

/**
 * The aggregate of one or more readiness steps — a page (or a nav row) can
 * cover several. `total === 0` means nothing here applies to this store, and
 * the caller should render no mark at all rather than an empty one.
 */
export interface SectionStatus {
  complete: boolean
  met: number
  total: number
  /** Labels of what is still missing, in registry order. Empty when done. */
  missing: string[]
}

export function stepsByKey(
  readiness: Readiness,
  keys: readonly StepKey[],
): StepState[] {
  return keys
    .map((key) => readiness.steps.find((step) => step.key === key))
    .filter((step): step is StepState => step !== undefined)
}

/** Roll a set of steps up into the one status a single mark can carry. */
export function sectionStatus(steps: StepState[]): SectionStatus {
  return {
    // `complete` follows the steps rather than the counts, so a step with no
    // applicable requirements never drags a finished section back to pending.
    complete: steps.every((step) => step.complete),
    met: steps.reduce((sum, step) => sum + step.metCount, 0),
    total: steps.reduce((sum, step) => sum + step.totalCount, 0),
    missing: steps.flatMap((step) =>
      step.requirements.filter((req) => !req.met).map((req) => req.label),
    ),
  }
}

// ---------------------------------------------------------------------------
// The mark
// ---------------------------------------------------------------------------

const MARK_SIZES = {
  sm: { box: 'h-3.5 w-3.5', hole: 'h-1.5 w-1.5', tick: 'h-2.5 w-2.5' },
  md: { box: 'h-5 w-5', hole: 'h-2 w-2', tick: 'h-3 w-3' },
} as const

/**
 * The status sign itself. A ring rather than a filled dot for pending: the
 * hole is what makes the gradient legible as *motion* at 14px, and it keeps
 * the two states apart by SHAPE, not only by color — which is what a
 * red-green colorblind seller (and a greyscale screenshot) actually rely on.
 */
export function StatusMark({
  complete,
  size = 'md',
  label,
  className = '',
}: {
  complete: boolean
  size?: keyof typeof MARK_SIZES
  /**
   * Screen-reader text. Pass `null` when an enclosing element already names
   * the state (a pill reading "Complete" beside it), so it is not read twice.
   */
  label?: string | null
  /** Positioning only — the mark owns its own size and color. */
  className?: string
}) {
  const s = MARK_SIZES[size]
  const a11y =
    label === null
      ? ({ 'aria-hidden': true } as const)
      : ({
          role: 'img',
          'aria-label': label ?? (complete ? 'Complete' : 'Pending'),
        } as const)

  if (complete) {
    return (
      <span
        {...a11y}
        className={`inline-flex shrink-0 items-center justify-center rounded-full bg-success text-white ${s.box} ${className}`}
      >
        <CheckIcon className={s.tick} />
      </span>
    )
  }

  return (
    <span
      {...a11y}
      className={`bg-pending-gradient inline-flex shrink-0 items-center justify-center rounded-full ${s.box} ${className}`}
    >
      <span className={`rounded-full bg-surface ${s.hole}`} />
    </span>
  )
}

/** The one sentence a status is worth, shared by the badge and the chips. */
function statusText(status: SectionStatus, dirty: boolean): string {
  if (dirty) return 'Unsaved changes'
  if (status.complete) return 'Complete'
  return `${status.met} of ${status.total} done`
}

// ---------------------------------------------------------------------------
// The tag — a nav row
// ---------------------------------------------------------------------------

/**
 * The nav-row form of a status: the **word** "Pending" beside the animated
 * mark while a section is unfinished, and the bare tick once it is done.
 *
 * Asymmetric on purpose. A mark alone is ambiguous in a list — a seller
 * scanning sixteen rows should not have to learn that orange-ring means
 * unfinished — so the row that still wants something says so in words. A
 * finished row has nothing to ask for, and "Complete" repeated down a column
 * is noise, so it keeps the tick and stays quiet.
 */
export function StatusTag({
  status,
  section,
}: {
  status: SectionStatus
  /** The row's own label, so the screen-reader text names what is pending. */
  section: string
}) {
  if (status.complete) {
    return <StatusMark complete size="sm" label={`${section} setup complete`} />
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-pending-soft px-1.5 py-0.5 text-[10px] font-semibold text-pending">
      <StatusMark complete={false} size="sm" label={null} />
      Pending
      <span className="sr-only">
        {` — ${section} setup, ${status.met} of ${status.total} done`}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// The badge — a section's own header, top right
// ---------------------------------------------------------------------------

/**
 * "Complete" / "2 of 4 done" / "Unsaved changes", sized to sit in a card
 * header without wrapping on a phone.
 *
 * `dirty` wins over the readiness state on purpose: readiness only moves when
 * the server confirms a save, so a seller who has typed the missing field but
 * not pressed Save has to be told that — an orange "still needed" beside a
 * filled-in field reads as a bug, and a green check would be a lie.
 */
export function StatusBadge({
  status,
  dirty = false,
}: {
  status: SectionStatus
  dirty?: boolean
}) {
  if (dirty) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
        {statusText(status, true)}
      </span>
    )
  }

  if (status.complete) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
        <StatusMark complete size="sm" label={null} />
        {statusText(status, false)}
      </span>
    )
  }

  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-pending-soft px-2.5 py-1 text-[11px] font-semibold text-pending">
      <StatusMark complete={false} size="sm" label={null} />
      {statusText(status, false)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// The jump bar — every section's status, above every section
// ---------------------------------------------------------------------------

export interface JumpTarget {
  /** DOM id of the section to scroll to. */
  id: string
  /**
   * The section's OWN heading, verbatim. Never an abbreviation: a chip
   * reading "Tax" above a card headed "Tax & compliance" makes the seller
   * check whether they are the same thing, which is the opposite of what a
   * navigator is for.
   */
  label: string
  status: SectionStatus
  dirty?: boolean
}

/**
 * The status strip above the sections: one tile per section, each carrying
 * the section's own heading and mark, and scrolling to it on tap.
 *
 * The tiles **divide the width equally** (`flex-1 basis-0`, so the widths come
 * from the count and not from how long each heading happens to be) rather
 * than huddling at one end. Equal columns are what make it read as a map of
 * the page — three targets of the same weight — and they give each label the
 * room to be the real heading instead of an abbreviation. `basis-0` is
 * load-bearing: without it "Business & contact" would claim more track than
 * "Address" and the columns would drift out of step.
 *
 * It **sticks** only while something is still pending. Once the page is done
 * the tiles are a summary rather than a to-do list, and pinning a summary
 * over a phone viewport for the rest of the session is rent it stops paying.
 */
export function SectionJumpBar({
  targets,
  onJump,
}: {
  targets: JumpTarget[]
  onJump: (id: string) => void
}) {
  const pending = targets.filter((t) => !t.status.complete).length

  return (
    <div
      className={`mt-4 -mx-4 border-b border-line px-4 py-2.5 sm:-mx-5 sm:px-5 ${
        pending > 0
          ? // Bleeds to the panel edges so the pinned background covers the
            // full width as content scrolls under it; `top-14` clears the
            // app's own sticky header.
            'sticky top-14 z-10 bg-surface'
          : ''
      }`}
    >
      <div className="flex items-stretch gap-2">
        {targets.map((target) => (
          <button
            key={target.id}
            type="button"
            onClick={() => onJump(target.id)}
            className={`flex min-w-0 flex-1 basis-0 items-start gap-2 rounded-md border px-2 py-2 text-left transition sm:px-2.5 ${
              target.dirty
                ? 'border-brand/30 bg-brand-soft text-brand hover:border-brand/60'
                : target.status.complete
                  ? 'border-line bg-surface text-muted hover:bg-surface-alt hover:text-fg'
                  : 'border-pending/30 bg-pending-soft text-pending hover:border-pending/60'
            }`}
          >
            {target.dirty ? (
              <span
                aria-hidden
                className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
              />
            ) : (
              <StatusMark
                complete={target.status.complete}
                size="sm"
                label={null}
                // Aligns the mark to the first line of a label that wraps.
                className="mt-0.5"
              />
            )}

            <span className="min-w-0 flex-1">
              {/* Wraps rather than truncating: "Business &…" would be worse
                  than two short lines, and equal columns give it the room. */}
              <span className="block text-[11px] font-semibold leading-tight">
                {target.label}
              </span>
              {/* The count is the first thing to go when the tile is narrow —
                  the mark still carries the state, and the section's own
                  header repeats the number once the seller arrives. */}
              <span className="mt-0.5 hidden text-[10px] leading-tight opacity-80 sm:block">
                {statusText(target.status, target.dirty ?? false)}
              </span>
              <span className="sr-only sm:hidden">
                {statusText(target.status, target.dirty ?? false)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

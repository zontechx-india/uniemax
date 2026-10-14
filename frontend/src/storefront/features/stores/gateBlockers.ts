import type { Gate, Readiness, StepKey } from './storeProfile'

/**
 * What blocks a gate, as links to the screens that fix it — the pure half of
 * `pages/stores/GateBlockers.tsx`, kept free of React so it can be unit
 * tested (`npm run test:unit`).
 */

export interface GateBlocker {
  key: string
  label: string
  /** The management section that fixes it (`business`, `bank-accounts`…). */
  section: string | null
  /** Link to that section, or null when this mode cannot open it. */
  to: string | null
}

/**
 * DOM id of the card that edits `step`, on a page that holds several steps.
 * Business details holds three (contact, address, tax), and a link to the
 * bare page lands on the first card — which may be complete, leaving the
 * seller to scroll and guess what was missing.
 */
export function setupAnchor(step: StepKey): string {
  return `setup-${step}`
}

/**
 * Read off the server's readiness (`blockerKeys` → the step that owns the
 * requirement → its `href`), so a requirement added to `storeReadiness.ts`
 * links to the right section with no change here. Sections the mode cannot
 * open (an admin and `business`) come back unlinked rather than as a link
 * that dead-ends.
 */
export function gateBlockers(
  readiness: Readiness,
  gate: Gate,
  /** Route base for this store's management pages, no trailing slash. */
  storeBase: string,
  hiddenSections: readonly string[],
): GateBlocker[] {
  return readiness.gates[gate].blockerKeys.map((key) => {
    const step = readiness.steps.find((s) =>
      s.requirements.some((r) => r.key === key),
    )
    const requirement = step?.requirements.find((r) => r.key === key)
    const sharesPage =
      step !== undefined &&
      readiness.steps.filter((s) => s.href === step.href).length > 1
    return {
      key,
      label: requirement?.label ?? key,
      section: step?.href ?? null,
      to:
        step && !hiddenSections.includes(step.href)
          ? `${storeBase}/${step.href}${sharesPage ? `#${setupAnchor(step.key)}` : ''}`
          : null,
    }
  })
}

/** Blockers that one screen fixes, for one "go there" button. */
export interface BlockerGroup {
  section: string | null
  /** The first blocker's link, so it opens on the first card to fill in. */
  to: string | null
  labels: string[]
}

/** Blockers gathered by the section that fixes them, in the order needed. */
export function groupBySection(blockers: GateBlocker[]): BlockerGroup[] {
  const groups: BlockerGroup[] = []
  for (const blocker of blockers) {
    const group =
      blocker.section === null
        ? undefined
        : groups.find((g) => g.section === blocker.section)
    if (group) group.labels.push(blocker.label)
    else
      groups.push({
        section: blocker.section,
        to: blocker.to,
        labels: [blocker.label],
      })
  }
  return groups
}

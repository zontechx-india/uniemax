import { Link } from 'react-router-dom'
import type { Store } from '../../features/stores/storesApi'
import type { Gate } from '../../features/stores/storeProfile'
import { useStoreManageScope } from '../../features/stores/storeManageScope'

export interface GateBlocker {
  key: string
  label: string
  /** The section that fixes it, or null when this mode cannot open it. */
  to: string | null
}

/**
 * What still blocks `gate`, each paired with the screen that fixes it.
 *
 * Read off the server's readiness (`blockerKeys` → the step that owns the
 * requirement → its `href`), so a requirement added to `storeReadiness.ts`
 * links to the right section with no change here. Sections the current mode
 * cannot open (an admin and `business`) come back unlinked rather than as a
 * link that dead-ends.
 */
export function useGateBlockers(store: Store, gate: Gate): GateBlocker[] {
  const { storePath, hiddenSections } = useStoreManageScope()
  const { readiness } = store
  return readiness.gates[gate].blockerKeys.map((key) => {
    const step = readiness.steps.find((s) =>
      s.requirements.some((r) => r.key === key),
    )
    const requirement = step?.requirements.find((r) => r.key === key)
    return {
      key,
      label: requirement?.label ?? key,
      to:
        step && !hiddenSections.includes(step.href)
          ? `${storePath(store.slug)}/${step.href}`
          : null,
    }
  })
}

/** Inline, comma-free list of blockers — each one a link to its fix. */
export function BlockerLinks({
  blockers,
  className = '',
}: {
  blockers: GateBlocker[]
  className?: string
}) {
  return (
    <span className={`inline-flex flex-wrap gap-1.5 ${className}`}>
      {blockers.map((blocker) =>
        blocker.to ? (
          <Link
            key={blocker.key}
            to={blocker.to}
            className="rounded-pill bg-surface px-2 py-0.5 text-xs font-semibold text-brand ring-1 ring-line transition hover:underline"
          >
            {blocker.label}
          </Link>
        ) : (
          <span
            key={blocker.key}
            className="rounded-pill bg-surface px-2 py-0.5 text-xs font-medium text-fg ring-1 ring-line"
          >
            {blocker.label}
          </span>
        ),
      )}
    </span>
  )
}

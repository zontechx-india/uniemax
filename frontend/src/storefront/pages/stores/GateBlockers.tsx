import { Link } from 'react-router-dom'
import type { Store } from '../../features/stores/storesApi'
import type { Gate } from '../../features/stores/storeProfile'
import { useStoreManageScope } from '../../features/stores/storeManageScope'
import { gateBlockers } from '../../features/stores/gateBlockers'
import type { GateBlocker } from '../../features/stores/gateBlockers'

/**
 * What still blocks `gate`, each paired with the screen that fixes it — see
 * `features/stores/gateBlockers.ts` for how keys become links.
 */
export function useGateBlockers(store: Store, gate: Gate): GateBlocker[] {
  const { storePath, hiddenSections } = useStoreManageScope()
  return gateBlockers(store.readiness, gate, storePath(store.slug), hiddenSections)
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

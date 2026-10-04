import { isLaunchStep } from '../../features/stores/storeProfile'
import type { StepState } from '../../features/stores/storeProfile'
import type { Store } from '../../features/stores/storesApi'

/**
 * The launch half of a store's readiness, read the same way everywhere it is
 * shown — the My shops card ring, the Dashboard's next-step hero and the
 * setup checklist — so the three can never disagree about "what is next".
 * All of it comes from the server-computed `readiness` the publish endpoint
 * enforces.
 */

/** Steps that block publishing (and apply to this store), in registry order. */
export function launchSteps(store: Store): StepState[] {
  return store.readiness.steps.filter((step) => step.totalCount > 0 && isLaunchStep(step))
}

/** Steps for online payments only — optional; Cash on Delivery works without. */
export function payoutSteps(store: Store): StepState[] {
  return store.readiness.steps.filter((step) => step.totalCount > 0 && !isLaunchStep(step))
}

/** What the jump-to-fix button says, per step — "Open" alone said nothing. */
const STEP_ACTION: Partial<Record<StepState['key'], string>> = {
  store: 'Edit details',
  business: 'Add details',
  catalog: 'Add a product',
  address: 'Add address',
  tax: 'Add tax details',
  payout: 'Add bank account',
}

/**
 * Where a step's button goes and what it says. Products cannot be added until
 * a category exists, so a catalog step missing its category sends the seller
 * to Categories first instead of to a page that would only say "not yet".
 */
export function stepAction(step: StepState): { to: string; label: string } {
  const needsCategory =
    step.key === 'catalog' &&
    step.requirements.some((req) => req.key === 'catalog.category' && !req.met)
  return needsCategory
    ? { to: 'categories', label: 'Choose a category' }
    : { to: step.href, label: STEP_ACTION[step.key] ?? 'Open' }
}

/** The plain list of what a step still lacks ("A product · A photo"). */
export function stepMissing(step: StepState): string[] {
  return step.requirements.filter((req) => !req.met).map((req) => req.label)
}

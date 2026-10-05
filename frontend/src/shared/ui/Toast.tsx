import { useSyncExternalStore } from 'react'
import { CheckIcon } from '../../storefront/layout/icons'

/**
 * "Saved ✓" — the confirmation for anything that saves the instant it is
 * tapped (a switch, a reorder), where there is no Save button to turn into
 * "Saved". Without it a seller toggles a product off and cannot tell whether
 * the shop heard them.
 *
 * A tiny module store rather than a React context, so any handler can call
 * `showToast()` without threading a provider through the tree. ONE
 * `<ToastHost />` renders them — mounted by the store-management layout.
 * Shared (docs/DESIGN_GUIDELINES.md §7): `TOAST_CLASS` is the one toast look,
 * also used by the storefront's "Added to cart" toast.
 */

/** The one toast surface: flat, bordered, one floating shadow. */
export const TOAST_CLASS =
  'flex min-h-tap animate-sheet-in items-center gap-2.5 rounded-pill border border-line bg-surface py-2 pr-5 pl-2.5 text-sm font-semibold text-fg shadow-floating'

type ToastTone = 'success' | 'danger'
interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Show a short message at the bottom of the screen for ~2.5s. */
export function showToast(message: string, tone: ToastTone = 'success') {
  const id = nextId++
  // Newest only, plus at most one older still fading — a burst of switch
  // taps should not stack a column of "Saved" over the page.
  items = [...items.slice(-1), { id, message, tone }]
  emit()
  window.setTimeout(() => {
    items = items.filter((item) => item.id !== id)
    emit()
  }, tone === 'danger' ? 4000 : 2500)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function ToastHost() {
  const toasts = useSyncExternalStore(subscribe, () => items)

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4 bottom-[calc(var(--seller-dock,0px)+max(1rem,env(safe-area-inset-bottom)))]"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'danger' ? 'alert' : 'status'}
          className={TOAST_CLASS}
        >
          <span
            aria-hidden
            className={`flex h-7 w-7 items-center justify-center rounded-full ${
              toast.tone === 'danger'
                ? 'bg-danger text-brand-contrast'
                : 'bg-success text-brand-contrast'
            }`}
          >
            {toast.tone === 'danger' ? '!' : <CheckIcon className="h-4 w-4" />}
          </span>
          {toast.message}
        </div>
      ))}
    </div>
  )
}

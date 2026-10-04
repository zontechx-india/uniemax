import type { ReactNode } from 'react'
import { Button } from '../../../../shared/ui/Button'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

/**
 * The one way a seller form saves.
 *
 * Before this, pages saved four different ways — instantly, on blur, after a
 * confirm, or with a Save button at the bottom of each card on a long page —
 * and a seller who scrolled away from a card's button lost the edit without
 * a word. Now a form shows nothing until something changes; then a frosted
 * bar rises at the bottom of the screen, says so, and stays under the thumb
 * with **Save changes** (and **Undo changes**) wherever the seller scrolls.
 * Leaving with the bar up asks first (`useUnsavedChangesGuard`).
 *
 * `sticky`, not `fixed`: a fixed bar inside a glass panel would be trapped
 * by the panel's `backdrop-filter` (it becomes the containing block), and
 * sticky keeps it inside the form it belongs to. `--seller-dock` lifts it
 * above the mobile bottom tab bar once that exists (Phase 1).
 *
 * Usage — render it as the LAST child of the `<form>`:
 *
 *   <form onSubmit={save}>
 *     …fields…
 *     <SaveBar dirty={dirty} saving={busy} onDiscard={reset} />
 *   </form>
 */
export function SaveBar({
  dirty,
  saving = false,
  error,
  saveLabel = 'Save changes',
  message = 'You have unsaved changes',
  onDiscard,
  onSave,
  guard = true,
}: {
  dirty: boolean
  saving?: boolean
  /** Shown in the bar (danger) when the last save failed. */
  error?: ReactNode
  saveLabel?: string
  message?: ReactNode
  /** Puts the edited fields back. Omit to hide the button. */
  onDiscard?: () => void
  /** Without it the button submits the enclosing `<form>`. */
  onSave?: () => void
  /** Warn before leaving with unsaved edits. Off only when a page already
   *  guards itself. */
  guard?: boolean
}) {
  const prompt = useUnsavedChangesGuard(guard && dirty)
  const visible = dirty || saving || Boolean(error)

  return (
    <>
      {prompt}
      {visible && (
        <div
          className="sticky z-20 mt-5 bottom-[calc(var(--seller-dock,0px)+0.75rem)]"
          role="region"
          aria-label="Save changes"
        >
          <div className="glass-strong flex animate-sheet-in flex-col gap-3 rounded-glass p-3 sm:flex-row sm:items-center sm:gap-4 sm:pl-5">
            <p
              aria-live="polite"
              className={`min-w-0 flex-1 text-[14px] font-medium ${error ? 'text-danger' : 'text-fg'}`}
            >
              {error ?? (saving ? 'Saving your changes…' : message)}
            </p>
            <div className="flex gap-2">
              {onDiscard && (
                <Button
                  type="button"
                  variant="ring"
                  size="lg"
                  disabled={saving}
                  onClick={onDiscard}
                  className="flex-1 sm:flex-none"
                >
                  Undo changes
                </Button>
              )}
              <Button
                type={onSave ? 'button' : 'submit'}
                size="lg"
                loading={saving}
                onClick={onSave}
                className="flex-1 sm:flex-none"
              >
                {saving ? 'Saving…' : saveLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

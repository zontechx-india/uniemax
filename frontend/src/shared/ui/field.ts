/**
 * Form-control styling — ONE source for every input, select and textarea in
 * both apps (docs/DESIGN_GUIDELINES.md §7, §8).
 *
 * - `md` (default): 48px tall, 16px text — the storefront and seller forms.
 * - `dense`: 44px tall, 14px text — the admin console's denser screens (a
 *   phone still gets 16px from the coarse-pointer rule in index.css, so iOS
 *   never zooms).
 *
 * States: hover darkens the border, focus turns it accent, `invalid` turns it
 * red (pair with an error line under the field), disabled dims it. A textarea
 * passes `multiline` for auto height with vertical padding.
 */
export function fieldClass({
  dense = false,
  invalid = false,
  multiline = false,
  className = '',
}: {
  dense?: boolean
  invalid?: boolean
  multiline?: boolean
  className?: string
} = {}): string {
  const size = multiline
    ? `min-h-24 py-3 ${dense ? 'px-3 text-sm' : 'px-4 text-base'}`
    : dense
      ? 'h-tap px-3 text-sm'
      : 'h-field px-4 text-base'
  return (
    'w-full rounded-md border bg-input text-fg outline-none transition-colors ' +
    'placeholder:text-muted hover:border-fg/30 focus:border-accent ' +
    'disabled:cursor-not-allowed disabled:opacity-60 ' +
    `${invalid ? 'border-danger' : 'border-line'} ${size} ${className}`
  )
}

/** A field's label: 14px, medium, full ink — never muted. */
export const FIELD_LABEL = 'mb-1.5 block text-sm font-medium text-fg'

/** The line under a field: a hint (muted) or an error (red, medium). */
export function fieldNoteClass(error = false): string {
  return `mt-1.5 block text-xs ${error ? 'font-medium text-danger' : 'text-muted'}`
}

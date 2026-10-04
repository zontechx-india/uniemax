import { useState } from 'react'
import type { ReactNode } from 'react'
import { Dialog } from '../../../../shared/ui/Dialog'
import { InfoIcon } from '../../../layout/icons'

/**
 * ⓘ beside a field label — opens a sheet that explains the field in plain
 * words: what it is, where to find it, and an example. For the terms a seller
 * cannot be expected to know (IFSC, GSTIN, UPI ID); the one-line `hint` under
 * a field stays the first help, this is the longer answer.
 *
 * Place it INSIDE a label's text and it does not steal the label's click: the
 * button stops the event so tapping ⓘ never focuses the input behind it.
 */
export function HelpHint({
  topic,
  children,
}: {
  /** What is being explained — the sheet's heading and the button's name. */
  topic: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
        }}
        aria-label={`What is ${topic}?`}
        // 24px glyph, 44px hit area — the negative margin keeps it from
        // pushing the label line taller.
        className="-my-2.5 inline-flex size-tap items-center justify-center rounded-full align-middle text-brand transition-colors hover:bg-brand-soft"
      >
        <InfoIcon className="h-5 w-5" />
      </button>
      <Dialog open={open} title={topic} onClose={() => setOpen(false)}>
        <div className="space-y-3 text-[15px] leading-relaxed text-fg">{children}</div>
      </Dialog>
    </>
  )
}

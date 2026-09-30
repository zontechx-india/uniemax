import { useId } from 'react'
import { Button } from '../../../shared/ui/Button'
import type { ButtonVariant } from '../../../shared/ui/Button'
import { ArrowRightIcon, LinkIcon, StoreIcon } from '../../layout/icons'
import { STORE_NAME_MAX, previewStoreSlug, useStartSelling } from './startSelling'

/**
 * "Name your store" → Create — the /sell page's primary action.
 *
 * Typing the name first is a small commitment that turns "an online store"
 * into THEIR store (the link preview makes it concrete), and it is not asked
 * twice: the name rides through sign-up into the Create Store wizard's first
 * field (`useStartSelling`). An empty field never blocks — the button still
 * starts the flow, and the wizard asks for the name.
 *
 * The white panel carries `sell-light` so it reads as a field on the dark
 * bands it sits on. The input is 16px on purpose: anything smaller and iOS
 * Safari zooms the page on focus.
 */
export function ClaimStoreForm({
  value,
  onChange,
  placement,
  variant,
}: {
  value: string
  onChange: (value: string) => void
  /** Analytics name of this form's button (`seller_cta_click`). */
  placement: string
  /** `sheen` for the ONE hero action; `rise` for the repeat further down. */
  variant: ButtonVariant
}) {
  const start = useStartSelling()
  const inputId = useId()
  const slug = previewStoreSlug(value)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        start(placement, value)
      }}
    >
      <label htmlFor={inputId} className="mb-3 block text-sm font-medium text-fg">
        Name your store{' '}
        <span className="font-normal text-muted">— you can change it later</span>
      </label>

      <div className="sell-light flex flex-col gap-2 rounded-2xl bg-surface p-2 shadow-[0_20px_48px_-20px_rgb(5_7_13/0.55)] ring-brand/40 transition focus-within:ring-4 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <StoreIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            id={inputId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={STORE_NAME_MAX}
            placeholder="e.g. Sharma Sports"
            autoComplete="organization"
            autoCapitalize="words"
            enterKeyHint="go"
            className="h-12 w-full rounded-xl bg-transparent pl-12 pr-3 text-[16px] text-fg outline-none placeholder:text-muted"
          />
        </div>
        <Button type="submit" variant={variant} size="lg" className="w-full sm:w-auto sm:px-7">
          Create my store
          <ArrowRightIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Link preview once there is something to preview; until then, the
          three facts that stop people starting. */}
      <p aria-live="polite" className="mt-3 flex min-h-6 items-center gap-2 text-sm text-muted">
        {slug ? (
          <>
            <LinkIcon className="h-4 w-4 shrink-0 text-brand" />
            <span className="min-w-0 truncate">
              Link preview:{' '}
              <span className="font-medium text-fg">
                {window.location.host}/store/{slug}
              </span>
            </span>
          </>
        ) : (
          'Free to start · No card needed · Set up in minutes'
        )}
      </p>
    </form>
  )
}

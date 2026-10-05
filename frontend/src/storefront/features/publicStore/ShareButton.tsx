import { useEffect, useRef, useState } from 'react'
import { shareOrCopy } from '../../../shared/share'
import { CheckIcon, ShareIcon } from '../../layout/icons'
import type { Skin } from './storeTheme'

/**
 * Share control for the public storefront (store header + product page).
 * Opens the native share sheet where one exists (mobile); otherwise copies
 * the link and confirms with a brief check/"Link copied!". The URLs shared
 * are the permanent public ones, so whoever receives the link lands straight
 * on the store or product — no account needed.
 *
 * Two shapes: `icon` (round chrome button, matches the header's cart button)
 * and `button` (labelled pill for page bodies).
 */
export function ShareButton({
  title,
  url,
  skin,
  variant = 'icon',
  label = 'Share',
  ariaLabel,
}: {
  /** Title passed to the native share sheet. */
  title: string
  /** Absolute URL to share/copy. */
  url: string
  skin: Skin
  variant?: 'icon' | 'button'
  /** Button-variant label. */
  label?: string
  ariaLabel?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const share = async () => {
    const outcome = await shareOrCopy({ title, url })
    if (outcome === 'copied') {
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    }
  }

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={share}
        aria-label={copied ? 'Link copied' : (ariaLabel ?? `Share ${title}`)}
        title={copied ? 'Link copied!' : (ariaLabel ?? 'Share')}
        className={`relative flex size-tap shrink-0 items-center justify-center rounded-full border ${skin.border} ${skin.chip} transition hover:opacity-80`}
      >
        {copied ? (
          <CheckIcon className="h-5 w-5 text-success" />
        ) : (
          <ShareIcon className={`h-5 w-5 ${skin.text}`} />
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={share}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3.5 text-xs font-semibold transition hover:opacity-80 ${skin.border} ${skin.chip} ${skin.text}`}
    >
      {copied ? (
        <>
          <CheckIcon className="h-3.5 w-3.5 text-success" />
          Link copied!
        </>
      ) : (
        <>
          <ShareIcon className="h-3.5 w-3.5" />
          {label}
        </>
      )}
    </button>
  )
}

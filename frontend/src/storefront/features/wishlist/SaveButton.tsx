import type { AuthDialogOptions } from '../auth/authDialogStore'
import { HeartIcon } from '../../layout/icons'
import { toggleSaved, useIsSaved } from './wishlist'

/**
 * The heart on a product card or product page. Round, icon-only, sitting on
 * the photo — so it is a sibling of the card's link, never inside it (a
 * button inside an `<a>` is invalid HTML and steals the card's click).
 *
 * Filled + brand colour when saved; `aria-pressed` says the same to a screen
 * reader. Built from the semantic tokens, so inside a store it wears the
 * store's palette. `auth` is the sign-in dialog's look for a guest's tap.
 */
export function SaveButton({
  productId,
  productName,
  auth,
  className = '',
}: {
  productId: string
  productName: string
  auth?: AuthDialogOptions
  className?: string
}) {
  const isSaved = useIsSaved(productId)
  const label = isSaved ? `Remove ${productName} from Saved` : `Save ${productName}`
  return (
    <button
      type="button"
      aria-pressed={isSaved}
      aria-label={label}
      title={isSaved ? 'Saved' : 'Save'}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        toggleSaved(productId, auth)
      }}
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface shadow-floating transition-colors hover:text-brand ${
        isSaved ? 'text-brand' : 'text-fg'
      } ${className}`}
    >
      <HeartIcon className={`h-5 w-5 ${isSaved ? 'fill-current' : ''}`} />
    </button>
  )
}

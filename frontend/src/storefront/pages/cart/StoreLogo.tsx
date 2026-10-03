import type { PublicStore } from '../../features/stores/storesApi'
import { StoreIcon } from '../../layout/icons'
import { MediaImg } from '../../../shared/media/MediaImg'

/**
 * Store identity badge on the cart/checkout pages: the store's uploaded logo
 * when it has one, otherwise the generic store glyph. Sized by the caller.
 */
export function StoreLogo({
  shell,
  name,
  className = 'h-9 w-9',
}: {
  /** The store shell (undefined while loading, null when unavailable). */
  shell: PublicStore | null | undefined
  name: string
  className?: string
}) {
  if (shell?.logoUrl) {
    return (
      <MediaImg
        sizes="96px"
        src={shell.logoUrl}
        alt={`${name} logo`}
        loading="lazy"
        className={`${className} shrink-0 rounded-md border border-line object-cover`}
      />
    )
  }
  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center rounded-md bg-surface-alt text-muted`}
    >
      <StoreIcon className="h-1/2 w-1/2" />
    </span>
  )
}

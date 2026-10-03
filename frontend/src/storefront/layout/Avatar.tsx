import type { Customer } from '../../shared/auth/authApi'
import { MediaImg } from '../../shared/media/MediaImg'

/**
 * Customer avatar: the profile photo when set, otherwise a brand-tinted
 * initial. Sized by the caller via `className` (h-* and w-* classes).
 */
export function Avatar({
  customer,
  className = 'h-10 w-10',
}: {
  customer: Customer
  className?: string
}) {
  if (customer.avatarUrl) {
    return (
      <MediaImg
        sizes="96px"
        src={customer.avatarUrl}
        alt=""
        className={`shrink-0 rounded-full object-cover ring-2 ring-surface ${className}`}
      />
    )
  }

  const initial = (customer.name ?? customer.email ?? 'C')
    .trim()
    .charAt(0)
    .toUpperCase()

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-brand-contrast ${className}`}
    >
      {initial}
    </div>
  )
}

/**
 * The two glyphs the Media Board needs that the shared icon set does not
 * carry. Same 24-box, same stroke weight, so they sit beside the shared ones
 * without looking borrowed.
 */

export function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 18.5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h3l1.6-2.5h6.8L17 7.5h3a2 2 0 0 1 2 2Z" />
      <circle cx="12" cy="13.5" r="3.6" />
    </svg>
  )
}

export function VideoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="6" width="13" height="12" rx="2" />
      <path d="m22 8-5 4 5 4z" />
    </svg>
  )
}

export function RotateIcon({
  className,
  flip = false,
}: {
  className?: string
  /** Mirrors the glyph for the "turn left" twin. */
  flip?: boolean
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <path d="M21 4v6h-6" />
      <path d="M20.5 13a8.5 8.5 0 1 1-2.2-7.1L21 8.5" />
    </svg>
  )
}

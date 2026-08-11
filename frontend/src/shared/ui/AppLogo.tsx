/**
 * UnieMax brand art. Two supplied assets, both RGBA with a transparent
 * background, live in `public/`:
 *
 *   app_logo.png            the bag mark (white U on the brand purple) —
 *                           `AppLogoFull` on splash screens, and the tab icon
 *                           in both HTML entries
 *   app_logo_with_name.png  the full lockup, mark + "UnieMax" — `AppLogoLockup`,
 *                           which is what app chrome uses
 *
 * The lockup sets the name in near-black + purple, so it needs a dark-scheme
 * twin (`app_logo_with_name_dark.png`, "Unie" lifted to white) — the swap is
 * a CSS variable, so only the used file is fetched. See `.logo-lockup` in
 * `index.css`.
 */

/** The bare mark, for splash screens. */
export function AppLogoFull({ className = 'w-40' }: { className?: string }) {
  return (
    <img
      src="/app_logo.png"
      alt="UnieMax"
      draggable={false}
      className={`select-none object-contain ${className}`}
    />
  )
}

/**
 * The mark + name lockup — the brand signature in app chrome (headers,
 * footers, login pages, the admin rail). Size it by HEIGHT only; the width
 * follows the artwork's aspect ratio.
 *
 * `tone="on-dark"` pins the white-name twin for the auth heroes, which sit on
 * a dark photo in both schemes.
 */
export function AppLogoLockup({
  className = 'h-9',
  tone = 'auto',
}: {
  className?: string
  tone?: 'auto' | 'on-dark'
}) {
  return (
    <span
      role="img"
      aria-label="UnieMax"
      className={`logo-lockup block shrink-0 ${
        tone === 'on-dark' ? 'logo-lockup-on-dark ' : ''
      }${className}`}
    />
  )
}

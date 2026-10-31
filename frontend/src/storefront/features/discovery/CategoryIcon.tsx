import { GlobeIcon, PaletteIcon, StarIcon, TagIcon } from '../../layout/icons'

/**
 * A line icon per top-level taxonomy node — what a "Shop by category" tile
 * shows until an admin uploads the category's own picture.
 *
 * Keyed by slug: the roots come from `backend/src/scripts/seedCategories.ts`
 * and their slugs never change on rename. A slug not listed here (a root an
 * admin adds later) gets the generic tag, so nothing ever renders blank.
 * Same 24px stroke grid as `layout/icons.tsx`.
 */
const PATHS: Record<string, React.ReactNode> = {
  electronics: (
    <>
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
    </>
  ),
  'computers-accessories': (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2 19h20" />
    </>
  ),
  fashion: <path d="M8 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4-3c0 2-1.8 3-4 3S8 5 8 3z" />,
  'sports-fitness': <path d="M6 7v10M18 7v10M3 9.5v5M21 9.5v5M6 12h12" />,
  'bags-luggage': (
    <>
      <rect x="5" y="7" width="14" height="13" rx="2" />
      <path d="M9 7V4.5h6V7M9 11v5M15 11v5" />
    </>
  ),
  'home-kitchen': (
    <path d="M4 10h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM2 10h2M20 10h2M9 6.5c0-1 1-1.5 1-2.5M14 6.5c0-1 1-1.5 1-2.5" />
  ),
  'grocery-food': (
    <path d="M12 7c-1.5-1-5-1.5-6.5 1.5S5 16 8 19c1.5 1.5 2.5 1 4 .5 1.5.5 2.5 1 4-.5 3-3 4-7.5 2.5-10.5S13.5 6 12 7zM12 7c0-2 1-3.5 3-4" />
  ),
  automotive: (
    <>
      <path d="M4 17v-5l2.2-5h11.6L20 12v5zM4 12h16" />
      <circle cx="8" cy="17" r="2" />
      <circle cx="16" cy="17" r="2" />
    </>
  ),
  'beauty-personal-care': (
    <>
      <rect x="8" y="13" width="8" height="8" rx="1" />
      <path d="M9.5 13V8h5v5M9.5 8 12 3l2.5 2.5V8" />
    </>
  ),
  'health-wellness': (
    <path d="M20.5 8.5c0-3-2.5-5-5-5-1.6 0-2.8.8-3.5 2-.7-1.2-1.9-2-3.5-2-2.5 0-5 2-5 5 0 5.5 8.5 11 8.5 11s8.5-5.5 8.5-11zM6 11h3l1.5-2.5 2.5 5 1.5-2.5h3.5" />
  ),
  'toys-games': (
    <>
      <rect x="2.5" y="7" width="19" height="10" rx="5" />
      <path d="M7 10.5v3M5.5 12h3M15.5 11h.01M17.5 13h.01" />
    </>
  ),
  'baby-kids': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 14.5a3.5 3.5 0 0 0 6 0M9 10h.01M15 10h.01" />
    </>
  ),
  'pet-supplies': (
    <>
      <circle cx="6.5" cy="10" r="1.8" />
      <circle cx="10" cy="6" r="1.8" />
      <circle cx="14.5" cy="6" r="1.8" />
      <circle cx="18" cy="10" r="1.8" />
      <path d="M7.5 17.5c0-3 2.5-5.5 4.5-5.5s4.5 2.5 4.5 5.5c0 2-2 2.5-4.5 2.5s-4.5-.5-4.5-2.5z" />
    </>
  ),
  'books-stationery': (
    <path d="M4 19V5a2 2 0 0 1 2-2h14v14H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h14" />
  ),
  'jewelry-accessories': <path d="M6 3h12l3 6-9 12L3 9zM3 9h18M9 3 7.5 9 12 21l4.5-12L15 3" />,
  'shoes-footwear': <path d="M3 16V8l4 1.5L10 7l3 4 6 2a2 2 0 0 1 2 2v1zM3 16v3h18v-3" />,
  furniture: (
    <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM5 18v2M19 18v2" />
  ),
  'garden-outdoor': (
    <path d="M12 21v-9M12 12c0-4 3-7 8-7 0 5-3 7-8 7zM12 15c0-3-2.5-5-6.5-5 0 3.5 2.5 5 6.5 5z" />
  ),
  'tools-hardware': <path d="m14 4 6 6-2 2-6-6zM13 7l-9 9a1.4 1.4 0 0 0 2 2l9-9" />,
  electrical: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  appliances: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="13" r="4.5" />
      <path d="M7 6.5h2" />
    </>
  ),
  'home-improvement': (
    <>
      <rect x="4" y="3" width="14" height="5" rx="1" />
      <path d="M18 5.5h2v5h-8v3M10.5 13.5h3V21h-3z" />
    </>
  ),
  'office-business': (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5h6v2M3 12h18" />
    </>
  ),
  'industrial-commercial': <path d="M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17zM7 17h2M12 17h2" />,
  'musical-instruments': (
    <>
      <path d="M9 18V5l11-2v13" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </>
  ),
}

/** Roots better served by an icon the shell already has. */
const SHARED: Record<string, (props: { className?: string }) => React.ReactNode> = {
  'arts-crafts': PaletteIcon,
  'travel-lifestyle': GlobeIcon,
  'hobbies-collectibles': StarIcon,
}

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Shared = SHARED[slug]
  if (Shared) return <Shared className={className} />
  const paths = PATHS[slug]
  if (!paths) return <TagIcon className={className} />
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  )
}

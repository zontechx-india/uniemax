/**
 * Kept as its own module because ~20 screens import `usePageTitle` from here.
 * The implementation moved to `seo.ts`, which manages the whole head (title,
 * description, canonical, robots, social cards, JSON-LD) rather than the
 * title alone.
 *
 * New code should import `useSeo` from `./seo` directly; `usePageTitle` is
 * the title-only shorthand for pages that have nothing else to say.
 */
export { usePageTitle, useSeo, applySeo, type SeoOptions } from './seo'

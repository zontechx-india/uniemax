/**
 * The storefront's layout constants — shared by the header, every homepage
 * section band, each page shell and the footer.
 *
 * They live in their own module rather than in `PublicStoreLayout` because the
 * header needs them too, and the layout already imports the header: a constant
 * shared both ways belongs above both.
 */

/**
 * The one content column every storefront surface shares.
 *
 * **Full-width backgrounds, centered max-width content.** Bands, bars and the
 * footer still paint edge to edge; only what you *read* is capped, at 1440px,
 * which is where a 5-across product row lands on ~270px cards. An earlier
 * revision capped at 1920px and let the grid run to six columns — on a 2560px
 * monitor that produced a wall of tiny cards and headline measures nobody
 * reads across.
 *
 * Re-exported rather than declared: the marketplace homepage reads the same
 * constant from `layout/contentWidth`, so the shop and the marketplace around
 * it can never again be capped at two different widths.
 */
export { CONTENT_COLUMN as STORE_CONTAINER } from '../../layout/contentWidth'

/**
 * Height of the sticky header, published as a CSS variable on the store root
 * so anything that has to sit *just* below it — the listing sort/filter bar,
 * every in-page anchor's `scroll-mt` — stays in step with it at every
 * breakpoint instead of hardcoding a number that only holds on desktop. The
 * phone header is two rows (bar + search), so it is the taller of the two.
 */
export const STORE_HEADER_OFFSET =
  '[--store-header:7rem] md:[--store-header:4.15rem]'

/** Sits flush under the sticky header. */
export const STICK_UNDER_HEADER = 'top-[var(--store-header)]'

/** Anchor targets clear the sticky header when scrolled to. */
export const SCROLL_UNDER_HEADER = 'scroll-mt-[var(--store-header)]'

/**
 * A horizontal scroller that bleeds to the screen edge on phones (so the last
 * chip/card is visibly cut off, which is what tells a thumb to swipe) and
 * tucks back into the content column from `sm`. The scrollbar is hidden in
 * all three engines; the scrolling itself is untouched.
 */
export const EDGE_SCROLLER =
  '-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'

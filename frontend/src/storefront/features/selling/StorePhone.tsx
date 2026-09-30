import { initialsOf } from '../../../shared/media/letterLogo'
import { CartIcon, SearchIcon } from '../../layout/icons'
import { storeVars } from '../publicStore/storeTheme'
import { rupees } from './demoStores'
import type { DemoStore } from './demoStores'

/**
 * A storefront on a phone — the /sell page's product shot.
 *
 * Built from markup rather than a screenshot: it stays sharp at any density,
 * costs nothing to download, and is themed through the SAME `storeVars()` a
 * real store page uses, so recoloring it (the theme picker) is literally how
 * a seller's shop recolors. Sizes are in px, not rem: this is a picture of a
 * screen, and it must not reflow with the app's root font scale.
 *
 * One image to assistive tech (`role="img"` + label); the markup inside is
 * decoration.
 */
export function StorePhone({
  store,
  className = '',
}: {
  store: DemoStore
  className?: string
}) {
  return (
    <div
      role="img"
      aria-label={`Example ${store.kind.toLowerCase()} store, “${store.name}”, on a phone`}
      className={`sell-phone relative w-[276px] shrink-0 rounded-[46px] p-[10px] ${className}`}
    >
      <div
        className="relative h-[556px] overflow-hidden rounded-[36px] bg-bg text-fg transition-colors duration-500"
        style={storeVars(store.theme)}
      >
        {/* Dynamic island */}
        <div className="absolute left-1/2 top-[10px] z-10 h-[24px] w-[88px] -translate-x-1/2 rounded-full bg-black" />

        {/* Status bar */}
        <div className="flex h-[44px] items-end justify-between px-[26px] pb-[4px] text-[12px] font-semibold">
          <span>9:41</span>
          <span className="flex items-center gap-[4px]">
            <span className="flex items-end gap-[2px]">
              {[4, 6, 8, 10].map((h) => (
                <span key={h} className="w-[3px] rounded-[1px] bg-fg" style={{ height: h }} />
              ))}
            </span>
            <span className="relative ml-[2px] h-[11px] w-[22px] rounded-[3px] border border-fg/50 p-[1.5px]">
              <span className="block h-full w-[70%] rounded-[1.5px] bg-fg" />
            </span>
          </span>
        </div>

        {/* Store header */}
        <div className="flex items-center gap-[10px] px-[16px] pt-[10px]">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--cta)] text-[12px] font-bold text-[var(--cta-contrast)] transition-colors duration-500">
            {initialsOf(store.name)}
          </span>
          <span className="min-w-0 flex-1 truncate font-heading text-[15px] font-bold">
            {store.name}
          </span>
          <span className="relative">
            <CartIcon className="h-[20px] w-[20px]" />
            <span className="absolute -right-[5px] -top-[5px] flex h-[14px] w-[14px] items-center justify-center rounded-full bg-[var(--cta)] text-[8px] font-bold text-[var(--cta-contrast)] transition-colors duration-500">
              2
            </span>
          </span>
        </div>

        {/* Search */}
        <div className="mx-[16px] mt-[12px] flex h-[36px] items-center gap-[8px] rounded-full bg-surface-alt px-[12px] text-[11px] text-muted transition-colors duration-500">
          <SearchIcon className="h-[14px] w-[14px]" />
          Search products
        </div>

        {/* Banner */}
        <div className="relative mx-[16px] mt-[12px] overflow-hidden rounded-[18px] bg-[var(--cta)] px-[16px] py-[16px] text-[var(--cta-contrast)] transition-colors duration-500">
          <span className="absolute -right-[28px] -top-[36px] h-[120px] w-[120px] rounded-full bg-white/10" />
          <span className="absolute -bottom-[48px] right-[40px] h-[96px] w-[96px] rounded-full bg-white/10" />
          <span className="absolute right-[12px] top-1/2 -translate-y-1/2 text-[42px] leading-none">
            {store.products[0].emoji}
          </span>
          <p className="relative text-[9px] font-semibold uppercase tracking-[0.12em] opacity-80">
            {store.banner.eyebrow}
          </p>
          {/* Narrow enough that no title reaches the emoji on the right. */}
          <p className="relative mt-[4px] max-w-[138px] font-heading text-[17px] font-extrabold leading-[1.15]">
            {store.banner.title}
          </p>
          <p className="relative mt-[4px] max-w-[138px] text-[10.5px] opacity-85">
            {store.banner.subtitle}
          </p>
          <span className="relative mt-[10px] inline-flex h-[26px] items-center rounded-full bg-white px-[12px] text-[10px] font-bold text-[var(--cta)] transition-colors duration-500">
            Shop now
          </span>
        </div>

        {/* Shelves */}
        <div className="mt-[12px] flex gap-[6px] px-[16px]">
          {store.shelves.map((shelf, index) => (
            <span
              key={shelf}
              className={`rounded-full px-[12px] py-[5px] text-[10px] font-semibold transition-colors duration-500 ${
                index === 0 ? 'bg-brand text-brand-contrast' : 'bg-surface-alt text-fg'
              }`}
            >
              {shelf}
            </span>
          ))}
        </div>

        {/* Best sellers */}
        <div className="mt-[14px] flex items-baseline justify-between px-[16px]">
          <p className="font-heading text-[13px] font-bold">Best sellers</p>
          <p className="text-[10px] font-semibold text-brand transition-colors duration-500">
            See all
          </p>
        </div>
        <div className="mt-[8px] grid grid-cols-2 gap-[10px] px-[16px]">
          {store.products.map((product) => (
            <div
              key={product.name}
              className="overflow-hidden rounded-[14px] border border-line bg-surface transition-colors duration-500"
            >
              <div
                className="flex h-[86px] items-center justify-center text-[40px] leading-none transition-colors duration-500"
                style={{ backgroundColor: 'color-mix(in srgb, var(--cta) 9%, var(--surface))' }}
              >
                {product.emoji}
              </div>
              <div className="px-[8px] py-[7px]">
                <p className="truncate text-[10.5px] font-medium">{product.name}</p>
                <p className="mt-[2px] flex items-baseline gap-[4px]">
                  <span className="text-[12px] font-bold">{rupees(product.price)}</span>
                  {product.mrp !== undefined && (
                    <span className="text-[9.5px] text-muted line-through">
                      {rupees(product.mrp)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* The list runs on below the fold — fade it out, then the home bar. */}
        <div
          className="absolute inset-x-0 bottom-0 h-[72px]"
          style={{ backgroundImage: 'linear-gradient(to bottom, transparent, var(--bg))' }}
        />
        <div className="absolute bottom-[8px] left-1/2 h-[4px] w-[104px] -translate-x-1/2 rounded-full bg-fg/80" />
      </div>
    </div>
  )
}

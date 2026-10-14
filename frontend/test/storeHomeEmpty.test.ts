// A store with no products: its banners and footer still render, with
// "Products coming soon" in the product area between them; and the retired
// Welcome Hero stays gone. Renders the REAL components server-side through
// Vite (which supplies the JSX transform and `import.meta.env`) — no
// browser: `npm run test:unit`.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

type HomePageModule = typeof import('../src/storefront/pages/store/StoreHomePage')
type FooterModule = typeof import('../src/storefront/features/publicStore/StoreFooter')
type ApiModule = typeof import('../src/storefront/features/stores/storesApi')
type ThemeModule = typeof import('../src/storefront/features/publicStore/storeTheme')
type PublicStore = import('../src/storefront/features/stores/storesApi').PublicStore
type PublicStoreHome = import('../src/storefront/features/stores/storesApi').PublicStoreHome
type HomepageSection = import('../src/storefront/features/stores/storesApi').HomepageSection

let vite: ViteDevServer
let page: HomePageModule
let footer: FooterModule
let api: ApiModule
let theme: ThemeModule

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    plugins: [react()],
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false, ws: false },
  })
  // `shared/seo.ts` reads index.html's default title and meta tags at import
  // time. An empty <head> is all it needs; nothing rendered here touches the
  // document, so it is removed again once the modules are loaded.
  const g = globalThis as { document?: unknown }
  g.document = { title: '', head: { querySelector: () => null } }
  try {
    ;[page, footer, api, theme] = (await Promise.all([
      vite.ssrLoadModule('/src/storefront/pages/store/StoreHomePage.tsx'),
      vite.ssrLoadModule('/src/storefront/features/publicStore/StoreFooter.tsx'),
      vite.ssrLoadModule('/src/storefront/features/stores/storesApi.ts'),
      vite.ssrLoadModule('/src/storefront/features/publicStore/storeTheme.ts'),
    ])) as [HomePageModule, FooterModule, ApiModule, ThemeModule]
  } finally {
    delete g.document
  }
})

after(async () => {
  await vite?.close()
})

const ABOUT = 'Handmade gifts from Chennai.'

function shop(overrides: Partial<PublicStore> = {}): PublicStore {
  return {
    id: 's1',
    name: 'ZoneMax',
    slug: 'zonemax',
    logoUrl: null,
    shareImageUrl: null,
    theme: api.DEFAULT_THEME,
    isPublished: false,
    footer: { ...api.EMPTY_FOOTER, info: { ...api.EMPTY_FOOTER.info, about: ABOUT } },
    payments: api.DEFAULT_PAYMENTS,
    shipping: { mode: api.DEFAULT_SHIPPING.mode, rate: api.DEFAULT_SHIPPING_RATE },
    checkout: api.DEFAULT_CHECKOUT_FIELDS,
    // No categories with anything to buy = no products.
    categories: [],
    ...overrides,
  }
}

function sections(overrides: Partial<Record<HomepageSection['key'], Partial<HomepageSection>>> = {}) {
  return api.HOMEPAGE_SECTION_KEYS.map(
    (key) => ({ key, enabled: true, ...overrides[key] }) as HomepageSection,
  )
}

function payload(overrides: Partial<PublicStoreHome> = {}): PublicStoreHome {
  return {
    sections: sections(),
    banners: [],
    featuredCategories: [],
    featured: [],
    newArrivals: [],
    bestSellers: [],
    categoryRows: [],
    catalog: [],
    ...overrides,
  }
}

/** The page as the store layout draws it: the homepage in <main>, then the footer. */
function render(store: PublicStore, home: PublicStoreHome | null | undefined): string {
  return renderToStaticMarkup(
    h(
      MemoryRouter,
      null,
      h('main', null, h(page.StoreHomeView, { store, skin: theme.SKIN, home })),
      h(footer.StoreFooter, { store, skin: theme.SKIN }),
    ),
  )
}

/** Where each landmark sits in the markup; -1 when it is missing. */
function positions(html: string) {
  return {
    banner: html.indexOf('id="shop-banners"'),
    comingSoon: html.indexOf('Products coming soon'),
    footer: html.indexOf('<footer'),
  }
}

test('0 products, Banner/Footer on: both render, "Products coming soon" between them', () => {
  const html = render(shop(), payload())
  const at = positions(html)

  for (const [name, index] of Object.entries(at)) assert.ok(index >= 0, `${name} is missing`)
  assert.ok(at.banner < at.comingSoon, 'coming-soon card after the banner')
  assert.ok(at.comingSoon < at.footer, 'coming-soon card before the footer')
  // Exactly one coming-soon card — not a full-page takeover plus a section.
  assert.equal(html.split('Products coming soon').length - 1, 1)
})

test('the Welcome Hero is gone: no hero section, no About intro, no hero button', () => {
  const html = render(shop(), payload())

  assert.ok(!api.HOMEPAGE_SECTION_KEYS.includes('hero' as never))
  assert.ok(!html.includes('Start Shopping'))
  // The About text now appears only in the footer.
  assert.equal(html.split(ABOUT).length - 1, 1)
  assert.ok(html.indexOf(ABOUT) > html.indexOf('<footer'))
})

test('the page keeps one heading — the store name, for search and screen readers', () => {
  for (const home of [payload(), undefined]) {
    const html = render(shop(), home)
    assert.equal(html.split('<h1').length - 1, 1)
    assert.ok(html.includes('<h1 class="sr-only">ZoneMax</h1>'))
  }
})

test('a saved "hero" section is ignored when the homepage is read', () => {
  const stored = {
    sections: [
      { key: 'banners', enabled: true },
      { key: 'hero', enabled: true, settings: { title: 'Hi', ctaLabel: 'Go' } },
      { key: 'catalog', enabled: false },
    ],
  }
  const keys = api.resolveHomepage(stored).map((section) => section.key)

  assert.ok(!keys.includes('hero' as never))
  assert.deepEqual(keys.slice(0, 2), ['banners', 'categories'])
  assert.equal(api.resolveHomepage(stored).find((s) => s.key === 'catalog')?.enabled, false)
})

test('a banner with no uploaded image shows the store name on the brand colour', () => {
  const html = render(shop(), payload())
  const banner = html.slice(html.indexOf('id="shop-banners"'), html.indexOf('id="shop-products"'))

  assert.ok(banner.includes('bg-[var(--cta)]'), 'brand-colour slide')
  assert.match(banner, />ZoneMax</)
  assert.doesNotMatch(banner, /<img/, 'no empty image frame')
})

test('switches still rule: Banners off hides it, coming-soon and footer stay', () => {
  const html = render(shop(), payload({ sections: sections({ banners: { enabled: false } }) }))
  const at = positions(html)

  assert.equal(at.banner, -1)
  assert.ok(at.comingSoon >= 0 && at.footer > at.comingSoon)
})

test('while the homepage loads, an empty shop already shows the coming-soon card', () => {
  const html = render(shop(), undefined)

  assert.ok(html.includes('Products coming soon'))
})

test('a shop WITH products and no banners: no placeholder, no coming-soon card', () => {
  const stocked = shop({
    categories: [
      { id: 'c1', name: 'Gifts', slug: 'gifts', imageUrl: null, isFeatured: false, productCount: 4, subcategories: [] },
    ],
  })
  const html = render(stocked, payload())

  assert.equal(positions(html).banner, -1)
  assert.ok(!html.includes('Products coming soon'))
})

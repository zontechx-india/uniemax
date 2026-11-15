// Which product sections the storefront homepage draws, and when.
//
// A seller marks products as Best Seller / Featured / New Arrival and expects
// to see them. The rule (StoreHomePage `shapeHome`): a BIG shop (more than
// 12 products) gets a row per enabled section; a SMALL shop shows every
// product once in "All Products", with the marked ones first. Also: the trust
// facts (delivery, COD, UPI) stay on the page when a banner replaces the
// intro. Renders the REAL components server-side through Vite, like
// storeHomeEmpty.test.ts: `npm run test:unit`.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { createServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

type HomePageModule = typeof import('../src/storefront/pages/store/StoreHomePage')
type ApiModule = typeof import('../src/storefront/features/stores/storesApi')
type ThemeModule = typeof import('../src/storefront/features/publicStore/storeTheme')
type PublicStore = import('../src/storefront/features/stores/storesApi').PublicStore
type PublicStoreHome = import('../src/storefront/features/stores/storesApi').PublicStoreHome
type PublicProduct = import('../src/storefront/features/stores/storesApi').PublicProduct

let vite: ViteDevServer
let page: HomePageModule
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
  const g = globalThis as { document?: unknown }
  g.document = { title: '', head: { querySelector: () => null } }
  try {
    ;[page, api, theme] = (await Promise.all([
      vite.ssrLoadModule('/src/storefront/pages/store/StoreHomePage.tsx'),
      vite.ssrLoadModule('/src/storefront/features/stores/storesApi.ts'),
      vite.ssrLoadModule('/src/storefront/features/publicStore/storeTheme.ts'),
    ])) as [HomePageModule, ApiModule, ThemeModule]
  } finally {
    delete g.document
  }
})

after(async () => {
  await vite?.close()
})

function product(id: string, name: string): PublicProduct {
  return {
    id,
    name,
    slug: id,
    description: null,
    price: '299',
    priceMax: '299',
    compareAtPrice: null,
    stockQuantity: 5,
    variantCount: 0,
    category: { name: 'Phones', slug: 'phones' },
    image: null,
  }
}

/** A shop whose one category holds `count` products. */
function shop(count: number): PublicStore {
  return {
    id: 's1',
    name: 'ZoneMax',
    slug: 'zonemax',
    logoUrl: null,
    shareImageUrl: null,
    theme: api.DEFAULT_THEME,
    isPublished: true,
    footer: api.EMPTY_FOOTER,
    payments: { ...api.DEFAULT_PAYMENTS, acceptCod: true },
    shipping: { mode: 'DELIVERY', rate: api.DEFAULT_SHIPPING_RATE },
    checkout: api.DEFAULT_CHECKOUT_FIELDS,
    categories: [
      {
        id: 'c1',
        name: 'Phones',
        slug: 'phones',
        imageUrl: null,
        isFeatured: false,
        productCount: count,
        subcategories: [],
      },
    ],
  }
}

const catalog = Array.from({ length: 12 }, (_, i) => product(`p${i}`, `Plain phone ${i}`))
const best = product('b1', 'Champion phone')
const featured = product('f1', 'Spotlight phone')
const fresh = product('n1', 'Brand new phone')

function home(overrides: Partial<PublicStoreHome> = {}): PublicStoreHome {
  return {
    sections: api.HOMEPAGE_SECTION_KEYS.map((key) => ({ key, enabled: true })),
    banners: [],
    featuredCategories: [],
    featured: [featured],
    newArrivals: [fresh],
    bestSellers: [best],
    categoryRows: [],
    catalog: [...catalog.slice(0, 9), best, featured, fresh],
    ...overrides,
  }
}

function render(store: PublicStore, data: PublicStoreHome): string {
  return renderToStaticMarkup(
    h(MemoryRouter, null, h(page.StoreHomeView, { store, skin: theme.SKIN, home: data })),
  )
}

test('a big shop draws a row for every enabled product section', () => {
  const html = render(shop(30), home())
  for (const title of ['Featured Products', 'New Arrivals', 'Best Sellers', 'All Products']) {
    assert.ok(html.includes(title), `missing the "${title}" row`)
  }
})

test('a switched-off section draws nothing, even with products', () => {
  const data = home({
    sections: api.HOMEPAGE_SECTION_KEYS.map((key) => ({
      key,
      enabled: key !== 'bestSellers',
    })),
  })
  assert.ok(!render(shop(30), data).includes('Best Sellers'))
})

test('a small shop shows each product once, marked products first in All Products', () => {
  const html = render(shop(12), home())
  assert.ok(!html.includes('Best Sellers'), 'a small shop has no separate Best Sellers row')
  assert.ok(html.includes('All Products'))
  // Featured, then Best Seller, then New Arrival, then the rest.
  const at = (name: string) => html.indexOf(name)
  assert.ok(at('Spotlight phone') < at('Champion phone'))
  assert.ok(at('Champion phone') < at('Brand new phone'))
  assert.ok(at('Brand new phone') < at('Plain phone 0'))
  // Drawn once each.
  assert.equal(html.split('Champion phone').length - 1, html.split('Plain phone 0').length - 1)
})

test('trust facts show with AND without a banner', () => {
  const banner = { id: 'b', title: 'Sale', imageUrl: null, href: null, external: false }
  for (const banners of [[], [banner]]) {
    const html = render(shop(30), home({ banners }))
    assert.ok(html.includes('Home delivery'), `no "Home delivery" with ${banners.length} banner(s)`)
    assert.ok(html.includes('Cash on delivery available'))
  }
})

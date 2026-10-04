// Page shells: /, /sell, /store/** and /c/** come back as the storefront's index.html
// with THAT page's head written in (what WhatsApp/Facebook/non-JS crawlers
// read), and a dead slug is a real 404 instead of the SPA fallback's 200.
//
// Read-only — it uses whichever published store, product and category the
// target already has, so it needs no QA accounts. The target backend must
// have a frontend build to read (`npm run build` in frontend/ locally).
import { test } from "node:test";
import assert from "node:assert/strict";
import { API_BASE } from "./helpers.mjs";

async function page(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Accept: "text/html" } });
  const html = await res.text();
  const region = /<!-- seo:start -->([\s\S]*?)<!-- seo:end -->/.exec(html)?.[1] ?? "";
  const tag = (re) => re.exec(region)?.[1] ?? null;
  return {
    status: res.status,
    headers: res.headers,
    html,
    title: tag(/<title[^>]*>([^<]*)<\/title>/),
    robots: tag(/<meta name="robots" content="([^"]*)"/),
    canonical: tag(/<link rel="canonical" href="([^"]*)"/),
    ogType: tag(/<meta property="og:type" content="([^"]*)"/),
    jsonLd: [...region.matchAll(/<script type="application\/ld\+json" data-seo>([\s\S]*?)<\/script>/g)].map(
      (m) => JSON.parse(m[1]),
    ),
  };
}

async function api(path) {
  const res = await fetch(`${API_BASE}/api/v1${path}`);
  return (await res.json()).data;
}

/** A published store that has at least one product and one category. */
async function liveStore() {
  for (const store of await api("/public/stores?pageSize=20")) {
    const products = await api(`/public/stores/${store.slug}/products?pageSize=1`);
    const shell = await api(`/public/stores/${store.slug}`);
    if (products.length && shell.categories.length) {
      return { store: shell, product: products[0], category: shell.categories[0] };
    }
  }
  return null;
}

test("store home: the store's own head, a Store/Organization block, no helmet headers", async (t) => {
  const live = await liveStore();
  if (!live) return t.skip("no published store with products on this target");
  const p = await page(`/store/${live.store.slug}`);
  assert.equal(p.status, 200);
  assert.match(p.headers.get("content-type"), /^text\/html/);
  assert.equal(p.headers.get("cache-control"), "no-cache");
  // Helmet's API headers must not reach a document (no-referrer breaks the
  // referrer-restricted Maps key on every page opened afterwards).
  assert.equal(p.headers.get("referrer-policy"), null);
  assert.ok(p.title.startsWith(live.store.name.replace(/&/g, "&amp;")), p.title);
  assert.equal(p.robots, "index, follow");
  assert.ok(p.canonical.endsWith(`/store/${live.store.slug}`), p.canonical);
  assert.ok(["Store", "Organization"].includes(p.jsonLd[0]["@type"]));
  // The platform defaults ride along for the SPA to fall back to.
  assert.match(p.html, /<title data-default="[^"]+">/);
  // The app itself is untouched.
  assert.match(p.html, /<div id="root">/);
});

test("product page: Product + BreadcrumbList, og:type product", async (t) => {
  const live = await liveStore();
  if (!live) return t.skip("no published store with products on this target");
  const p = await page(`/store/${live.store.slug}/product/${live.product.slug}?utm_source=whatsapp`);
  assert.equal(p.status, 200);
  assert.equal(p.ogType, "product");
  // Tracking params never reach the canonical.
  assert.ok(p.canonical.endsWith(`/store/${live.store.slug}/product/${live.product.slug}`), p.canonical);
  assert.deepEqual(
    p.jsonLd.map((block) => block["@type"]),
    ["Product", "BreadcrumbList"],
  );
  assert.equal(p.jsonLd[0].offers.priceCurrency, "INR");
});

test("platform pages: / and /sell carry their own head with absolute URLs", async () => {
  const home = await page("/");
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("referrer-policy"), null);
  assert.equal(home.robots, "index, follow");
  assert.match(home.canonical, /^https?:\/\/[^/]+\/$/);
  assert.deepEqual(home.jsonLd.map((block) => block["@type"]), ["WebSite"]);
  assert.match(home.html, /<div id="root">/);

  const sell = await page("/sell?utm_source=instagram");
  assert.equal(sell.status, 200);
  assert.match(sell.title, /^Create your free online store · UnieMax/);
  assert.match(sell.canonical, /^https?:\/\/[^/]+\/sell$/);

  // Scrapers cannot resolve a relative og:image; every shell makes it absolute.
  for (const p of [home, sell]) {
    assert.match(p.html, /<meta property="og:image" content="https?:\/\/[^"]+"/);
  }
});

test("link-preview images are small JPEGs (WhatsApp drops big ones)", async (t) => {
  const live = await liveStore();
  if (!live) return t.skip("no published store with products on this target");
  for (const path of [
    `/store/${live.store.slug}`,
    `/store/${live.store.slug}/product/${live.product.slug}`,
  ]) {
    const html = await (await fetch(`${API_BASE}${path}`)).text();
    const image = /<meta property="og:image" content="([^"]*)"/.exec(html)?.[1];
    assert.ok(image, `${path}: og:image`);
    if (!image.includes("/api/v1/public/images/")) continue; // no logo / photo → platform default
    // The URL's origin is PUBLIC_WEB_URL; fetch the path from the target.
    const res = await fetch(`${API_BASE}${new URL(image).pathname}`);
    const bytes = (await res.arrayBuffer()).byteLength;
    assert.equal(res.status, 200, image);
    assert.equal(res.headers.get("content-type"), "image/jpeg", image);
    assert.ok(bytes <= 300 * 1024, `${image}: ${bytes} bytes`);
  }
});

test("store pages preview with the wide store card, not the square logo", async (t) => {
  const live = await liveStore();
  if (!live?.store.logoUrl) return t.skip("no published store with a logo on this target");
  const html = await (await fetch(`${API_BASE}/store/${live.store.slug}`)).text();
  const image = /<meta property="og:image" content="([^"]*)"/.exec(html)?.[1];
  assert.match(image, /\/api\/v1\/public\/images\/card\/logo\/.+\.jpg$/);
  const bytes = Buffer.from(await (await fetch(`${API_BASE}${new URL(image).pathname}`)).arrayBuffer());
  // JPEG SOFn marker carries height then width; find the first frame header.
  let size = null;
  for (let i = 2; i < bytes.length - 9; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] >= 0xc0 && bytes[i + 1] <= 0xc2) {
      size = { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
      break;
    }
  }
  assert.deepEqual(size, { width: 1200, height: 630 });
});

test("category and shop pages; scoped listings are noindex", async (t) => {
  const live = await liveStore();
  if (!live) return t.skip("no published store with products on this target");
  const slug = live.store.slug;

  const category = await page(`/store/${slug}/category/${live.category.slug}`);
  assert.equal(category.status, 200);
  assert.equal(category.jsonLd[0]["@type"], "BreadcrumbList");

  assert.equal((await page(`/store/${slug}/shop`)).robots, "index, follow");
  assert.equal((await page(`/store/${slug}/shop?q=anything`)).robots, "noindex, follow");
  assert.equal((await page(`/store/${slug}/shop?section=featured`)).robots, "noindex, follow");
});

test("dead slugs are real 404s that still carry the app shell", async (t) => {
  const live = await liveStore();
  if (!live) return t.skip("no published store with products on this target");
  const slug = live.store.slug;

  for (const path of [
    "/store/no-such-store-zz9",
    `/store/${slug}/product/no-such-product-zz9`,
    `/store/${slug}/category/no-such-category-zz9`,
    `/store/${slug}/no-such-page`,
    "/c/no-such-category-zz9",
  ]) {
    const p = await page(path);
    assert.equal(p.status, 404, path);
    assert.equal(p.robots, "noindex, follow", path);
    assert.match(p.html, /<div id="root">/, path);
  }
});

test("/c/{slug}: the bare page is indexable, page 2 and re-sorts are not", async (t) => {
  const [node] = await api("/public/browse");
  if (!node) return t.skip("no browsable category on this target");

  const bare = await page(`/c/${node.slug}`);
  assert.equal(bare.status, 200);
  assert.equal(bare.robots, "index, follow");
  assert.deepEqual(
    bare.jsonLd.map((block) => block["@type"]),
    ["BreadcrumbList", "ItemList"],
  );
  assert.ok(bare.canonical.endsWith(`/c/${node.slug}`));

  for (const query of ["?page=2", "?sort=priceAsc"]) {
    const scoped = await page(`/c/${node.slug}${query}`);
    assert.equal(scoped.robots, "noindex, follow", query);
    assert.ok(scoped.canonical.endsWith(`/c/${node.slug}`), query);
  }
});

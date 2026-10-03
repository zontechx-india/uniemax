// Sized copies: every stored photo is served at the published widths (the
// storefront's srcset candidates), and nothing else is.
//
// Read-only — uses whichever published product photo the target has, so it
// needs no QA accounts.
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { API_BASE } from "./helpers.mjs";

async function api(path) {
  const res = await fetch(`${API_BASE}/api/v1${path}`);
  return (await res.json()).data;
}

/** The delivery config and a stored product photo's bucket + key. */
async function storedPhoto() {
  const { images } = await api("/public/media-config");
  for (const store of await api("/public/stores?pageSize=20")) {
    for (const product of await api(`/public/stores/${store.slug}/products?pageSize=5`)) {
      const url = product.image?.url;
      const source = url && images.sources.find((s) => url.startsWith(s.root));
      if (source) return { images, bucket: source.bucket, key: url.slice(source.root.length) };
    }
  }
  return null;
}

const sized = (width, bucket, key) => `${API_BASE}/api/v1/public/images/w/${width}/${bucket}/${key}`;

test("media-config publishes where sized copies live", async () => {
  const { images } = await api("/public/media-config");
  assert.deepEqual(images.widths, [320, 640, 960, 1280]);
  assert.ok(images.sources.length > 0);
  for (const source of images.sources) {
    assert.ok(source.root.endsWith("/"), source.root);
    assert.ok(source.maxWidth > Math.min(...images.widths), `${source.bucket} maxWidth`);
  }
  assert.doesNotThrow(() => new RegExp(images.keyPattern));
});

test("every published width is a WebP no wider than asked, cached forever", async (t) => {
  const photo = await storedPhoto();
  if (!photo) return t.skip("no stored product photo on this target");
  for (const width of photo.images.widths) {
    const res = await fetch(sized(width, photo.bucket, photo.key));
    assert.equal(res.status, 200, `w${width}`);
    assert.equal(res.headers.get("content-type"), "image/webp");
    assert.match(res.headers.get("cache-control") ?? "", /immutable/);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    assert.equal(meta.format, "webp");
    assert.ok(meta.width <= width, `w${width} came back ${meta.width} px wide`);
  }
});

test("unpublished widths, derived keys and other buckets are refused", async (t) => {
  const photo = await storedPhoto();
  if (!photo) return t.skip("no stored product photo on this target");
  for (const url of [
    sized(500, photo.bucket, photo.key),
    sized(640, photo.bucket, `derived/w640/${photo.key}`),
    sized(640, "secrets", photo.key),
  ]) {
    assert.equal((await fetch(url)).status, 422, url);
  }
  assert.equal((await fetch(sized(640, photo.bucket, "products/no-such-photo.webp"))).status, 404);
});
